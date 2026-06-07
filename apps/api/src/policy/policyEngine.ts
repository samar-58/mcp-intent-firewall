import type {
  JsonValue,
  MatchedPolicyRule,
  PolicyCondition,
  PolicyDecision,
  PolicyRuleDefinition,
  ToolIntent,
} from "@mcp-intent-firewall/shared";

type RuleEvaluation = {
  rule: PolicyRuleDefinition;
  scopeMatches: boolean;
  conditionMatches: boolean;
};

export class PolicyEngine {
  evaluate(intent: ToolIntent, rules: PolicyRuleDefinition[]): PolicyDecision {
    try {
      return this.evaluateRules(intent, rules);
    } catch (error) {
      return {
        outcome: "BLOCK",
        matchedRules: [],
        reason: `Policy engine failed closed: ${stringifyError(error)}`,
      };
    }
  }

  private evaluateRules(
    intent: ToolIntent,
    rules: PolicyRuleDefinition[],
  ): PolicyDecision {
    const activeRules = rules
      .filter((rule) => rule.enabled)
      .sort((left, right) => left.priority - right.priority);

    const evaluations = activeRules.map((rule) => ({
      rule,
      scopeMatches: scopeMatches(rule, intent),
      conditionMatches: conditionMatches(rule.condition, intent),
    }));

    const failedValidation = evaluations.find((evaluation) => {
      return (
        evaluation.rule.effect === "VALIDATE" &&
        evaluation.scopeMatches &&
        !evaluation.conditionMatches
      );
    });

    if (failedValidation) {
      return {
        outcome: "BLOCK",
        matchedRules: [matchedRule(failedValidation.rule, "validation failed")],
        reason: `Validation failed: ${failedValidation.rule.name}`,
      };
    }

    const matchingRules = evaluations.filter((evaluation) => {
      if (evaluation.rule.effect === "VALIDATE") {
        return evaluation.scopeMatches && evaluation.conditionMatches;
      }

      return evaluation.scopeMatches && evaluation.conditionMatches;
    });

    const blockRules = matchingRules.filter(
      (evaluation) => evaluation.rule.effect === "BLOCK",
    );

    if (blockRules.length > 0) {
      return {
        outcome: "BLOCK",
        matchedRules: blockRules.map((evaluation) =>
          matchedRule(evaluation.rule, "block rule matched"),
        ),
        reason: `Blocked by policy: ${blockRules[0]?.rule.name}`,
      };
    }

    const approvalRules = matchingRules.filter(
      (evaluation) => evaluation.rule.effect === "REQUIRE_APPROVAL",
    );

    if (approvalRules.length > 0) {
      return {
        outcome: "REQUIRE_APPROVAL",
        matchedRules: approvalRules.map((evaluation) =>
          matchedRule(evaluation.rule, "approval rule matched"),
        ),
        reason: `Approval required by policy: ${approvalRules[0]?.rule.name}`,
      };
    }

    const allowRules = matchingRules.filter(
      (evaluation) => evaluation.rule.effect === "ALLOW",
    );
    const validationRules = matchingRules.filter(
      (evaluation) => evaluation.rule.effect === "VALIDATE",
    );

    return {
      outcome: "ALLOW",
      matchedRules: [...validationRules, ...allowRules].map((evaluation) =>
        matchedRule(evaluation.rule, "allowing rule matched"),
      ),
      reason:
        allowRules.length > 0 || validationRules.length > 0
          ? "Allowed by matching policy"
          : "Allowed by default policy",
    };
  }
}

function scopeMatches(rule: PolicyRuleDefinition, intent: ToolIntent) {
  const scope = rule.scope;

  return (
    exactOrMissing(scope.serverId, intent.serverId) &&
    exactOrMissing(scope.serverName, intent.serverName) &&
    exactOrMissing(scope.toolName, intent.toolName) &&
    exactOrMissing(scope.normalizedFunctionName, intent.normalizedFunctionName)
  );
}

function exactOrMissing(expected: string | undefined, actual: string) {
  return expected === undefined || expected === actual;
}

function conditionMatches(condition: PolicyCondition, intent: ToolIntent): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "argsEquals":
      return jsonEquals(valueAtPath(intent.args, condition.path), condition.value);
    case "argsNotEquals":
      return !jsonEquals(valueAtPath(intent.args, condition.path), condition.value);
    case "argsIn":
      return condition.values.some((value) =>
        jsonEquals(valueAtPath(intent.args, condition.path), value),
      );
    case "argStringStartsWith": {
      const value = valueAtPath(intent.args, condition.path);
      return typeof value === "string" && value.startsWith(condition.prefix);
    }
    case "all":
      return condition.conditions.every((child) => conditionMatches(child, intent));
    case "any":
      return condition.conditions.some((child) => conditionMatches(child, intent));
    default:
      assertNever(condition);
  }
}

function valueAtPath(value: unknown, path: string) {
  if (path.length === 0) {
    return value;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      segment in current
    ) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

function jsonEquals(left: unknown, right: JsonValue) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchedRule(
  rule: PolicyRuleDefinition,
  reason: string,
): MatchedPolicyRule {
  return {
    id: rule.id,
    name: rule.name,
    effect: rule.effect,
    priority: rule.priority,
    reason,
  };
}

function stringifyError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled policy condition: ${JSON.stringify(value)}`);
}
