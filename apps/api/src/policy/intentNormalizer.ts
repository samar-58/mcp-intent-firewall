import type { ToolIntent } from "@mcp-intent-firewall/shared";

type NormalizeIntentInput = {
  conversationId: string;
  userMessage: string;
  serverId: string;
  serverName: string;
  toolName: string;
  normalizedFunctionName: string;
  args: Record<string, unknown>;
};

export function normalizeToolIntent(input: NormalizeIntentInput): ToolIntent {
  return {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    actor: "llm-agent",
    serverId: input.serverId,
    serverName: input.serverName,
    toolName: input.toolName,
    normalizedFunctionName: input.normalizedFunctionName,
    args: input.args,
    userMessage: input.userMessage,
    riskTags: inferRiskTags(input.toolName),
    createdAt: new Date().toISOString(),
  };
}

function inferRiskTags(toolName: string) {
  const normalizedToolName = toolName.toLowerCase();
  const tags = new Set<string>();

  if (
    normalizedToolName.includes("update") ||
    normalizedToolName.includes("delete") ||
    normalizedToolName.includes("create")
  ) {
    tags.add("mutation");
  }

  if (
    normalizedToolName.includes("page") ||
    normalizedToolName.includes("send") ||
    normalizedToolName.includes("notify")
  ) {
    tags.add("external_action");
  }

  if (tags.size === 0) {
    tags.add("read");
  }

  return [...tags].sort();
}
