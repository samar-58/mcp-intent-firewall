import type { McpTool, Policy } from "./shared/types";
import type { ToolPermission } from "./shared/types";
import {
  Badge,
  EmptyState,
  IconShield,
  IconChevronDown,
} from "./shared";
import {
  permissionForTool,
  conditionalRuleCount,
  policyActionLabel,
  policyTarget,
  policyConditionText,
} from "../hooks/useFirewallData";

export function PolicyManager(props: {
  tools: McpTool[];
  policies: Policy[];
  conditionalPolicies: Policy[];
  inactivePolicies: Policy[];
  newRule: {
    name: string;
    effect: string;
    toolName: string;
    argPath: string;
    allowedValues: string;
  };
  setNewRule: (rule: typeof props.newRule) => void;
  onTogglePolicy: (policy: Policy) => void;
  onCreatePolicy: () => void;
  onSetToolPermission: (toolName: string, next: ToolPermission) => void;
}) {
  return (
    <div className="policy-page">
      {/* ── Tool Permissions ──────────────────────────────────── */}
      <section className="card">
        <div className="card__header">
          <div>
            <p className="card__kicker">Policy layer</p>
            <h2 className="card__title">Tool permissions</h2>
          </div>
          <Badge variant="neutral">{props.tools.length} tools</Badge>
        </div>

        {props.tools.length === 0 ? (
          <EmptyState
            icon={<IconShield />}
            title="No tools discovered"
            detail="Connect MCP servers to discover tools."
          />
        ) : (
          <div className="permission-grid">
            {props.tools.map((tool) => {
              const permission = permissionForTool(tool.toolName, props.policies);
              const advancedCount = conditionalRuleCount(
                tool.toolName,
                props.conditionalPolicies,
              );

              return (
                <article className="permission-card" key={tool.normalizedName}>
                  <div className="permission-card__info">
                    <strong>{tool.toolName}</strong>
                    <p>
                      {tool.serverName}
                      {tool.description ? ` — ${tool.description}` : ""}
                      {advancedCount > 0
                        ? ` · ${advancedCount} conditional rule${advancedCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <div className="permission-card__control">
                    <select
                      className={`permission-select permission-select--${permission.toLowerCase().replace(/_/g, "-")}`}
                      value={permission}
                      onChange={(e) =>
                        props.onSetToolPermission(
                          tool.toolName,
                          e.target.value as ToolPermission,
                        )
                      }
                    >
                      <option value="ALLOW">✓ Allow</option>
                      <option value="REQUIRE_APPROVAL">⏳ Require approval</option>
                      <option value="BLOCK">✕ Block</option>
                    </select>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Conditional Rules ─────────────────────────────────── */}
      <section className="card">
        <details className="expandable">
          <summary className="expandable__trigger">
            <span>
              Advanced conditional rules
              <Badge variant="neutral">{props.conditionalPolicies.length}</Badge>
            </span>
            <IconChevronDown />
          </summary>
          <div className="expandable__body">
            {props.conditionalPolicies.length === 0 ? (
              <EmptyState
                title="No conditional rules"
                detail="Add rules with argument-level conditions below."
              />
            ) : (
              <div className="rule-list">
                {props.conditionalPolicies.map((policy) => (
                  <label className="rule-item" key={policy.id}>
                    <input
                      type="checkbox"
                      className="rule-item__check"
                      checked={policy.enabled}
                      onChange={() => props.onTogglePolicy(policy)}
                    />
                    <Badge variant={policy.effect.toLowerCase().replace(/_/g, "-")}>
                      {policyActionLabel(policy)}
                    </Badge>
                    <div className="rule-item__info">
                      <strong>{policy.name}</strong>
                      <p>
                        {policyTarget(policy)}
                        {policyConditionText(policy)
                          ? ` · ${policyConditionText(policy)}`
                          : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </details>
      </section>

      {/* ── Rule Builder ──────────────────────────────────────── */}
      <section className="card">
        <details className="expandable">
          <summary className="expandable__trigger">
            <span>Add a custom rule</span>
            <IconChevronDown />
          </summary>
          <div className="expandable__body">
            <div className="rule-builder">
              <label className="rule-builder__field">
                <span>Rule name</span>
                <input
                  value={props.newRule.name}
                  onChange={(e) =>
                    props.setNewRule({ ...props.newRule, name: e.target.value })
                  }
                />
              </label>
              <label className="rule-builder__field">
                <span>Decision</span>
                <select
                  value={props.newRule.effect}
                  onChange={(e) =>
                    props.setNewRule({ ...props.newRule, effect: e.target.value })
                  }
                >
                  <option value="BLOCK">Block</option>
                  <option value="REQUIRE_APPROVAL">Require approval</option>
                  <option value="VALIDATE">Validate input</option>
                </select>
              </label>
              <label className="rule-builder__field">
                <span>Tool name</span>
                <input
                  value={props.newRule.toolName}
                  onChange={(e) =>
                    props.setNewRule({ ...props.newRule, toolName: e.target.value })
                  }
                />
              </label>
              {props.newRule.effect === "VALIDATE" && (
                <>
                  <label className="rule-builder__field">
                    <span>Argument path</span>
                    <input
                      value={props.newRule.argPath}
                      onChange={(e) =>
                        props.setNewRule({
                          ...props.newRule,
                          argPath: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="rule-builder__field">
                    <span>Allowed values</span>
                    <input
                      value={props.newRule.allowedValues}
                      onChange={(e) =>
                        props.setNewRule({
                          ...props.newRule,
                          allowedValues: e.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
              <button className="btn btn--primary" onClick={props.onCreatePolicy}>
                Add rule
              </button>
            </div>
          </div>
        </details>
      </section>

      {/* ── Inactive Rules ────────────────────────────────────── */}
      {props.inactivePolicies.length > 0 && (
        <section className="card">
          <details className="expandable">
            <summary className="expandable__trigger">
              <span>
                Inactive rules
                <Badge variant="neutral">{props.inactivePolicies.length}</Badge>
              </span>
              <IconChevronDown />
            </summary>
            <div className="expandable__body">
              <div className="rule-list rule-list--inactive">
                {props.inactivePolicies.map((policy) => (
                  <label className="rule-item" key={policy.id}>
                    <input
                      type="checkbox"
                      className="rule-item__check"
                      checked={policy.enabled}
                      onChange={() => props.onTogglePolicy(policy)}
                    />
                    <Badge variant={policy.effect.toLowerCase().replace(/_/g, "-")}>
                      {policyActionLabel(policy)}
                    </Badge>
                    <div className="rule-item__info">
                      <strong>{policy.name}</strong>
                      <p>{policyTarget(policy)}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
