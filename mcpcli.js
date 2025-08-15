import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import fs from "fs"

const info = JSON.parse(fs.readFileSync("mcp.json", "utf-8"))
const logfile = process.cwd() + "/mcp.log";

fs.writeFileSync(logfile, JSON.stringify(info, null, 2), { encoding: 'utf8', flag: 'w+' }, (err) => {
  if (err) {
    console.error("Error writing", logfile, err);
  } else {
    console.log(logfile, "created successfully.");
  }
});

const logger = (...msg) => {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg.join(' ')}\n`;
  fs.appendFileSync(logfile, formattedMsg, 'utf8', { flag: 'a' });
  console.log(formattedMsg);
}

logger("Starting UniCorn MCP server with info:", info);

const server = new McpServer(info.server, {
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
})

server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.tool(
  "echo",
  "Echo a message backwards",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message.split('').reverse().join('')}` }]
  })
);

server.tool(
  "add",
  "Add two numbers",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  })
);

server.prompt(
  "unicornprompt",
  { id: z.string() },
  async ({ id }) => {
    try {

      return {
        messages: [
          {
            role: "user",
            context: {
              type: "text",
              text: fs.readFileSync(process.cwd() + '/.vscode/prompts/basic.prompt.md')
            }
          }
        ]
      };
    } catch (e) {
      logger('Error creating unicorn prompt:', e.message);
      return {
        messages: [
          {
            role: "user",
            context: {
              type: "text",
              text: "Error creating unicorn prompt: " + e.message,
            }
          }
        ]
      };
    }

  }
);

server.tool(
  "unicorntool",
  "Provides a scene description",
  { id: z.number() },
  async ({ id }) => {
    const file = process.cwd() + '/missions/' + id + '.html';
    try {

      return {
        content: [{ type: "text", text: html }],
      }
    } catch (e) {
      logger('Error fetching scene description:', e.message);
      return {
        content: [{ type: "text", text: 'Error fetching scene description: ' + e.message }],
      }
    }
  }
);

const transport = new StdioServerTransport()
await server.connect(transport)