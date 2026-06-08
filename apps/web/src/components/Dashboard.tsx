import { useMemo } from "react";
import type { McpTool, McpHealth, Policy, ToolLog, Approval, Conversation } from "./shared/types";
import { renderMarkdown } from "../utils/markdown";
import {
  Metric,
  FlowStep,
  EmptyState,
  Badge,
  IconShield,
  IconServer,
  IconTool,
  IconActivity,
  IconAlertCircle,
  IconZap,
  IconSend,
  IconInbox,
  IconCheck,
  IconX,
  toneForOutcome,
  prettyJson,
} from "./shared";
import { promptPresets, totalTokens } from "../hooks/useFirewallData";

export function Dashboard(props: {
  readyServers: number;
  totalServers: number;
  toolCount: number;
  enabledPolicyCount: number;
  pendingCount: number;
  latestOutcome?: string;
  // Agent panel
  message: string;
  onChoosePrompt: (msg: string) => void;
  onSendChat: () => void;
  busy: boolean;
  visibleResponse: string;
  visibleRunLog?: ToolLog;
  latestConversation?: Conversation;
  // Approvals
  pendingApprovals: Approval[];
  resolvingApprovalId: string | null;
  onResolveApproval: (id: string, action: "approve" | "deny") => void;
}) {
  return (
    <div className="dashboard">
      {/* ── Metrics row ─────────────────────────────────────────── */}
      <section className="metrics-grid" aria-label="Runtime status">
        <Metric
          icon={<IconServer />}
          label="MCP Servers"
          value={`${props.readyServers}/${props.totalServers}`}
          tone={props.readyServers === props.totalServers ? "ok" : "warn"}
        />
        <Metric icon={<IconTool />} label="Discovered Tools" value={props.toolCount} />
        <Metric
          icon={<IconShield />}
          label="Active Policies"
          value={props.enabledPolicyCount}
        />
        <Metric
          icon={<IconAlertCircle />}
          label="Pending Approvals"
          value={props.pendingCount}
          tone={props.pendingCount > 0 ? "warn" : "neutral"}
        />
        <Metric
          icon={<IconActivity />}
          label="Last Decision"
          value={props.latestOutcome ?? "None"}
          tone={toneForOutcome(props.latestOutcome)}
        />
      </section>

      {/* ── Main content split ──────────────────────────────────── */}
      <div className="dashboard__split">
        {/* Agent Panel */}
        <section className="card agent-card">
          <div className="card__header">
            <div>
              <p className="card__kicker">Agent run</p>
              <h2 className="card__title">Ask the guarded planner</h2>
            </div>
            <Badge variant={props.busy ? "running" : "ready"}>
              <span className={`status-dot ${props.busy ? "status-dot--running" : "status-dot--ready"}`} />
              {props.busy ? "Running" : "Ready"}
            </Badge>
          </div>

          <div className="preset-grid">
            {promptPresets.map((preset) => (
              <button
                className="preset-btn"
                key={preset.label}
                onClick={() => props.onChoosePrompt(preset.prompt)}
              >
                <IconZap />
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.prompt}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="agent-input-group">
            <textarea
              aria-label="Agent message"
              className="agent-textarea"
              value={props.message}
              onChange={(e) => props.onChoosePrompt(e.target.value)}
              rows={4}
              placeholder="Describe the action you want the agent to take..."
            />
            <div className="agent-actions">
              <button
                className="btn btn--primary"
                onClick={props.onSendChat}
                disabled={props.busy}
              >
                <IconSend />
                {props.busy ? "Running…" : "Run guarded agent"}
              </button>
              {props.latestConversation && (
                <span className="agent-meta">
                  Last run:{" "}
                  {totalTokens(
                    props.latestConversation.agentRuns?.[0]?.tokenUsageJson,
                  )}{" "}
                  tokens
                </span>
              )}
            </div>
          </div>

          {props.visibleResponse && (
            <ResponseBubble content={props.visibleResponse} />
          )}

          <div className="flow-strip">
            <FlowStep label="LLM plans" active index={0} />
            <FlowStep
              label="Intent normalized"
              active={Boolean(props.visibleRunLog)}
              index={1}
            />
            <FlowStep
              label="Policy decides"
              active={Boolean(props.visibleRunLog)}
              index={2}
            />
            <FlowStep
              label="MCP executes"
              active={
                props.visibleRunLog?.outcome === "ALLOWED" ||
                props.visibleRunLog?.outcome === "APPROVED"
              }
              index={3}
            />
            <FlowStep
              label="Audit logged"
              active={Boolean(props.visibleRunLog)}
              index={4}
            />
          </div>
        </section>

        {/* Approval Queue */}
        <section className="card approval-card">
          <div className="card__header">
            <div>
              <p className="card__kicker">Human gate</p>
              <h2 className="card__title">Approval queue</h2>
            </div>
            <span className="count-badge">{props.pendingApprovals.length}</span>
          </div>

          {props.pendingApprovals.length === 0 ? (
            <EmptyState
              icon={<IconInbox />}
              title="No pending approvals"
              detail="Risky tool calls will pause here for human review."
            />
          ) : (
            <div className="approval-list">
              {props.pendingApprovals.slice(0, 5).map((approval) => (
                <article className="approval-item" key={approval.id}>
                  <div className="approval-item__info">
                    <Badge variant={approval.status.toLowerCase()}>
                      {approval.status}
                    </Badge>
                    <h3 className="approval-item__tool">
                      {approval.intentJson.serverName}.
                      {approval.intentJson.toolName}
                    </h3>
                    <code className="approval-item__args">
                      {prettyJson(approval.intentJson.args ?? {})}
                    </code>
                  </div>
                  {approval.status === "PENDING" && (
                    <div className="approval-item__actions">
                      <button
                        className="btn btn--approve"
                        disabled={props.resolvingApprovalId === approval.id}
                        onClick={() =>
                          props.onResolveApproval(approval.id, "approve")
                        }
                      >
                        <IconCheck />
                        {props.resolvingApprovalId === approval.id
                          ? "Approving…"
                          : "Approve"}
                      </button>
                      <button
                        className="btn btn--deny"
                        disabled={props.resolvingApprovalId === approval.id}
                        onClick={() =>
                          props.onResolveApproval(approval.id, "deny")
                        }
                      >
                        <IconX />
                        Deny
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ResponseBubble({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className="response-bubble">
      <span className="response-bubble__label">Assistant response</span>
      <div
        className="response-bubble__content md-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
