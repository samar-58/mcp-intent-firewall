import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerDefinition } from "@mcp-intent-firewall/shared";

const DEFAULT_TOOL_TIMEOUT_MS = 15_000;

type TimeoutOptions = {
  timeoutMs?: number;
};

export class McpClientConnection {
  private client?: Client;
  private transport?: StdioClientTransport;

  constructor(private readonly definition: McpServerDefinition) {}

  get serverDefinition() {
    return this.definition;
  }

  async connect() {
    if (this.definition.transport !== "STDIO") {
      throw new Error(`Unsupported MCP transport: ${this.definition.transport}`);
    }

    this.client = new Client({
      name: `mcp-intent-firewall-${this.definition.name}`,
      version: "1.0.0",
    });

    this.transport = new StdioClientTransport({
      command: this.definition.command,
      args: this.definition.args,
      cwd: this.definition.cwd,
      env: this.definition.env,
      stderr: "pipe",
    });

    await this.client.connect(this.transport);
  }

  async listTools() {
    return this.withConnectedClient((client) => client.listTools());
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options: TimeoutOptions = {},
  ) {
    return this.withTimeout(
      this.withConnectedClient((client) =>
        client.callTool({
          name: toolName,
          arguments: args,
        }),
      ),
      options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    );
  }

  async close() {
    await this.client?.close();
    this.client = undefined;
    this.transport = undefined;
  }

  private async withConnectedClient<T>(callback: (client: Client) => Promise<T>) {
    if (!this.client) {
      throw new Error(`MCP server is not connected: ${this.definition.name}`);
    }

    return callback(this.client);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeout: Timer | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(
          new Error(
            `MCP tool call timed out after ${timeoutMs}ms on ${this.definition.name}`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
