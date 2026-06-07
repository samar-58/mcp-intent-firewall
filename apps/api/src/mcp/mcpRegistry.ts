import type {
  DiscoveredMcpTool,
  McpServerDefinition,
  McpServerHealth,
  McpToolCallResult,
} from "@mcp-intent-firewall/shared";
import { McpClientConnection } from "./mcpClient";
import { normalizeToolName } from "./toolNameMapper";

type ToolRoute = {
  serverId: string;
  serverName: string;
  toolName: string;
  normalizedName: string;
};

export class McpRegistry {
  private connections = new Map<string, McpClientConnection>();
  private discoveredTools = new Map<string, DiscoveredMcpTool>();
  private toolRoutes = new Map<string, ToolRoute>();
  private health = new Map<string, McpServerHealth>();

  async refresh(serverDefinitions: McpServerDefinition[]) {
    await this.closeAll();

    this.discoveredTools.clear();
    this.toolRoutes.clear();
    this.health.clear();

    for (const definition of serverDefinitions) {
      if (!definition.enabled) {
        this.health.set(definition.id, {
          serverId: definition.id,
          serverName: definition.name,
          status: "disconnected",
          discoveredToolCount: 0,
        });
        continue;
      }

      await this.connectAndDiscover(definition);
    }
  }

  getTools() {
    return [...this.discoveredTools.values()].sort((left, right) =>
      left.normalizedName.localeCompare(right.normalizedName),
    );
  }

  getHealth() {
    return [...this.health.values()].sort((left, right) =>
      left.serverName.localeCompare(right.serverName),
    );
  }

  getRoute(normalizedName: string) {
    return this.toolRoutes.get(normalizedName);
  }

  async callTool(
    normalizedName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const route = this.toolRoutes.get(normalizedName);

    if (!route) {
      throw new Error(`No discovered MCP tool route for ${normalizedName}`);
    }

    const connection = this.connections.get(route.serverId);

    if (!connection) {
      throw new Error(`MCP server is not connected: ${route.serverName}`);
    }

    const result = await connection.callTool(route.toolName, args);

    return {
      serverId: route.serverId,
      serverName: route.serverName,
      toolName: route.toolName,
      normalizedName: route.normalizedName,
      result,
    };
  }

  async closeAll() {
    const connections = [...this.connections.values()];
    this.connections.clear();

    await Promise.allSettled(
      connections.map((connection) => connection.close()),
    );
  }

  private async connectAndDiscover(definition: McpServerDefinition) {
    this.health.set(definition.id, {
      serverId: definition.id,
      serverName: definition.name,
      status: "connecting",
      discoveredToolCount: 0,
    });

    const connection = new McpClientConnection(definition);

    try {
      await connection.connect();
      const toolsResult = await connection.listTools();
      const tools = toolsResult.tools ?? [];

      this.connections.set(definition.id, connection);

      for (const tool of tools) {
        const normalizedName = this.uniqueNormalizedName(
          definition.name,
          tool.name,
        );

        const discoveredTool: DiscoveredMcpTool = {
          serverId: definition.id,
          serverName: definition.name,
          toolName: tool.name,
          normalizedName,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        };

        this.discoveredTools.set(normalizedName, discoveredTool);
        this.toolRoutes.set(normalizedName, {
          serverId: definition.id,
          serverName: definition.name,
          toolName: tool.name,
          normalizedName,
        });
      }

      this.health.set(definition.id, {
        serverId: definition.id,
        serverName: definition.name,
        status: "ready",
        discoveredToolCount: tools.length,
      });
    } catch (error) {
      await connection.close();

      this.health.set(definition.id, {
        serverId: definition.id,
        serverName: definition.name,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        discoveredToolCount: 0,
      });
    }
  }

  private uniqueNormalizedName(serverName: string, toolName: string) {
    const baseName = normalizeToolName(serverName, toolName);
    let candidate = baseName;
    let suffix = 2;

    while (this.discoveredTools.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
