import express from "express";
import { fileURLToPath } from "node:url";
import type {
  McpServerDefinition,
  PolicyRuleDefinition,
} from "@mcp-intent-firewall/shared";
import { GeminiAgent } from "./agent";
import { McpRegistry } from "./mcp";
import { addSseClient, publishEvent } from "./realtime/eventBus";

export async function createApiApp() {
  const app = express();
  const registry = new McpRegistry();
  const mcpServers = defaultMcpServers();
  const policyRules = defaultPolicyRules();

  app.use(express.json());

  await registry.refresh(mcpServers);

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

  app.get("/api/mcp/servers", (_request, response) => {
    response.json({
      servers: mcpServers,
      health: registry.getHealth(),
    });
  });

  app.get("/api/mcp/tools", (_request, response) => {
    response.json({
      tools: registry.getTools(),
    });
  });

  app.post("/api/mcp/refresh", async (_request, response) => {
    await registry.refresh(mcpServers);

    const payload = {
      health: registry.getHealth(),
      tools: registry.getTools(),
    };

    publishEvent("mcp.tools_refreshed", payload);
    response.json(payload);
  });

  app.get("/api/policies", (_request, response) => {
    response.json({ policies: policyRules });
  });

  app.patch("/api/policies/:id", (request, response) => {
    const policy = policyRules.find((rule) => rule.id === request.params.id);

    if (!policy) {
      response.status(404).json({ error: "Policy not found" });
      return;
    }

    Object.assign(policy, request.body, { id: policy.id });
    publishEvent("policy.updated", { policy });

    response.json({ policy });
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
      policyRules: policyRules.filter((rule) => rule.enabled),
    });

    for (const toolEvent of result.toolEvents) {
      publishEvent("tool_call.logged", toolEvent);
    }

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

  return { app, registry, mcpServers, policyRules };
}

function defaultMcpServers(): McpServerDefinition[] {
  return [
    {
      id: "incidentops-local",
      name: "incidentops",
      transport: "STDIO",
      command: "bun",
      args: ["packages/custom-mcp/src/incidentOpsServer.ts"],
      cwd: repoRoot(),
      enabled: true,
    },
  ];
}

function defaultPolicyRules(): PolicyRuleDefinition[] {
  return [
    {
      id: "rule_page_on_call_approval",
      name: "Require approval before paging on-call",
      enabled: true,
      effect: "REQUIRE_APPROVAL",
      scope: { toolName: "page_on_call" },
      condition: { kind: "always" },
      priority: 20,
    },
    {
      id: "rule_block_close_incident",
      name: "Block model from closing incidents",
      enabled: true,
      effect: "BLOCK",
      scope: { toolName: "update_incident_status" },
      condition: { kind: "argsEquals", path: "status", value: "closed" },
      priority: 10,
    },
  ];
}

function repoRoot() {
  return fileURLToPath(new URL("../../../", import.meta.url));
}
