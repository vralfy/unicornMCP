import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpWeather = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Weather';
      const apiKey = config.secrets.openweathermap?.apiKey;

      const callbacks = {};
      callbacks['coordinates'] = async (args) => {
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
        let url = `https://api.openweathermap.org/data/3.0/onecall?lat=${args.lat}&lon=${args.lon}&appid=${apiKey}`;
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${args.lat}&lon=${args.lon}&appid=${apiKey}`;
        const response = await fetch(url);
        return await response.json();
      }

      callbacks['city'] = async (args) => {
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
          let url = `https://api.openweathermap.org/data/3.0/onecall?q=${args.city}&appid=${apiKey}`;
          url = `https://api.openweathermap.org/data/2.5/weather?q=${args.city}&appid=${apiKey}`;
          console.error(url);
          const response = await fetch(url);
          return await response.json();
      }

      [
        {
          name: 'coordinates', description: "Retrieves the current weather using specific latitude and longitude coordinates.", args: {
            lat: z.number().min(-90).max(90).describe("Latitude coordinate (-90 to 90)"),
            lon: z.number().min(-180).max(180).describe("Longitude coordinate (-180 to 180)"),
          }
        },
        {
          name: 'city', description: "Retrieves the current weather by city name.", args: {
            city: z.string().min(2).max(100).describe("City name (e.g., 'Berlin', 'New York')"),
          }
        },
      ].forEach(item => {
        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
