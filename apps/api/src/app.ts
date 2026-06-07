import express from "express";
import { GeminiAgent } from "./agent";
import { McpRegistry } from "./mcp";
import {
  listConversations,
  listToolCallLogs,
  loadMcpServers,
  loadPolicyRules,
  saveAgentRun,
  updatePolicyRule,
} from "./db/controlPlaneStore";
import { addSseClient, publishEvent } from "./realtime/eventBus";

export async function createApiApp() {
  const app = express();
  const registry = new McpRegistry();

  app.use(express.json());

  await registry.refresh(await loadMcpServers());

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
      policies: await loadPolicyRules(),
    });
  });

  app.patch("/api/policies/:id", async (request, response) => {
    try {
      const policy = await updatePolicyRule(request.params.id, request.body);

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
    const policyRules = await loadPolicyRules();
    const result = await agent.run({
      conversationId,
      userMessage: message,
      policyRules: policyRules.filter((rule) => rule.enabled),
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
