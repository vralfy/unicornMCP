import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

export const mcpExamples = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      config.echo("Registering MCP examples...");
      mcp.registerPrompt(
        "exampleprompt",
        {
          title: "Example Prompt",
          description: "Generates a prompt",
        },
        ({ txt }) => {
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please check the text for spelling and grammar errors:\n\n${txt}`
                }
              }
            ]
          };
        }
      );

      mcp.registerResource(
        "exampleresource",
        new ResourceTemplate("echo://{message}", { list: undefined }),
        {
          title: "Echo a message",
          description: "Returns the input message",
        },
        async (uri, { message }) => ({
          contents: [{
            uri: uri.href,
            text: `Resource echo: ${message}`
          }]
        })
      );

      mcp.registerTool(
        "exampletool",
        {
          title: "Echo a message backwards",
          description: "Reverses the input message",
          argsSchema: { message: z.string() },
        },
        async ({ message }) => {
          message = message || "";
          return {
            content: [
              {
                type: "text",
                text: `Tool echo: ${message.split('').reverse().join('')}`
              }
            ]
          };
        }
      );

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
