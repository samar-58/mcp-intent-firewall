import { fileURLToPath } from "node:url";
import type {
  AgentToolEvent,
  AgentRunResult,
} from "../agent";
import type {
  McpServerDefinition,
  PolicyCondition,
  PolicyRuleDefinition,
  PolicyScope,
} from "@mcp-intent-firewall/shared";
import { prisma } from "./prisma";

export async function loadMcpServers(): Promise<McpServerDefinition[]> {
  const rows = await prisma.mcpServerConfig.findMany({
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    transport: "STDIO",
    command: row.command,
    args: arrayOfStrings(row.argsJson),
    env: recordOfStrings(row.envJson),
    cwd: repoRoot(),
    enabled: row.enabled && row.transport === "STDIO",
  }));
}

export async function createMcpServer(input: McpServerDefinition) {
  await prisma.mcpServerConfig.create({
    data: {
      id: input.id,
      name: input.name,
      transport: input.transport,
      command: input.command,
      argsJson: input.args,
      envJson: input.env ?? {},
      enabled: input.enabled,
    },
  });

  return input;
}

export async function loadPolicyRules(): Promise<PolicyRuleDefinition[]> {
  const rows = await prisma.policyRule.findMany({
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    effect: row.effect,
    scope: row.scopeJson as PolicyScope,
    condition: row.conditionJson as PolicyCondition,
    priority: row.priority,
  }));
}

export async function updatePolicyRule(
  id: string,
  patch: Partial<PolicyRuleDefinition>,
) {
  const updated = await prisma.policyRule.update({
    where: { id },
    data: {
      name: patch.name,
      enabled: patch.enabled,
      effect: patch.effect,
      scopeJson: patch.scope,
      conditionJson: patch.condition,
      priority: patch.priority,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    enabled: updated.enabled,
    effect: updated.effect,
    scope: updated.scopeJson as PolicyScope,
    condition: updated.conditionJson as PolicyCondition,
    priority: updated.priority,
  };
}

export async function createPolicyRule(rule: PolicyRuleDefinition) {
  const created = await prisma.policyRule.create({
    data: {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      effect: rule.effect,
      scopeJson: rule.scope,
      conditionJson: rule.condition,
      priority: rule.priority,
    },
  });

  return {
    id: created.id,
    name: created.name,
    enabled: created.enabled,
    effect: created.effect,
    scope: created.scopeJson as PolicyScope,
    condition: created.conditionJson as PolicyCondition,
    priority: created.priority,
  };
}

export async function saveAgentRun(params: {
  conversationId: string;
  userMessage: string;
  result: AgentRunResult;
}) {
  await prisma.conversation.upsert({
    where: { id: params.conversationId },
    update: { updatedAt: new Date() },
    create: { id: params.conversationId },
  });

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: "user",
      contentJson: { text: params.userMessage },
    },
  });

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: "assistant",
      contentJson: { text: params.result.finalResponse },
    },
  });

  await prisma.agentRunLog.create({
    data: {
      conversationId: params.conversationId,
      userMessage: params.userMessage,
      finalResponse: params.result.finalResponse,
      tokenUsageJson: jsonValue(params.result.tokenUsage ?? {}),
    },
  });

  for (const event of params.result.toolEvents) {
    await saveToolEvent(params.conversationId, event);

    if (event.kind === "approval_required") {
      await prisma.approvalRequest.create({
        data: {
          conversationId: params.conversationId,
          intentJson: jsonValue(event.intent),
          geminiFunctionCallJson: jsonValue({
            name: event.intent.normalizedFunctionName,
            args: event.intent.args,
          }),
          agentContentsJson: jsonValue(params.result.contents),
          decisionJson: jsonValue(event.decision),
        },
      });
    }
  }
}

