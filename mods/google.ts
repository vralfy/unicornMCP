import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpGoogle = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Google';
      const callbacks = {};
      callbacks['search'] = async (args) => {
        return new Promise((resolve, reject) => {
          fetch('https://google.com/search?q=' + encodeURIComponent(args.query))
            .then(response => response.text())
            .then(html => resolve(html))
            .catch(err => reject(err));
        });
      };

      [
        { name: 'search', description: null, args: { query: z.string().describe('Search query') } },
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
