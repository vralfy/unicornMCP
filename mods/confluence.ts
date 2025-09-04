import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import Confluence from "confluence-api";
import z from "zod";

export const mcpConfluence = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const confluence = new Confluence({
        "version": 4,
        ...config.secrets.confluence.server
      });
      const callbacks = {};

      [
        { name: 'Space', jiraMethod: 'getSpace', description: null, args: { space: z.string().describe('The ID of the Confluence space to retrieve') } },
        { name: 'PageContent', jiraMethod: 'getContentById', description: null, args: { pageId: z.string().describe('The ID of the Confluence page to retrieve') } },
        { name: 'PageLabels', jiraMethod: 'getLabels', description: null, args: { pageId: z.string().describe('The ID of the Confluence page to retrieve') } },
        { name: 'search', jiraMethod: 'search', description: 'Search for confluence article', args: { query: z.string().describe('The search query') } },
      ].forEach(item => {
        callbacks['get' + item.name] = async (...args) => {
          return new Promise((resolve, reject) => {
            confluence[item.jiraMethod](...args, (err, data) => {
              if (err) {
                reject(new Error(`Error retrieving Confluence ${item.name}: ${err.message}`));
              } else {
                resolve(data);
              }
            });
          });
        };

        const resourceUrl = Object.keys(item.args ?? {}).length ? '/' + Object.keys(item.args ?? {}).map(key => `{${key}}`).join('/') : '';
        // register resource
        mcp.registerResource(
          config.prefix + "confluence" + item.name.toLowerCase() + "resource",
          new ResourceTemplate(config.prefix + "confluence://" + item.name.toLowerCase() + resourceUrl, { list: undefined }),
          {
            title: "Confluence " + item.name,
            description: item.description ?? "Returns a confluence " + item.name.toLowerCase(),
          },
          async (uri, args) => {
            try {
              config.info('Retrieving Confluence ' + item.name + ':', args);
              const returnvalue = await callbacks['get' + item.name](...Object.values(args));
              return {
                contents: [{
                  uri: uri.href,
                  text: JSON.stringify(returnvalue, null, 2)
                }]
              };
            } catch (e) {
              return {
                contents: [{
                  uri: uri.href,
                  text: e.message
                }]
              };

            }
          }
        );

        mcp.registerTool(
          config.prefix + "confluence" + item.name.toLowerCase(),
          {
            title: "Confluence " + item.name,
            description: item.description ?? "Returns a confluence " + item.name.toLowerCase(),
            inputSchema: item.args ?? {},
          },
          async (args) => {
            try {
              config.info('Retrieving Confluence ' + item.name + ':', args);
              const returnValue = await callbacks['get' + item.name](...Object.values(args));
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(returnValue, null, 2)
                  }
                ]
              };
            } catch (e) {
              config.error("Error retrieving Confluence " + item.name.toLowerCase() + ":", e.message);
              return {
                content: [
                  {
                    type: "text",
                    text: e.message
                  }
                ]
              };
            }
          }
        );
      });

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
