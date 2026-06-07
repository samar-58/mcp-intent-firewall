import type { McpTool, McpHealth } from "./shared/types";
import { Badge, EmptyState, IconServer } from "./shared";
import { useMemo } from "react";

export function McpRegistry(props: {
  health: McpHealth[];
  tools: McpTool[];
  onRefreshMcp: () => void;
}) {
  const toolGroups = useMemo(() => {
    return props.tools.reduce<Record<string, McpTool[]>>((groups, tool) => {
      const serverTools = groups[tool.serverName] ?? [];
      serverTools.push(tool);
      groups[tool.serverName] = serverTools;
      return groups;
    }, {});
  }, [props.tools]);

  return (
    <div className="registry-page">
      {/* ── Server Health ─────────────────────────────────────── */}
      <section className="card">
        <div className="card__header">
          <div>
            <p className="card__kicker">MCP registry</p>
            <h2 className="card__title">Server health</h2>
          </div>
          <button className="btn btn--secondary" onClick={props.onRefreshMcp}>
            Rediscover
          </button>
        </div>

        {props.health.length === 0 ? (
          <EmptyState
            icon={<IconServer />}
            title="No MCP servers"
            detail="Configure MCP servers in your environment."
          />
        ) : (
          <div className="server-grid">
            {props.health.map((server) => (
              <article className="server-card" key={server.serverName}>
                <div className="server-card__info">
                  <strong>{server.serverName}</strong>
                  <p>
                    {server.error ?? `${server.discoveredToolCount} tools discovered`}
                  </p>
                </div>
                <Badge variant={server.status}>{server.status}</Badge>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Tool Cloud ────────────────────────────────────────── */}
      <section className="card">
        <div className="card__header">
          <div>
            <p className="card__kicker">Discovery</p>
            <h2 className="card__title">Available tools</h2>
          </div>
          <Badge variant="neutral">{props.tools.length} total</Badge>
        </div>

        {Object.entries(toolGroups).map(([serverName, serverTools]) => (
          <div className="tool-group" key={serverName}>
            <div className="tool-group__header">
              <strong>{serverName}</strong>
              <span>{serverTools.length} tools</span>
            </div>
            <div className="tool-chips">
              {serverTools.map((tool) => (
                <span
                  className="tool-chip"
                  key={tool.normalizedName}
                  title={tool.description}
                >
                  {tool.toolName}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
