import path from "node:path";

export function assertPathUnderRoot(
  workspaceRoot: string,
  requestedPath: string,
): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.includes(`..${path.sep}`)
  ) {
    throw new Error("Working directory escapes configured workspace root.");
  }
  return resolved;
}
