import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import express from "express";
import fs from "fs"

import { mcpTools } from './mods/tools.ts';
import { mcpExpress } from "./mods/express.ts";

const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
config.pwd = process.cwd();
config.logfile = config.logfile || config.pwd + "/mcp.log";
config.args = process.argv;
config.prefix = config.prefix || '';
if (process.argv.includes('--rainbowroad')) {
  config.prefix = 'rb_' + config.prefix || '';
}
config.prefix = config.prefix.replaceAll(/_/g, '');

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

if (config.secrets?.mods) {
  config.mods = config.secrets.mods;
}

mcpExpress.setup(config, mcpServer, expressServer).then(() => {});

await Promise.all(
  (config.mods ?? []).map(async (mod) => {
    const { file, className } = mod;
    try {
      config.echo(`Try to register magical module: ${className}`);
      const importedMod = await import(config.pwd + "/" + file);
      if (importedMod && typeof importedMod[className]?.register === 'function') {
        await importedMod[className].register(config, mcpServer, expressServer);
        config.echo(`Registered magical module: ${className}`);
      } else {
        config.echo(`Module ${className} does not export a register function.`);
      }
    } catch (err) {
      config.echo(`Failed to load module ${className}:`, err, 'from', file);
    }
  })
);

config.echo("Starting UniCorn MagicCP server...");
config.logger({...config, secrets: '---secret---' });
// Magical transport selection: use HTTP if --rainbowroad flag is set
if (process.argv.includes('--rainbowroad')) {
  config.echo("Activating Rainbow Road...");
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
  config.echo("Standard Input/Output Unicorn is waiting for requests");
}

// This server was brought to you by