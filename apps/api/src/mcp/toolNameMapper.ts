export function normalizeToolName(serverName: string, toolName: string) {
  const rawName = `${serverName}__${toolName}`.toLowerCase();
  const safeName = rawName.replace(/[^a-z0-9_]/g, "_");

  return safeName.replace(/^_+|_+$/g, "");
}
