import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";
import { Gitlab } from "@gitbeaker/rest";
// import { BasePaginationRequestOptions, Gitlab, OffsetPaginationRequestOptions, ShowExpanded, Sudo } from "@gitbeaker/rest";

export const mcpGitlab = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Gitlab';
      const serverConfig = config.secrets?.gitlab?.server;
      if (!serverConfig) {
        reject(new Error("No Gitlab configuration found"));
        return;
      }

      // Build a dispatcher that handles both proxy and SSL settings 🦄✨
      // If a proxy is configured, use ProxyAgent (which also handles rejectUnauthorized),
      // otherwise fall back to a plain Agent with rejectUnauthorized: false.

      const gitlab = new Gitlab({
        host: null,
        queryTimeout: 300000, // 5 minutes
        // token: null,
        // oauthToken: null,
        // jobToken: null,
        // NOTE: gitbeaker's 'agent' expects a Node.js http.Agent, NOT an undici Agent.
        // SSL/proxy is handled via setGlobalDispatcher() in mcp.ts instead. 🦄
        // Pass dispatcher so gitbeaker routes through proxy and skips SSL verification 🌈
        // agent: config.proxy.dispatcher,
        // sudo: false,
        // camelize: false,
        // profileToken: null,
        // profileMode: 'execution',
        // rateLimits: DEFAULT_RATE_LIMITS,
        // rateLimitDuration: 60,
        ...serverConfig,
      });

      const defaultRequestOptions = { //: BasePaginationRequestOptions<"offset"> & OffsetPaginationRequestOptions & Sudo & ShowExpanded<true> = {
        perPage: 100,
        maxPages: 10,
        per_page: 100,
        showExpanded: false,
      }

      const requestOptions = {
        'projects' : {
          membership: true,
        }
      }

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
          config.error('🌈 Fetch timeout! Aborting magical request...');
          controller.abort();
        }, 20000); // 10 second timeout
        const query = (args ? '?' + new URLSearchParams({
          ...defaultRequestOptions,
          ...(requestOptions[path] ?? {}),
          ...args,
        }).toString() : '')
        const url = serverConfig.host + '/api/v4/' + path + query;
        const opt = {
          headers: {
            'PRIVATE-TOKEN': serverConfig.token,
          },
          signal: controller.signal,
        };

        const response = await config.proxy.fetch(url, opt);
        clearTimeout(timeoutId);
        return await response.json();
      };

      callbacks['users'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        const opt = {
          ...defaultRequestOptions,
          ...(requestOptions['users'] ?? {}),
          ...args
        };
        return config.gitlab?.useGitBeaker ? await gitlab.Users.all(opt) : await callbacks['fetch']('users', args);
      };

      callbacks['pipelines'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        const opt = {
          ...defaultRequestOptions,
          ...(requestOptions['pipelines'] ?? {}),
          ...args
        };
        return config.gitlab?.useGitBeaker ? await gitlab.Pipelines.all(args.projectId, opt) : await callbacks['fetch']('pipelines', args);
      };

      callbacks['projects'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        const opt = {
          ...defaultRequestOptions,
          ...(requestOptions['projects'] ?? {}),
          ...args
        };
        return config.gitlab?.useGitBeaker ? await gitlab.Projects.all(opt) : await callbacks['fetch']('projects', args);
      };

      [
        { name: 'users', description: "Retrieves a list of users", args: {} },
        { name: 'pipelines', description: "Retrieves a list of pipelines", args: {projectId: z.string().describe('Project Id')} },
        { name: 'projects', description: "Retrieves a list of projects", args: {search: z.string().describe('Search term').optional() } },
      ].forEach(item => {
        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      // const tst = async () => {
      //   try {
      //     const fetch = await callbacks['fetch']('projects', {});
      //     const gitbeaker = await gitlab.Projects.all({ membership: true, ...defaultRequestOptions });
      //     console.error('use git breaker:', config.gitlab?.useGitBeaker ? 'true' : 'false')
      //     console.error('proxyUrl:', config.secrets?.proxy?.http ?? '(none)')
      //     console.error('host:', serverConfig.host)
      //     // console.error('fetch', fetch);
      //     // console.error('gitbreaker', gitbeaker);
      //   } catch (error) {
      //     console.error('💫 Error in magical tst function:', error.name, error.message);
      //     console.error('💫 Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      //     if (error.name === 'AbortError') {
      //       console.error('🦄 Request was aborted due to timeout - the rainbow road is too long!');
      //     }
      //   }
      // };
      // tst();
      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
