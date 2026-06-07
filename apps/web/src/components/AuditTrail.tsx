import type { ToolLog } from "./shared/types";
import { Badge, EmptyState, IconAudit, toneForOutcome, matchedRules, prettyJson } from "./shared";

export function AuditTrail(props: { logs: ToolLog[] }) {
  return (
    <div className="audit-page">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="card__kicker">Audit trail</p>
            <h2 className="card__title">Tool decisions</h2>
          </div>
          <Badge variant="neutral">{props.logs.length} entries</Badge>
        </div>

        {props.logs.length === 0 ? (
          <EmptyState
            icon={<IconAudit />}
            title="No tool calls yet"
            detail="Run the agent to create audit events."
          />
        ) : (
          <div className="audit-table">
            <div className="audit-table__header">
              <span>Outcome</span>
              <span>Intent</span>
              <span>Policy</span>
              <span>Arguments</span>
            </div>
            {props.logs.slice(0, 20).map((log) => (
              <article className="audit-row" key={log.id}>
                <div className="audit-row__outcome">
                  <Badge variant={log.outcome.toLowerCase().replace(/_/g, "-")}>
                    {log.outcome}
                  </Badge>
                </div>
                <div className="audit-row__intent">
                  <strong>
                    {log.serverName}.{log.toolName}
                  </strong>
                  <p>{new Date(log.createdAt).toLocaleString()}</p>
                </div>
                <div className="audit-row__policy">
                  <strong>{log.decision}</strong>
                  <p>{matchedRules(log)}</p>
                </div>
                <div className="audit-row__args">
                  <code>{prettyJson(log.argsJson ?? {})}</code>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
