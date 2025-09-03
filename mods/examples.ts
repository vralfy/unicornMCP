import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

export const mcpExamples = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      mcp.registerPrompt(
        config.prefix + "exampleprompt",
        {
          title: "Example Prompt",
          description: "Generates a prompt",
          argsSchema: { txt: z.string().describe("The text to check") }
        },
        ({ txt }) => {
          config.info("Calling", config.prefix + "exampleprompt");
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
        config.prefix + "exampleresource",
        new ResourceTemplate(config.prefix + "exampleresource://{message}", { list: undefined }),
        {
          title: "Echo a message",
          description: "Returns the input message",
        },
        async (uri, { message }) => {
          config.info("Calling", config.prefix + "exampleresource");
          return {
            contents: [{
              uri: uri.href, // this needs to be uri.href
              text: `Resource echo: ${message}`
            }]
          }
        }
      );

      mcp.registerTool(
        config.prefix + "exampletool",
        {
          title: "Echo a message backwards",
          description: "Reverses the input message",
          inputSchema: { message: z.string() },
        },
        async ({ message }) => {
          config.info("Calling", config.prefix + "exampletool");
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
