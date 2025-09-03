import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

export const mcpLocation = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      mcp.registerTool(
        config.prefix + "geolocation",
        {
          title: "Get Geolocation",
          description: "Retrieves the user's geolocation",
          inputSchema: {},
        },
        async ({ message }) => {
          config.info("Calling", config.prefix + "geolocation");
          message = message || "";
          // Get geolocation by http://ip-api.com/json/
          const response = await fetch("http://ip-api.com/json/");
          const data = await response.json();
          config.log(`Geolocation retrieved: ${JSON.stringify(data)}`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data),
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
