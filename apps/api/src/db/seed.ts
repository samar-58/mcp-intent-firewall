import type { PolicyRuleDefinition } from "@mcp-intent-firewall/shared";
import { prisma } from "./prisma";

const context7Args = process.env.CONTEXT7_API_KEY
  ? ["-y", "@upstash/context7-mcp", "--api-key", process.env.CONTEXT7_API_KEY]
  : ["-y", "@upstash/context7-mcp"];

const policyRules: PolicyRuleDefinition[] = [
  {
    id: "rule_block_close_incident",
    name: "Block model from closing incidents",
    enabled: true,
    effect: "BLOCK",
    scope: { toolName: "update_incident_status" },
    condition: { kind: "argsEquals", path: "status", value: "closed" },
    priority: 10,
  },
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
    id: "rule_validate_page_team",
    name: "Validate page_on_call team",
    enabled: true,
    effect: "VALIDATE",
    scope: { toolName: "page_on_call" },
    condition: {
      kind: "argsIn",
      path: "team",
      values: ["sre", "payments", "security"],
    },
    priority: 5,
  },
  {
    id: "rule_validate_page_severity",
    name: "Validate page_on_call severity",
    enabled: true,
    effect: "VALIDATE",
    scope: { toolName: "page_on_call" },
    condition: {
      kind: "argsIn",
      path: "severity",
      values: ["P1", "P2"],
    },
    priority: 6,
  },
];

await prisma.mcpServerConfig.upsert({
  where: { name: "incidentops" },
  update: {
    transport: "STDIO",
    command: "bun",
    argsJson: ["packages/custom-mcp/src/incidentOpsServer.ts"],
    envJson: {},
    enabled: true,
  },
  create: {
    id: "incidentops-local",
    name: "incidentops",
    transport: "STDIO",
    command: "bun",
    argsJson: ["packages/custom-mcp/src/incidentOpsServer.ts"],
    envJson: {},
    enabled: true,
  },
});

await prisma.mcpServerConfig.upsert({
  where: { name: "context7" },
  update: {
    transport: "STDIO",
    command: "npx",
    argsJson: context7Args,
    envJson: process.env.CONTEXT7_API_KEY
      ? { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY }
      : {},
    enabled: Boolean(process.env.CONTEXT7_API_KEY),
  },
  create: {
    id: "context7",
    name: "context7",
    transport: "STDIO",
    command: "npx",
    argsJson: context7Args,
    envJson: process.env.CONTEXT7_API_KEY
      ? { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY }
      : {},
    enabled: Boolean(process.env.CONTEXT7_API_KEY),
  },
});

for (const rule of policyRules) {
  await prisma.policyRule.upsert({
    where: { id: rule.id },
    update: {
      name: rule.name,
      enabled: rule.enabled,
      effect: rule.effect,
      scopeJson: rule.scope,
      conditionJson: rule.condition,
      priority: rule.priority,
    },
    create: {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      effect: rule.effect,
      scopeJson: rule.scope,
      conditionJson: rule.condition,
      priority: rule.priority,
    },
  });
}

console.log("Seeded MCP servers and default policy rules.");
