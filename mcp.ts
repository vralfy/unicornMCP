import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { setGlobalDispatcher, ProxyAgent, Agent, fetch as undiciFetch } from 'undici';
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

config.info(`Setting up http agent`);
config.proxy = config.proxy || {};
config.proxy.agent = new Agent({ connect: { rejectUnauthorized: false } });
config.proxy.dispatcher = config.proxy.agent;

if (config.secrets?.proxy) {
  // Setting up proxy for undici (which powers fetch in Node.js)
  config.info(`Setting up proxy`);
  config.proxy.proxyAgent = new ProxyAgent({ uri: config.secrets?.proxy.http, connect: { rejectUnauthorized: false } })
  config.proxy.dispatcher = config.proxy.proxyAgent;
};
setGlobalDispatcher(config.proxy.dispatcher);

// Replace globalThis.fetch with undici's fetch so that ALL libraries (e.g. gitbeaker)
// that call the global fetch will use our dispatcher (proxy + rejectUnauthorized).
// Node 22's native fetch does NOT respect setGlobalDispatcher — undici's does. 🦄
// When gitbeaker passes a native Request object, we must unwrap it to a plain URL + options
// because undici's fetch cannot parse a native Request object. 🌈
config.proxy.fetch = async (url, opt?) => {
  if (url instanceof Request) {
    const headers = {};
    url.headers.forEach((value, key) => { headers[key] = value; });
    // Do NOT pass url.signal — it's a native AbortSignal that undici mishandles.
    // The opt may contain a signal from gitbeaker's queryTimeout — that's fine. 🦄
    const result = undiciFetch(url.url, {
      dispatcher: config.proxy.agent,
      method: url.method,
      headers,
      body: url.body,
      ...opt,
    });
    result.then(r => config.debug('Response by Request:', url.url, r.status)).catch(e => config.error('Fetch by Request error:', url.url, e.name, e.message));
    return result;
  }
  const result = undiciFetch(url, { dispatcher: config.proxy.agent, ...opt });
  result.then(r => config.debug('Response by URL string:', url, r.status)).catch(e => config.error('Fetch by URL string error:', url, e.name, e.message));
  return result;
};

if (config.secrets?.proxy) {
  config.proxy.fetchProxy = (url, opt) => config.proxy.fetch(url, {dispatcher: config.proxy.dispatcher, ...opt});
} else {
  config.proxy.fetchProxy = config.proxy.fetch;
}
globalThis.fetch = config.proxy.fetch as unknown as typeof globalThis.fetch;

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