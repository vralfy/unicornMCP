import Confluence from "confluence-api";
import { z } from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpConfluence = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Confluence';
      if (!config.secrets?.confluence?.server) {
        config.error("No Confluence server config found");
        resolve(null);
        return;
      }
      const confluence = new Confluence({
        "version": 4,
        ...config.secrets.confluence.server
      });
      const callbacks = {};

      [
        { name: 'Space', method: 'getSpace', description: null, args: { space: z.string().describe('The ID of the Confluence space to retrieve') } },
        { name: 'PageContent', method: 'getContentById', description: null, args: { pageId: z.string().describe('The ID of the Confluence page to retrieve') } },
        { name: 'PageLabels', method: 'getLabels', description: null, args: { pageId: z.string().describe('The ID of the Confluence page to retrieve') } },
        { name: 'search', method: 'search', description: 'Search for confluence article', args: { query: z.string().describe('The search query') } },
      ].forEach(item => {
        callbacks[item.name] = async (args) => {
          return new Promise((resolve, reject) => {
            confluence[item.method](...Object.values(args), (err, data) => {
              if (err) {
                reject(new Error(`Error retrieving ${pluginName} ${item.name}: ${err.message}`));
              } else {
                resolve(data);
              }
            });
          });
        };

        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
