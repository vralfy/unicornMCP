import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

export const mcpWeather = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      mcp.registerTool(
        config.prefix + "weather",
        {
          title: "Get Weather by Coordinates",
          description: "Retrieves the current weather using specific latitude and longitude coordinates.",
          inputSchema: {
            lat: z.number().min(-90).max(90).describe("Latitude coordinate (-90 to 90)"),
            lon: z.number().min(-180).max(180).describe("Longitude coordinate (-180 to 180)"),
          },
        },
        async ({ lat, lon }) => {
          config.info("Calling", config.prefix + "weather");
          const apiKey = config.secrets.openweathermap?.apiKey;
          if (!apiKey) {
            config.error("No API key found for OpenWeatherMap");
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
          config.log(`Weather retrieved: ${url} ${JSON.stringify(data)}`);
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
        config.prefix + "weathercity",
        {
          title: "Get Weather by City Name",
          description: "Retrieves the current weather by city name.",
          inputSchema: {
            city: z.string().min(2).max(100).describe("City name (e.g., 'Berlin', 'New York')"),
          },
        },
        async ({ city }) => {
          config.info("Calling", config.prefix + "weathercity");
          const apiKey = config.secrets?.openweathermap?.apiKey;
          if (!apiKey) {
            config.error("No API key found for OpenWeatherMap");
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
          config.log(`Weather retrieved: ${url} ${JSON.stringify(data)}`);
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
