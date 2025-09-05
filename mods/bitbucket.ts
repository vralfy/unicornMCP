import Bitbucket from "bitbucket";
import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpBitbucket = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Bitbucket';
      if (!config.secrets?.bitbucket?.server) {
        config.error("No Bitbucket server config found");
        resolve(null);
        return;
      }
      const bitbucket = new Bitbucket.Bitbucket({
        request: {
          timeout: 20,
        },
        ...config.secrets.bitbucket.server
      });

      const callbacks = {};
      const defaultWorkspace = config.bitbucket.workspace;
      const enableWorkspace = !(defaultWorkspace || defaultWorkspace === null);
      const workspaceDescription = enableWorkspace ? { workspace: z.string().describe('Workspace name') } : {};
      [
        ...(enableWorkspace ? [{ name: 'Workspaces', section: 'workspaces', method: 'getWorkspaces', description: null, args: { } }] : []),
        { name: 'Project', section: 'projects', method: 'getProject', description: null, args: { ...workspaceDescription, project_key: z.string().describe('Project key') } },
        { name: 'Branches', section: 'repositories', method: 'listBranches', description: null, args: { ...workspaceDescription, repo_slug: z.string().describe('Repository name') } },
      ].forEach(item => {
        callbacks[item.name] = async (args) => {
          return new Promise((resolve, reject) => {
            bitbucket[item.section][item.method]({...args, ...( enableWorkspace ? {} : { workspace: defaultWorkspace })}).then((data) => resolve(data)).catch(err => reject(err));
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
