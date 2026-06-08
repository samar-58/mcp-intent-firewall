import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { AiSdkAgent, type AgentToolCall } from "./agent";
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
    try {
      const approval = await getApprovalRequest(request.params.id);

      if (!approval || approval.status !== "PENDING") {
        response.status(404).json({ error: "Pending approval not found" });
        return;
      }

      if (!hasGatewayCredentials()) {
        response.status(503).json({
          error: "AI_GATEWAY_API_KEY is required to resume the approved agent run",
        });
        return;
      }

      const functionCall = normalizeSavedToolCall(
        approval.toolCallJson,
      );
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
        functionCall.toolName,
        functionCall.input,
      );
      const updated = await approveRequest(approval.id, result);
      const agent = new AiSdkAgent({ registry });
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
      for (const toolEvent of resumed.toolEvents) {
        publishEvent("tool_call.logged", toolEvent);
      }
      publishEvent("conversation.updated", {
        conversationId: approval.conversationId,
        finalResponse: resumed.finalResponse,
      });

      response.json({ approval: updated, result, resumed });
    } catch (error) {
      sendAgentError(response, error);
    }
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

    if (!hasGatewayCredentials()) {
      response.status(503).json({
        error: "AI_GATEWAY_API_KEY is required for live chat",
      });
      return;
    }

    try {
      const conversationId = request.body?.conversationId ?? crypto.randomUUID();
      const agent = new AiSdkAgent({ registry });
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
    } catch (error) {
      sendAgentError(response, error);
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: "Not found",
    });
  });

  if (shouldServeWeb()) {
    const distPath = webDistPath();

    if (existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get(/.*/, (_request, response) => {
        response.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return { app, registry };
}

function shouldServeWeb() {
  return process.env.NODE_ENV === "production" || process.env.SERVE_WEB === "true";
}

function webDistPath() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  return path.resolve(currentDir, "../../web/dist");
}

function sendAgentError(response: express.Response, error: unknown) {
  const normalized = normalizeAgentError(error);

  response.status(normalized.status).json(normalized.body);
}

export function normalizeAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const retryAfterSeconds = retryDelaySeconds(message);

  if (
    message.includes("requires a valid credit card") ||
    message.includes("add a card and unlock your free credits")
  ) {
    return {
      status: 402,
      body: {
        error:
          "AI Gateway requires a valid credit card on file before it can use free credits.",
        code: "AI_GATEWAY_BILLING_REQUIRED",
        detail: message,
      },
    };
  }

  if (
    message.includes('"code":429') ||
    message.includes("Too Many Requests") ||
    message.includes("Free tier requests on this model are rate-limited")
  ) {
    return {
      status: 429,
      body: {
        error: retryAfterSeconds
          ? `AI Gateway quota exceeded. Please retry in about ${retryAfterSeconds} seconds.`
          : "AI Gateway free-tier requests for this model are rate-limited. Retry later, top up paid credits, or switch AI_GATEWAY_MODEL.",
        code: "AI_GATEWAY_RATE_LIMITED",
        retryAfterSeconds,
        detail: message,
      },
    };
  }

  if (message.includes('"code":404') || message.includes("model_not_found")) {
    return {
      status: 502,
      body: {
        error:
          "Configured AI Gateway model is not available. Set AI_GATEWAY_MODEL to a supported provider/model ID.",
        code: "AI_GATEWAY_MODEL_NOT_FOUND",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Agent run failed. Check the API logs for details.",
      code: "AGENT_RUN_FAILED",
      detail: message,
    },
  };
}

function retryDelaySeconds(message: string) {
  const retryInfoMatch = message.match(/"retryDelay":"(\d+)s"/);
  const textMatch = message.match(/retry in ([\d.]+)s/i);
  const seconds = retryInfoMatch?.[1] ?? textMatch?.[1];

  return seconds ? Math.ceil(Number(seconds)) : undefined;
}

function hasGatewayCredentials() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function normalizeSavedToolCall(value: unknown): AgentToolCall {
  const call = value as Record<string, unknown>;

  return {
    toolCallId: String(call.toolCallId ?? call.id ?? crypto.randomUUID()),
    toolName: String(call.toolName ?? call.name ?? ""),
    input: (call.input ?? call.args ?? {}) as Record<string, unknown>,
  };
}
