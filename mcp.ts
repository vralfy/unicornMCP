import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import express from "express";
import fs from "fs"

import { mcpTools } from './mods/tools.ts';
import { mcpExpress } from "./mods/express.ts";

// Loading configuration
const config = {
  ...mcpTools.defaultConfig,
  ...mcpTools.loadConfig()
};

Object.keys(config.env ?? {}).forEach(key => {
  process.env[key] = config.env[key];
});

// Rainbow Road prefix handling
if (process.argv.includes('--rainbowroad')) {
  config.prefix = 'rb_' + config.prefix || '';
}
config.prefix = config.prefix.replaceAll(/_/g, '');

// Clear log file
fs.writeFileSync(config.logfile, "", { encoding: 'utf8', flag: 'w+' });

// Loading secrets
mcpTools.loadSecrets(config);

if (config.secrets?.proxy) {
  // Setting up proxy for undici (which powers fetch in Node.js)
  config.info(`Setting up proxy`);
  const proxyAgent = new ProxyAgent(config.secrets.proxy.http);
  setGlobalDispatcher(proxyAgent);
}

// Setting up MCP and express server
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
mcpExpress.setup(config, mcpServer, expressServer).then(() => { });

// Loading and registering modules
await mcpTools.loadModules(config, mcpServer, expressServer);

// Starting the server
config.info("Starting UniCorn MagicCP server...");
config.logger({...config, secrets: '---secret---' });
// Magical transport selection: use HTTP if --rainbowroad flag is set
if (process.argv.includes('--rainbowroad')) {
  config.info("Activating Rainbow Road...");
  // const transport = new StreamableHTTPServerTransport({ app: expressServer });
  // await mcpServer.connect(transport);
  const port = config.port || 3000;
  expressServer.listen(port, (err) => {
    if (err) {
      config.error(`Activating Rainbow Road failed!`);
      process.exit(1);
    }
    config.info(`Rainbow Road activated! MCP server is trotting at http://localhost:${port}${config.path}`);
  });
} else {
  config.info("Activating Standard Input/Output Unicorn...");
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  config.info("Standard Input/Output Unicorn is waiting for requests");
}

// This server was brought to you by