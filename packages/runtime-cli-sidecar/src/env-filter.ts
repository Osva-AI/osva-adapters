export function buildChildEnvironment(
  allowlist: readonly string[],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of allowlist) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

export function mergeProviderEnv(
  base: Record<string, string>,
  providerEnv: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...base, ...providerEnv };
}
