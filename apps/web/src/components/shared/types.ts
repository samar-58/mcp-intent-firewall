export type McpTool = {
  serverName: string;
  toolName: string;
  normalizedName: string;
  description?: string;
};

export type McpHealth = {
  serverName: string;
  status: string;
  error?: string;
  discoveredToolCount: number;
};

export type Policy = {
  id: string;
  name: string;
  enabled: boolean;
  effect: string;
  scope: { toolName?: string };
  condition?: { kind?: string; path?: string; values?: unknown[] };
  priority: number;
};

export type ToolLog = {
  id: string;
  serverName: string;
  toolName: string;
  decision: string;
  outcome: string;
  argsJson?: Record<string, unknown>;
  matchedRulesJson?: Array<{ name?: string; effect?: string }>;
  createdAt: string;
  error?: string;
};

export type Conversation = {
  id: string;
  updatedAt: string;
  messages: Array<{ role: string; contentJson: { text?: string } }>;
  agentRuns?: Array<{ tokenUsageJson?: TokenUsage }>;
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  // Supports logs created before the AI SDK provider migration.
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

export type Approval = {
  id: string;
  status: string;
  intentJson: {
    serverName?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  createdAt: string;
};

export type ToolPermission = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";

export type NavSection =
  | "dashboard"
  | "policies"
  | "registry"
  | "audit"
  | "history";
