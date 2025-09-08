
import { registerMCPResource } from "./abstract.ts";

export const mcpServer = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Server';
      const callbacks = {};
      callbacks['config'] = async (args) => {
        return {...config, secrets: '--- that is secret ---'};
      }

      registerMCPResource(config, mcp, callbacks, pluginName, { name: 'config', description: null, args: {} });

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
