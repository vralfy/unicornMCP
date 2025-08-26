import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import express from "express";
import fs from "fs"

import { mcpTools } from './mods/tools.ts';
import { mcpExamples } from "./mods/example.ts";
import { mcpUnicorn } from "./mods/unicorn.ts";
import { mcpExpress } from "./mods/express.ts";
import { mcpLocation } from "./mods/location.ts";
import { mcpWeather } from "./mods/weather.ts";
import { mcpJira } from "./mods/jira.ts";

const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
config.pwd = process.cwd();
config.logfile = config.logfile || config.pwd + "/mcp.log";
config.args = process.argv;

fs.writeFileSync(config.logfile, "", { encoding: 'utf8', flag: 'w+' });

const mcpServer = new McpServer(config.server, {
  capabilities: {
    // tools: [
    //   {
    //     id: "add",
    //     name: "Add",
    //     description: "Adds two numbers",
    //     input: { a: "number", b: "number" },
    //     output: { content: [{ type: "text", text: "string" }] },
    //   },
    // ],
  },
});

const expressServer = express();

mcpTools.register(config, mcpServer, expressServer).then(() => {});
// Check if secrets.json exists and load it if present
if (fs.existsSync(config.pwd + "/secrets.json")) {
  try {
    config.secrets = JSON.parse(fs.readFileSync("secrets.json", "utf-8"));
    config.echo("Loaded magical secrets from secrets.json");
  } catch (err) {
    config.echo("Failed to read secrets.json:", err);
  }
} else {
  config.echo("No secrets.json found. Proceeding without magical secrets.");
}

mcpExpress.setup(config, mcpServer, expressServer).then(() => {});

mcpExamples.register(config, mcpServer, expressServer).then(() => {});
mcpUnicorn.register(config, mcpServer, expressServer).then(() => {});
mcpLocation.register(config, mcpServer, expressServer).then(() => {});
mcpWeather.register(config, mcpServer, expressServer).then(() => {});
mcpJira.register(config, mcpServer, expressServer).then(() => {});

config.logger("Starting UniCorn MagicCP server with info:", config);

// Magical transport selection: use HTTP if --rainbowroad flag is set
if (process.argv.includes('--rainbowroad')) {
  // const transport = new StreamableHTTPServerTransport({ app: expressServer });
  // await mcpServer.connect(transport);
  const port = config.port || 3000;
  expressServer.listen(port, (err) => {
    if (err) {
      config.echo(`Activating Rainbow Road failed!`);
      process.exit(1);
    }
    config.echo(`Rainbow Road activated! MCP server is trotting at http://localhost:${port}${config.path}`);
  });
} else {
  config.echo("Activating Standard Input/Output Unicorn...");
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

// This server was brought to you by