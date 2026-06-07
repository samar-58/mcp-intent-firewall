import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApiApp } from "./app";
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
    const response = await fetch(
      `${baseUrl}/api/policies/rule_page_on_call_approval`,
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
  });

  test("chat reports missing Gemini key instead of pretending to run", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "List active incidents" }),
    });
    const body = await response.json();

    process.env.GEMINI_API_KEY = originalKey;

    expect(response.status).toBe(503);
    expect(body.error).toBe("GEMINI_API_KEY is required for live chat");
  });
});
