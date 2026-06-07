import type { PolicyRuleDefinition } from "@mcp-intent-firewall/shared";

export class PolicyCache {
  private rules: PolicyRuleDefinition[] = [];

  constructor(
    private readonly loadRules: () => Promise<PolicyRuleDefinition[]>,
  ) {}

  async refresh() {
    this.rules = await this.loadRules();
    return this.rules;
  }

  all() {
    return this.rules;
  }

  active() {
    return this.rules.filter((rule) => rule.enabled);
  }
}
