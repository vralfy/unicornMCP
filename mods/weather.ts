import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

export const mcpWeather = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      config.echo("Registering MCP weather...");

      mcp.registerTool(
        "weather",
        {
          title: "Get Weather",
          description: "Retrieves the current weather",
          inputSchema: {
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180),
          },
        },
        async ({ lat, lon }) => {
          const apiKey = config.secrets.openweathermap?.apiKey;
          if (!apiKey) {
            config.logger("No API key found for OpenWeatherMap");
            return {
              content: [
                {
                  type: "text",
                  text: "No API key found for OpenWeatherMap",
                }
              ]
            };
          }
          let url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}`;
          url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`;
          const response = await fetch(url);
          const data = await response.json();
          config.logger(`Weather retrieved: ${url} ${JSON.stringify(data)}`);
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
      mcp.registerTool(
        "weathercity",
        {
          title: "Get Weather by City name",
          description: "Retrieves the current weather in a given city",
          inputSchema: {
            city: z.string().min(2).max(100),
          },
        },
        async ({ city }) => {
          const apiKey = config.secrets?.openweathermap?.apiKey;
          if (!apiKey) {
            config.logger("No API key found for OpenWeatherMap");
            return {
              content: [
                {
                  type: "text",
                  text: "No API key found for OpenWeatherMap",
                }
              ]
            };
          }
          let url = `https://api.openweathermap.org/data/3.0/onecall?q=${city}&appid=${apiKey}`;
          url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;
          const response = await fetch(url);
          const data = await response.json();
          config.logger(`Weather retrieved: ${url} ${JSON.stringify(data)}`);
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
