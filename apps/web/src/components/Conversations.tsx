import type { Conversation } from "./shared/types";
import { EmptyState, IconHistory } from "./shared";
import { totalTokens } from "../hooks/useFirewallData";

export function Conversations(props: { conversations: Conversation[] }) {
  return (
    <div className="history-page">
      <section className="card">
        <div className="card__header">
          <div>
            <p className="card__kicker">History</p>
            <h2 className="card__title">Conversation logs</h2>
          </div>
        </div>

        {props.conversations.length === 0 ? (
          <EmptyState
            icon={<IconHistory />}
            title="No conversations yet"
            detail="Run the agent to create conversation history."
          />
        ) : (
          <div className="conversation-grid">
            {props.conversations.slice(0, 12).map((conversation) => (
              <article className="conversation-card" key={conversation.id}>
                <strong>
                  {conversation.messages.at(-1)?.contentJson.text ??
                    conversation.id}
                </strong>
                <div className="conversation-card__meta">
                  <span>{new Date(conversation.updatedAt).toLocaleString()}</span>
                  <span className="conversation-card__tokens">
                    {totalTokens(conversation.agentRuns?.[0]?.tokenUsageJson)} tokens
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
