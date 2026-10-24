import type { RuntimeExecuteResponse } from "@osva-ai/runtime-protocol";

interface CacheEntry {
  readonly response: RuntimeExecuteResponse;
  readonly expiresAt: number;
  readonly inputFingerprint: string;
}

interface InFlightEntry {
  readonly promise: Promise<RuntimeExecuteResponse>;
  readonly inputFingerprint: string;
}

export class ExecutionIdentityConflictError extends Error {
  constructor(executionId: string) {
    super(
      `Duplicate executionId "${executionId}" with a different run input payload.`,
    );
    this.name = "ExecutionIdentityConflictError";
  }
}

/**
 * In-memory execution deduplication and concurrency gate.
 *
 * After process restart, cache and in-flight state are lost; the same
 * executionId may run again. This is not durable exactly-once semantics.
 */
export class ExecutionRegistry {
  private readonly inFlight = new Map<string, InFlightEntry>();
  private readonly completed = new Map<string, CacheEntry>();
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxCompletedEntries: number,
    private readonly completedTtlMs: number,
  ) {}

  getActiveCount(): number {
    return this.activeCount;
  }

  pruneCompleted(now = Date.now()): void {
    for (const [key, entry] of this.completed) {
      if (entry.expiresAt <= now) {
        this.completed.delete(key);
      }
    }
    while (this.completed.size > this.maxCompletedEntries) {
      const firstKey = this.completed.keys().next().value;
      if (firstKey === undefined) {
        break;
      }
      this.completed.delete(firstKey);
    }
  }

  getCached(
    executionId: string,
    now = Date.now(),
  ): RuntimeExecuteResponse | undefined {
    return this.getCachedEntry(executionId, now)?.response;
  }

  private getCachedEntry(
    executionId: string,
    now = Date.now(),
  ): CacheEntry | undefined {
    this.pruneCompleted(now);
    const hit = this.completed.get(executionId);
    if (hit === undefined || hit.expiresAt <= now) {
      if (hit !== undefined) {
        this.completed.delete(executionId);
      }
      return undefined;
    }
    return hit;
  }

  async coalesce(
    executionId: string,
    inputFingerprint: string,
    run: () => Promise<RuntimeExecuteResponse>,
    onDuplicate?: () => void,
  ): Promise<RuntimeExecuteResponse> {
    const cached = this.getCachedEntry(executionId);
    if (cached !== undefined) {
      if (cached.inputFingerprint !== inputFingerprint) {
        throw new ExecutionIdentityConflictError(executionId);
      }
      onDuplicate?.();
      return cached.response;
    }

    const existing = this.inFlight.get(executionId);
    if (existing !== undefined) {
      if (existing.inputFingerprint !== inputFingerprint) {
        throw new ExecutionIdentityConflictError(executionId);
      }
      onDuplicate?.();
      return existing.promise;
    }

    let resolve!: (value: RuntimeExecuteResponse) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<RuntimeExecuteResponse>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.inFlight.set(executionId, { promise, inputFingerprint });

    await this.acquireSlot();

    void (async () => {
      try {
        const response = await run();
        this.rememberCompleted(executionId, inputFingerprint, response);
        resolve(response);
      } catch (error) {
        reject(error);
      } finally {
        this.inFlight.delete(executionId);
        this.releaseSlot();
      }
    })();

    return promise;
  }

  rememberCompleted(
    executionId: string,
    inputFingerprint: string,
    response: RuntimeExecuteResponse,
    now = Date.now(),
  ): void {
    this.completed.set(executionId, {
      response,
      inputFingerprint,
      expiresAt: now + this.completedTtlMs,
    });
    this.pruneCompleted(now);
  }

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.waitQueue.shift();
    if (next !== undefined) {
      next();
    }
  }
}
