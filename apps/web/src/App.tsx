import { useEffect, useMemo, useState } from "react";

type McpTool = {
  serverName: string;
  toolName: string;
  normalizedName: string;
  description?: string;
};

type McpHealth = {
  serverName: string;
  status: string;
  error?: string;
  discoveredToolCount: number;
};

type Policy = {
  id: string;
  name: string;
  enabled: boolean;
  effect: string;
  scope: { toolName?: string };
  condition?: { kind?: string; path?: string; values?: unknown[] };
  priority: number;
};

type ToolLog = {
  id: string;
  serverName: string;
  toolName: string;
  decision: string;
  outcome: string;
  argsJson?: Record<string, unknown>;
  matchedRulesJson?: Array<{ name?: string; effect?: string }>;
  createdAt: string;
  error?: string;
};

type Conversation = {
  id: string;
  updatedAt: string;
  messages: Array<{ role: string; contentJson: { text?: string } }>;
  agentRuns?: Array<{ tokenUsageJson?: { totalTokenCount?: number } }>;
};

type Approval = {
  id: string;
  status: string;
  intentJson: {
    serverName?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  createdAt: string;
};

export function App() {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [health, setHealth] = useState<McpHealth[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [message, setMessage] = useState("List active P1 incidents");
  const [chatResponse, setChatResponse] = useState("");
  const [newRule, setNewRule] = useState({
    name: "Block selected tool",
    effect: "BLOCK",
    toolName: "search_runbooks",
    argPath: "team",
    allowedValues: "sre,payments,security",
  });
  const [busy, setBusy] = useState(false);

  const enabledPolicyCount = useMemo(
    () => policies.filter((policy) => policy.enabled).length,
    [policies],
  );

  async function refresh() {
    const [toolsRes, serversRes, policiesRes, logsRes, conversationsRes, approvalsRes] =
      await Promise.all([
        fetch("/api/mcp/tools"),
        fetch("/api/mcp/servers"),
        fetch("/api/policies"),
        fetch("/api/logs/tool-calls"),
        fetch("/api/conversations"),
        fetch("/api/approvals"),
      ]);

    setTools((await toolsRes.json()).tools ?? []);
    setHealth((await serversRes.json()).health ?? []);
    setPolicies((await policiesRes.json()).policies ?? []);
    setLogs((await logsRes.json()).logs ?? []);
    setConversations((await conversationsRes.json()).conversations ?? []);
    setApprovals((await approvalsRes.json()).approvals ?? []);
  }

  async function refreshMcp() {
    await fetch("/api/mcp/refresh", { method: "POST" });
    await refresh();
  }

  async function togglePolicy(policy: Policy) {
    await fetch(`/api/policies/${policy.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !policy.enabled }),
    });
    await refresh();
  }

  async function createPolicy() {
    const condition =
      newRule.effect === "VALIDATE"
        ? {
            kind: "argsIn",
            path: newRule.argPath,
            values: newRule.allowedValues
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : { kind: "always" };

    await fetch("/api/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newRule.name,
        effect: newRule.effect,
        scope: { toolName: newRule.toolName },
        condition,
        priority: 50,
      }),
    });
    await refresh();
  }

  async function resolveApproval(id: string, action: "approve" | "deny") {
    await fetch(`/api/approvals/${id}/${action}`, { method: "POST" });
    await refresh();
  }

  async function sendChat() {
    setBusy(true);
    setChatResponse("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await response.json();

      setChatResponse(body.message ?? body.error ?? "No response");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();

    const events = new EventSource("/api/events");
    events.addEventListener("tool_call.logged", refresh);
    events.addEventListener("policy.updated", refresh);
    events.addEventListener("mcp.tools_refreshed", refresh);
    events.addEventListener("approval.updated", refresh);
    events.addEventListener("approval.created", refresh);
    events.addEventListener("conversation.updated", refresh);

    return () => events.close();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MCP Intent Firewall</p>
          <h1>Guarded Agent Control Plane</h1>
        </div>
        <button onClick={refresh}>Refresh</button>
      </header>

      <section className="metrics">
        <Metric label="MCP tools" value={tools.length} />
        <Metric label="Active policies" value={enabledPolicyCount} />
        <Metric label="Tool logs" value={logs.length} />
        <Metric label="Conversations" value={conversations.length} />
      </section>

      <section className="panel chatPanel">
        <div className="panelHeader">
          <h2>Agent Console</h2>
          <span>{busy ? "Running" : "Ready"}</span>
        </div>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
        />
        <button onClick={sendChat} disabled={busy}>
          Send
        </button>
        {chatResponse ? <p className="response">{chatResponse}</p> : null}
      </section>

      <div className="grid">
        <section className="panel">
          <div className="panelHeader">
            <h2>MCP Servers</h2>
            <button onClick={refreshMcp}>Rediscover</button>
          </div>
          {health.map((server) => (
            <div className="row" key={server.serverName}>
              <div>
                <strong>{server.serverName}</strong>
                <p>{server.error ?? `${server.discoveredToolCount} tools`}</p>
              </div>
              <span className={`pill ${server.status}`}>{server.status}</span>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>Policies</h2>
          </div>
          <div className="createRule">
            <input
              value={newRule.name}
              onChange={(event) =>
                setNewRule({ ...newRule, name: event.target.value })
              }
            />
            <select
              value={newRule.effect}
              onChange={(event) =>
                setNewRule({ ...newRule, effect: event.target.value })
              }
            >
              <option value="BLOCK">Block</option>
              <option value="REQUIRE_APPROVAL">Approval</option>
              <option value="VALIDATE">Validate</option>
            </select>
            <input
              value={newRule.toolName}
              onChange={(event) =>
                setNewRule({ ...newRule, toolName: event.target.value })
              }
            />
            {newRule.effect === "VALIDATE" ? (
              <>
                <input
                  value={newRule.argPath}
                  onChange={(event) =>
                    setNewRule({ ...newRule, argPath: event.target.value })
                  }
                />
                <input
                  value={newRule.allowedValues}
                  onChange={(event) =>
                    setNewRule({ ...newRule, allowedValues: event.target.value })
                  }
                />
              </>
            ) : null}
            <button onClick={createPolicy}>Add</button>
          </div>
          {policies.map((policy) => (
            <label className="row policyRow" key={policy.id}>
              <input
                type="checkbox"
                checked={policy.enabled}
                onChange={() => togglePolicy(policy)}
              />
              <div>
                <strong>{policy.name}</strong>
                <p>
                  {policy.effect}
                  {policy.scope.toolName ? ` / ${policy.scope.toolName}` : ""}
                  {policy.condition?.kind === "argsIn"
                    ? ` / ${policy.condition.path} in ${policy.condition.values?.join(", ")}`
                    : ""}
                </p>
              </div>
            </label>
          ))}
        </section>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <h2>Discovered Tools</h2>
        </div>
        <div className="toolGrid">
          {tools.map((tool) => (
            <article className="tool" key={tool.normalizedName}>
              <strong>{tool.normalizedName}</strong>
              <p>{tool.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Approvals</h2>
        </div>
        {approvals.length === 0 ? <p className="muted">No approval requests yet.</p> : null}
        {approvals.map((approval) => (
          <div className="row" key={approval.id}>
            <div>
              <strong>
                {approval.intentJson.serverName}.{approval.intentJson.toolName}
              </strong>
              <p>{JSON.stringify(approval.intentJson.args ?? {})}</p>
            </div>
            {approval.status === "PENDING" ? (
              <div className="actions">
                <button onClick={() => resolveApproval(approval.id, "approve")}>
                  Approve
                </button>
                <button onClick={() => resolveApproval(approval.id, "deny")}>
                  Deny
                </button>
              </div>
            ) : (
              <span className="pill">{approval.status}</span>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Audit Logs</h2>
        </div>
        {logs.slice(0, 8).map((log) => (
          <div className="row" key={log.id}>
            <div>
              <strong>
                {log.serverName}.{log.toolName}
              </strong>
              <p>{JSON.stringify(log.argsJson ?? {})}</p>
              <p>
                {new Date(log.createdAt).toLocaleString()} / {log.decision}
                {log.matchedRulesJson?.length
                  ? ` / ${log.matchedRulesJson.map((rule) => rule.name).join(", ")}`
                  : ""}
              </p>
            </div>
            <span className="pill">{log.outcome}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Conversations</h2>
        </div>
        {conversations.slice(0, 6).map((conversation) => (
          <div className="row" key={conversation.id}>
            <div>
              <strong>{conversation.messages.at(-1)?.contentJson.text ?? conversation.id}</strong>
              <p>
                {new Date(conversation.updatedAt).toLocaleString()} /{" "}
                {conversation.agentRuns?.[0]?.tokenUsageJson?.totalTokenCount ?? 0} tokens
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <article className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}
