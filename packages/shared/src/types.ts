export type PlaceholderStatus = "placeholder" | "ready";

export type ServiceStatus = {
  name: string;
  status: PlaceholderStatus;
};

export type McpTransport = "STDIO";

export type McpServerDefinition = {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
};

export type McpServerStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "error";

export type McpServerHealth = {
  serverId: string;
  serverName: string;
  status: McpServerStatus;
  error?: string;
  discoveredToolCount: number;
};

export type DiscoveredMcpTool = {
  serverId: string;
  serverName: string;
  toolName: string;
  normalizedName: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpToolCallResult = {
  serverId: string;
  serverName: string;
  toolName: string;
  normalizedName: string;
  result: unknown;
};
