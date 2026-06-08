import type { DiscoveredMcpTool } from "@mcp-intent-firewall/shared";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";

const EMPTY_OBJECT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export function toAiSdkTools(tools: DiscoveredMcpTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((tool) => [
      tool.normalizedName,
      dynamicTool({
        description:
          tool.description ?? tool.title ?? `MCP tool ${tool.toolName}`,
        inputSchema: jsonSchema(normalizeJsonSchema(tool.inputSchema)),
      } as Parameters<typeof dynamicTool>[0]),
    ]),
  );
}

function normalizeJsonSchema(schema: unknown) {
  if (!schema || typeof schema !== "object") {
    return EMPTY_OBJECT_SCHEMA;
  }

  return schema as Parameters<typeof jsonSchema>[0];
}