export async function saveApprovalResume(params: {
  conversationId: string;
  result: AgentRunResult;
}) {
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: "assistant",
      contentJson: { text: params.result.finalResponse },
    },
  });

  await prisma.agentRunLog.create({
    data: {
      conversationId: params.conversationId,
      userMessage: "Resumed after human approval",
      finalResponse: params.result.finalResponse,
      tokenUsageJson: jsonValue(params.result.tokenUsage ?? {}),
    },
  });

  for (const event of params.result.toolEvents.slice(1)) {
    await saveToolEvent(params.conversationId, event);
  }
}

export async function listApprovals() {
  return prisma.approvalRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getApprovalRequest(id: string) {
  return prisma.approvalRequest.findUnique({ where: { id } });
}

export async function approveRequest(id: string, result: unknown) {
  const approval = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      resultJson: jsonValue(result),
      resolvedAt: new Date(),
    },
  });
  const intent = approval.intentJson as any;
  const decision = approval.decisionJson as any;

  await prisma.toolCallLog.create({
    data: {
      conversationId: approval.conversationId,
      serverName: intent.serverName ?? "unknown",
      toolName: intent.toolName ?? "unknown",
      normalizedFunctionName: intent.normalizedFunctionName ?? "unknown",
      argsJson: jsonValue(intent.args ?? {}),
      intentJson: jsonValue(intent),
      decision: decision?.outcome ?? "REQUIRE_APPROVAL",
      matchedRulesJson: jsonValue(decision?.matchedRules ?? []),
      outcome: "APPROVED",
      resultJson: jsonValue(result),
    },
  });

  return approval;
}

export async function denyRequest(id: string) {
  const approval = await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: "DENIED",
      resolvedAt: new Date(),
    },
  });
  const intent = approval.intentJson as any;
  const decision = approval.decisionJson as any;

  await prisma.toolCallLog.create({
    data: {
      conversationId: approval.conversationId,
      serverName: intent.serverName ?? "unknown",
      toolName: intent.toolName ?? "unknown",
      normalizedFunctionName: intent.normalizedFunctionName ?? "unknown",
      argsJson: jsonValue(intent.args ?? {}),
      intentJson: jsonValue(intent),
      decision: decision?.outcome ?? "REQUIRE_APPROVAL",
      matchedRulesJson: jsonValue(decision?.matchedRules ?? []),
      outcome: "DENIED",
    },
  });

  return approval;
}

export async function listConversations() {
  return prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 25,
  });
}

export async function listToolCallLogs() {
  return prisma.toolCallLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

async function saveToolEvent(conversationId: string, event: AgentToolEvent) {
  if (event.kind === "error") {
    await prisma.toolCallLog.create({
      data: {
        conversationId,
        serverName: event.intent?.serverName ?? "unknown",
        toolName: event.intent?.toolName ?? "unknown",
        normalizedFunctionName: event.intent?.normalizedFunctionName ?? "unknown",
        argsJson: jsonValue(event.intent?.args ?? {}),
        intentJson: jsonValue(event.intent ?? {}),
        decision: "BLOCK",
        matchedRulesJson: [],
        outcome: "ERROR",
        error: event.error,
      },
    });
    return;
  }

  await prisma.toolCallLog.create({
    data: {
      conversationId,
      serverName: event.intent.serverName,
      toolName: event.intent.toolName,
      normalizedFunctionName: event.intent.normalizedFunctionName,
      argsJson: jsonValue(event.intent.args),
      intentJson: jsonValue(event.intent),
      decision: event.decision.outcome,
      matchedRulesJson: jsonValue(event.decision.matchedRules),
      outcome: toolOutcome(event.kind),
      resultJson:
        event.kind === "allowed" ? jsonValue(event.result.result) : undefined,
    },
  });
}

function toolOutcome(eventKind: AgentToolEvent["kind"]) {
  switch (eventKind) {
    case "allowed":
      return "ALLOWED";
    case "blocked":
      return "BLOCKED";
    case "approval_required":
      return "PENDING_APPROVAL";
    case "error":
      return "ERROR";
  }
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function recordOfStrings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, String(entry)]),
  );
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function repoRoot() {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}
