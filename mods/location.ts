import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpLocation = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Location';
      const callbacks = {};
      callbacks['geoLocation'] = async (args) => {
        const response = await fetch("http://ip-api.com/json/");
        return await response.json();
      }

      [
        { name: 'geoLocation', description: null, args: { } },
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
