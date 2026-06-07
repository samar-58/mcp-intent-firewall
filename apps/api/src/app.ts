import express from "express";
import { GeminiAgent } from "./agent";
import { McpRegistry } from "./mcp";
import {
  approveRequest,
  createMcpServer,
  createPolicyRule,
  denyRequest,
  getApprovalRequest,
  listApprovals,
  listConversations,
  listToolCallLogs,
  loadMcpServers,
  loadPolicyRules,
  saveAgentRun,
  saveApprovalResume,
  updatePolicyRule,
} from "./db/controlPlaneStore";
import { PolicyCache } from "./policy/policyCache";
import { addSseClient, publishEvent } from "./realtime/eventBus";

export async function createApiApp() {
  const app = express();
  const registry = new McpRegistry();
  const policyCache = new PolicyCache(loadPolicyRules);

  app.use(express.json());

  await registry.refresh(await loadMcpServers());
  await policyCache.refresh();

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      service: "mcp-intent-firewall-api",
    });
  });

  app.get("/api/events", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const cleanup = addSseClient(response);
    request.on("close", cleanup);
  });

  app.get("/api/mcp/servers", async (_request, response) => {
    response.json({
      servers: await loadMcpServers(),
      health: registry.getHealth(),
    });
  });

  app.get("/api/mcp/tools", (_request, response) => {
    response.json({
      tools: registry.getTools(),
    });
  });

  app.post("/api/mcp/servers", async (request, response) => {
    try {
      const server = await createMcpServer({
        id: request.body.id ?? crypto.randomUUID(),
        name: request.body.name,
        transport: "STDIO",
        command: request.body.command,
        args: request.body.args ?? [],
        env: request.body.env ?? {},
        enabled: request.body.enabled ?? true,
      });

      await registry.refresh(await loadMcpServers());
      publishEvent("mcp.tools_refreshed", {
        health: registry.getHealth(),
        tools: registry.getTools(),
      });

      response.status(201).json({ server });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/mcp/refresh", async (_request, response) => {
    await registry.refresh(await loadMcpServers());

    const payload = {
      health: registry.getHealth(),
      tools: registry.getTools(),
    };

    publishEvent("mcp.tools_refreshed", payload);
    response.json(payload);
  });

  app.get("/api/policies", async (_request, response) => {
    response.json({
      policies: policyCache.all(),
    });
  });

  app.post("/api/policies", async (request, response) => {
    try {
      const policy = await createPolicyRule({
        id: request.body.id ?? crypto.randomUUID(),
        name: request.body.name,
        enabled: request.body.enabled ?? true,
        effect: request.body.effect,
        scope: request.body.scope ?? {},
        condition: request.body.condition ?? { kind: "always" },
        priority: request.body.priority ?? 100,
      });

      await policyCache.refresh();
      publishEvent("policy.updated", { policy });
      response.status(201).json({ policy });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.patch("/api/policies/:id", async (request, response) => {
    try {
      const policy = await updatePolicyRule(request.params.id, request.body);

      await policyCache.refresh();
      publishEvent("policy.updated", { policy });
      response.json({ policy });
    } catch {
      response.status(404).json({ error: "Policy not found" });
    }
  });

  app.get("/api/conversations", async (_request, response) => {
    response.json({ conversations: await listConversations() });
  });

  app.get("/api/logs/tool-calls", async (_request, response) => {
    response.json({ logs: await listToolCallLogs() });
  });

  app.get("/api/approvals", async (_request, response) => {
    response.json({ approvals: await listApprovals() });
  });

  app.post("/api/approvals/:id/approve", async (request, response) => {
    const approval = await getApprovalRequest(request.params.id);

    if (!approval || approval.status !== "PENDING") {
      response.status(404).json({ error: "Pending approval not found" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      response.status(503).json({
        error: "GEMINI_API_KEY is required to resume the approved agent run",
      });
      return;
    }

    const functionCall = approval.geminiFunctionCallJson as any;
    const intent = approval.intentJson as any;
    const decision = approval.decisionJson as any;
    const contents = Array.isArray(approval.agentContentsJson)
      ? (approval.agentContentsJson as any[])
      : [];

    if (contents.length === 0) {
      response.status(409).json({
        error: "Approval is missing saved agent state and cannot be resumed",
      });
      return;
    }

    const result = await registry.callTool(
      functionCall.name,
      functionCall.args ?? {},
    );
    const updated = await approveRequest(approval.id, result);
    const agent = new GeminiAgent({ registry });
    const resumed = await agent.resumeAfterApproval({
      conversationId: approval.conversationId,
      userMessage: intent.userMessage ?? "Resumed after human approval",
      contents,
      functionCall,
      approvedResult: result,
      decision,
      policyRules: [],
      loadPolicyRules: async () => policyCache.active(),
    });

    await saveApprovalResume({
      conversationId: approval.conversationId,
      result: resumed,
    });

    publishEvent("approval.updated", { approval: updated });
    publishEvent("tool_call.logged", { approval: updated, result });
    publishEvent("conversation.updated", { conversationId: approval.conversationId });

    response.json({ approval: updated, result, resumed });
  });

  app.post("/api/approvals/:id/deny", async (request, response) => {
    const approval = await getApprovalRequest(request.params.id);

    if (!approval || approval.status !== "PENDING") {
      response.status(404).json({ error: "Pending approval not found" });
      return;
    }

    const updated = await denyRequest(approval.id);

    publishEvent("approval.updated", { approval: updated });
    publishEvent("tool_call.logged", { approval: updated });

    response.json({ approval: updated });
  });

  app.post("/api/chat", async (request, response) => {
    const message = String(request.body?.message ?? "").trim();

    if (!message) {
      response.status(400).json({ error: "message is required" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      response.status(503).json({
        error: "GEMINI_API_KEY is required for live chat",
      });
      return;
    }

    const conversationId = request.body?.conversationId ?? crypto.randomUUID();
    const agent = new GeminiAgent({ registry });
    const result = await agent.run({
      conversationId,
      userMessage: message,
      policyRules: [],
      loadPolicyRules: async () => policyCache.active(),
    });

    for (const toolEvent of result.toolEvents) {
      publishEvent("tool_call.logged", toolEvent);
    }

    await saveAgentRun({ conversationId, userMessage: message, result });

    response.json({
      conversationId,
      status: result.status,
      message: result.finalResponse,
      toolEvents: result.toolEvents,
      tokenUsage: result.tokenUsage,
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: "Not found",
    });
  });

  return { app, registry };
}
