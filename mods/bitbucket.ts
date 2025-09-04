import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import Bitbucket from "bitbucket";
import z from "zod";

export const mcpBitbucket = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const bitbucket = new Bitbucket.Bitbucket({
        request: {
          timeout: 10,
        },
        ...config.secrets.bitbucket.server
      });
      const callbacks = {};
      // bitbucket.projects.getProject
      [
        { name: 'Workspaces', section: 'workspaces', method: 'getWorkspaces', description: null, args: { } },
        { name: 'Project', section: 'projects', method: 'getProject', description: null, args: { workspace: z.string().describe('Workspace name'), project_key: z.string().describe('Project key') } },
        { name: 'Branches', section: 'repositories', method: 'listBranches', description: null, args: { workspace: z.string().describe('Workspace name'), repo_slug: z.string().describe('Repository name') } },
      ].forEach(item => {
        callbacks['get' + item.name] = async (args) => {
          console.error('callback', item.name, args)
          return new Promise((resolve, reject) => {
            bitbucket[item.section][item.method]({...args}).then((data) => resolve(data)).catch(err => reject(err));
          });
        };

        const resourceUrl = Object.keys(item.args ?? {}).length ? '/' + Object.keys(item.args ?? {}).map(key => `{${key}}`).join('/') : '';
        // register resource
        mcp.registerResource(
          config.prefix + "bitbucket" + item.name.toLowerCase() + "resource",
          new ResourceTemplate(config.prefix + "bitbucket://" + item.name.toLowerCase() + resourceUrl, { list: undefined }),
          {
            title: "Bitbucket " + item.name,
            description: item.description ?? "Returns a bitbucket " + item.name.toLowerCase(),
          },
          async (uri, args) => {
            try {
              config.info('Retrieving Bitbucket ' + item.name + ':', args);
              const returnvalue = await callbacks['get' + item.name](args);
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
          config.prefix + "bitbucket" + item.name.toLowerCase(),
          {
            title: "Bitbucket " + item.name,
            description: item.description ?? "Returns a bitbucket " + item.name.toLowerCase(),
            inputSchema: item.args ?? {},
          },
          async (args) => {
            try {
              config.info('Retrieving Bitbucket ' + item.name + ':', args);
              const returnvalue = await callbacks['get' + item.name](args);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(returnvalue, null, 2)
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
