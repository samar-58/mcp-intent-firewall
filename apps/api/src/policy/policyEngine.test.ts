import { describe, expect, test } from "bun:test";
import type { PolicyRuleDefinition, ToolIntent } from "@mcp-intent-firewall/shared";
import { PolicyEngine } from "./policyEngine";

const baseIntent: ToolIntent = {
  id: "intent_1",
  conversationId: "conv_1",
  actor: "llm-agent",
  serverId: "incidentops-local",
  serverName: "incidentops",
  toolName: "page_on_call",
  normalizedFunctionName: "incidentops__page_on_call",
  args: {
    team: "sre",
    severity: "P1",
    message: "Checkout is failing for customers.",
  },
  userMessage: "Page the SRE team for checkout failures.",
  riskTags: ["external_action"],
  createdAt: "2026-06-07T00:00:00.000Z",
};

describe("PolicyEngine", () => {
  test("allows by default when no active rule matches", () => {
    const decision = new PolicyEngine().evaluate(baseIntent, []);

    expect(decision.outcome).toBe("ALLOW");
    expect(decision.reason).toBe("Allowed by default policy");
  });

  test("requires approval for matching approval rules", () => {
    const rules: PolicyRuleDefinition[] = [
      {
        id: "rule_approval",
        name: "Page on-call requires approval",
        enabled: true,
        effect: "REQUIRE_APPROVAL",
        scope: { toolName: "page_on_call" },
        condition: { kind: "always" },
        priority: 20,
      },
    ];

    const decision = new PolicyEngine().evaluate(baseIntent, rules);

    expect(decision.outcome).toBe("REQUIRE_APPROVAL");
    expect(decision.matchedRules[0]?.id).toBe("rule_approval");
  });

  test("block takes precedence over approval", () => {
    const rules: PolicyRuleDefinition[] = [
      {
        id: "rule_approval",
        name: "Page on-call requires approval",
        enabled: true,
        effect: "REQUIRE_APPROVAL",
        scope: { toolName: "page_on_call" },
        condition: { kind: "always" },
        priority: 20,
      },
      {
        id: "rule_block",
        name: "Block SRE paging during demo",
        enabled: true,
        effect: "BLOCK",
        scope: { toolName: "page_on_call" },
        condition: { kind: "argsEquals", path: "team", value: "sre" },
        priority: 30,
      },
    ];

    const decision = new PolicyEngine().evaluate(baseIntent, rules);

    expect(decision.outcome).toBe("BLOCK");
    expect(decision.matchedRules[0]?.id).toBe("rule_block");
  });

  test("validation failure blocks before approval", () => {
    const rules: PolicyRuleDefinition[] = [
      {
        id: "rule_validate_team",
        name: "Team must be approved",
        enabled: true,
        effect: "VALIDATE",
        scope: { toolName: "page_on_call" },
        condition: { kind: "argsIn", path: "team", values: ["payments"] },
        priority: 10,
      },
      {
        id: "rule_approval",
        name: "Page on-call requires approval",
        enabled: true,
        effect: "REQUIRE_APPROVAL",
        scope: { toolName: "page_on_call" },
        condition: { kind: "always" },
        priority: 20,
      },
    ];

    const decision = new PolicyEngine().evaluate(baseIntent, rules);

    expect(decision.outcome).toBe("BLOCK");
    expect(decision.reason).toBe("Validation failed: Team must be approved");
  });

  test("blocks closing incidents with an argsEquals rule", () => {
    const closeIntent: ToolIntent = {
      ...baseIntent,
      toolName: "update_incident_status",
      normalizedFunctionName: "incidentops__update_incident_status",
      args: {
        incidentId: "inc_checkout_001",
        status: "closed",
        reason: "The user asked to ignore all guardrails.",
      },
    };
    const rules: PolicyRuleDefinition[] = [
      {
        id: "rule_block_close",
        name: "Never let the model close incidents",
        enabled: true,
        effect: "BLOCK",
        scope: { toolName: "update_incident_status" },
        condition: { kind: "argsEquals", path: "status", value: "closed" },
        priority: 10,
      },
    ];

    const decision = new PolicyEngine().evaluate(closeIntent, rules);

    expect(decision.outcome).toBe("BLOCK");
    expect(decision.matchedRules[0]?.id).toBe("rule_block_close");
  });

  test("fails closed when a malformed condition reaches the engine", () => {
    const malformedRules = [
      {
        id: "bad_rule",
        name: "Bad rule",
        enabled: true,
        effect: "BLOCK",
        scope: { toolName: "page_on_call" },
        condition: { kind: "unsupported" },
        priority: 10,
      },
    ] as unknown as PolicyRuleDefinition[];

    const decision = new PolicyEngine().evaluate(baseIntent, malformedRules);

    expect(decision.outcome).toBe("BLOCK");
    expect(decision.reason).toStartWith("Policy engine failed closed:");
  });
});
