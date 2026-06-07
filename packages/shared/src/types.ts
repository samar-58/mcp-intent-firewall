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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type IntentActor = "llm-agent";

export type ToolIntent = {
  id: string;
  conversationId: string;
  actor: IntentActor;
  serverId: string;
  serverName: string;
  toolName: string;
  normalizedFunctionName: string;
  args: Record<string, unknown>;
  userMessage: string;
  riskTags: string[];
  createdAt: string;
};

export type PolicyEffect = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL" | "VALIDATE";

export type PolicyScope = {
  serverId?: string;
  serverName?: string;
  toolName?: string;
  normalizedFunctionName?: string;
};

export type PolicyCondition =
  | { kind: "always" }
  | { kind: "argsEquals"; path: string; value: JsonValue }
  | { kind: "argsNotEquals"; path: string; value: JsonValue }
  | { kind: "argsIn"; path: string; values: JsonValue[] }
  | { kind: "argStringStartsWith"; path: string; prefix: string }
  | { kind: "all"; conditions: PolicyCondition[] }
  | { kind: "any"; conditions: PolicyCondition[] };

export type PolicyRuleDefinition = {
  id: string;
  name: string;
  enabled: boolean;
  effect: PolicyEffect;
  scope: PolicyScope;
  condition: PolicyCondition;
  priority: number;
};

export type MatchedPolicyRule = {
  id: string;
  name: string;
  effect: PolicyEffect;
  priority: number;
  reason: string;
};

export type PolicyDecision =
  | {
      outcome: "ALLOW";
      matchedRules: MatchedPolicyRule[];
      reason: string;
    }
  | {
      outcome: "BLOCK";
      matchedRules: MatchedPolicyRule[];
      reason: string;
    }
  | {
      outcome: "REQUIRE_APPROVAL";
      matchedRules: MatchedPolicyRule[];
      reason: string;
    };
