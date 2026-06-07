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
  priority: number;
};

type ToolLog = {
  id: string;
  serverName: string;
  toolName: string;
  decision: string;
  outcome: string;
  createdAt: string;
  error?: string;
};

type Conversation = {
  id: string;
  updatedAt: string;
  messages: Array<{ role: string; contentJson: { text?: string } }>;
};

export function App() {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [health, setHealth] = useState<McpHealth[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [message, setMessage] = useState("List active P1 incidents");
  const [chatResponse, setChatResponse] = useState("");
  const [busy, setBusy] = useState(false);

  const enabledPolicyCount = useMemo(
    () => policies.filter((policy) => policy.enabled).length,
    [policies],
  );

  async function refresh() {
    const [toolsRes, serversRes, policiesRes, logsRes, conversationsRes] =
      await Promise.all([
        fetch("/api/mcp/tools"),
        fetch("/api/mcp/servers"),
        fetch("/api/policies"),
        fetch("/api/logs/tool-calls"),
        fetch("/api/conversations"),
      ]);

    setTools((await toolsRes.json()).tools ?? []);
    setHealth((await serversRes.json()).health ?? []);
    setPolicies((await policiesRes.json()).policies ?? []);
    setLogs((await logsRes.json()).logs ?? []);
    setConversations((await conversationsRes.json()).conversations ?? []);
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
          <h2>Audit Logs</h2>
        </div>
        {logs.slice(0, 8).map((log) => (
          <div className="row" key={log.id}>
            <div>
              <strong>
                {log.serverName}.{log.toolName}
              </strong>
              <p>{new Date(log.createdAt).toLocaleString()}</p>
            </div>
            <span className="pill">{log.outcome}</span>
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
