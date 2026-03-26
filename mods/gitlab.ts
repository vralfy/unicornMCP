import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";
import { Gitlab } from "@gitbeaker/rest";
import { fetch, Agent } from "undici";

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

      callbacks['fetch'] = async (path, args) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error('🌈 Fetch timeout! Aborting magical request...');
          controller.abort();
        }, 10000); // 10 second timeout
        const agent = new Agent({
          connect: {
            rejectUnauthorized: false
          }
        });
        const response = await fetch(serverConfig.host + '/api/v4/' + path, {
          headers: {
            'PRIVATE-TOKEN': serverConfig.token,
          },
          signal: controller.signal,
          dispatcher: agent
        });
        clearTimeout(timeoutId);
        return await response.json();
      };

      callbacks['users'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return config.gitlab?.useGitBeaker ? await gitlab.Users.all() : await callbacks['fetch']('users', args);
      };

      callbacks['projects'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return config.gitlab?.useGitBeaker ? await gitlab.Projects.all({ membership: true, perPage: 500, showExpanded: true }) : await callbacks['fetch']('projects', args);
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
          console.error(await callbacks['fetch']('projects', {}));
        } catch (error) {
          console.error('💫 Error in magical tst function:', error.name, error.message);
          if (error.name === 'AbortError') {
            console.error('🦄 Request was aborted due to timeout - the rainbow road is too long!');
          }
        }
      };

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
