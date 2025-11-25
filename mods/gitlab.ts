import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";
import { Gitlab } from "@gitbeaker/rest";

export const mcpGitlab = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Gitlab';
      const serverConfig = config.secrets?.gitlab?.server;
      if (!serverConfig) {
        reject(new Error("No Gitlab configuration found"));
        return;
      }

      const gitlab = new Gitlab({
        ...{
          host: null,
          // token: null,
          // oauthToken: null,
          // jobToken: null,
          rejectUnauthorized: false,
          // sudo: false,
          // camelize: false,
          // queryTimeout: 30000,
          // profileToken: null,
          // profileMode: 'execution',
          // rateLimits: DEFAULT_RATE_LIMITS,
          // rateLimitDuration: 60,
        },
        ...serverConfig
      });

      const callbacks = {};
      callbacks['noConfig'] = async (args) => {
        if (!serverConfig) {
          config.error("No Gitlab configuration found");
          return {
            content: [
              {
                type: "text",
                text: "No Gitlab configuration found",
              }
            ]
          };
        }
        return null;
      };

      callbacks['users'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await gitlab.Users.all();
      };

      callbacks['projects'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await gitlab.Projects.all({ membership: true, perPage: 500, showExpanded: true });
      };

      [
        { name: 'users', description: "Retrieves a list of users", args: {} },
        { name: 'projects', description: "Retrieves a list of projects", args: {} },
      ].forEach(item => {
        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      const tst = async () => {
        try {
          console.error('DUDE', await callbacks['projects']());
        } catch (error) {
          console.error('Error in tst:', error);
        }
      };
      tst();

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
