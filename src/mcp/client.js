import {
  Client
} from "@modelcontextprotocol/sdk/client/index.js";

import {
  StdioClientTransport
} from "@modelcontextprotocol/sdk/client/stdio.js";

import { mcpServers } from "./servers.js";

const clients = new Map();
const tools = [];

export async function connectMcpServers() {

  for (const [name, config] of Object.entries(mcpServers)) {

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    });

    const client = new Client({
      name: `nexus-${name}`,
      version: "1.0.0",
    });

    await client.connect(transport);

    const result = await client.listTools();

    clients.set(name, client);

    for (const tool of result.tools) {
      tools.push({
        server: name,
        tool,
      });
    }

  }

  return tools;
}

export async function callMcpTool(
  serverName,
  toolName,
  args
) {
  const client = clients.get(serverName);

  if (!client) {
    throw new Error(
      `Serveur MCP inconnu : ${serverName}`
    );
  }

  return await client.callTool({
    name: toolName,
    arguments: args ?? {},
  });
}