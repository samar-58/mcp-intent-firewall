import type {
  DiscoveredMcpTool,
  JsonValue,
} from "@mcp-intent-firewall/shared";
import type { FunctionDeclaration } from "@google/genai";

const EMPTY_OBJECT_SCHEMA = {
  type: "object",
  properties: {},
};

export function toGeminiFunctionDeclarations(
  tools: DiscoveredMcpTool[],
): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.normalizedName,
    description: tool.description ?? tool.title ?? `MCP tool ${tool.toolName}`,
    parametersJsonSchema: normalizeJsonSchema(tool.inputSchema),
  }));
}

function normalizeJsonSchema(schema: unknown): JsonValue {
  if (!schema || typeof schema !== "object") {
    return EMPTY_OBJECT_SCHEMA;
  }

  return schema as JsonValue;
}
