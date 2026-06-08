import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApiApp, normalizeAgentError } from "./app";
import type { McpRegistry } from "./mcp";

let server: Server;
let baseUrl: string;
let registry: McpRegistry;

beforeEach(async () => {
  const created = await createApiApp();
  registry = created.registry;

  server = created.app.listen(0);
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await registry.closeAll();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

describe("API routes", () => {
  test("serves health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "mcp-intent-firewall-api",
    });
  });

  test("exposes live discovered MCP tools", async () => {
    const response = await fetch(`${baseUrl}/api/mcp/tools`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tools.map((tool: { normalizedName: string }) => tool.normalizedName))
      .toContain("incidentops__list_incidents");
  });

  test("updates policies without restart", async () => {
    const policyId = "rule_page_on_call_approval";
    const beforeResponse = await fetch(`${baseUrl}/api/policies`);
    const beforeBody = await beforeResponse.json();
    const before = beforeBody.policies.find(
      (policy: { id: string }) => policy.id === policyId,
    );

    const response = await fetch(
      `${baseUrl}/api/policies/${policyId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.policy.enabled).toBe(false);

    const listResponse = await fetch(`${baseUrl}/api/policies`);
    const listBody = await listResponse.json();
    const updated = listBody.policies.find(
      (policy: { id: string }) => policy.id === "rule_page_on_call_approval",
    );

    expect(updated.enabled).toBe(false);

    await fetch(`${baseUrl}/api/policies/${policyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: before.enabled }),
    });
  });

  test("chat reports missing AI Gateway key instead of pretending to run", async () => {
    const originalKey = process.env.AI_GATEWAY_API_KEY;
    const originalOidc = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "List active incidents" }),
    });
    const body = await response.json();

    process.env.AI_GATEWAY_API_KEY = originalKey;
    process.env.VERCEL_OIDC_TOKEN = originalOidc;

    expect(response.status).toBe(503);
    expect(body.error).toBe("AI_GATEWAY_API_KEY is required for live chat");
  });
});

describe("agent error normalization", () => {
  test("reports AI Gateway billing setup errors clearly", () => {
    const normalized = normalizeAgentError(
      new Error(
        "AI Gateway requires a valid credit card on file to service requests.",
      ),
    );

    expect(normalized.status).toBe(402);
    expect(normalized.body.code).toBe("AI_GATEWAY_BILLING_REQUIRED");
  });

  test("reports AI Gateway free-tier model rate limits clearly", () => {
    const normalized = normalizeAgentError(
      new Error(
        "Failed after 3 attempts. Last error: Free tier requests on this model are rate-limited.",
      ),
    );

    expect(normalized.status).toBe(429);
    expect(normalized.body.code).toBe("AI_GATEWAY_RATE_LIMITED");
  });
});
