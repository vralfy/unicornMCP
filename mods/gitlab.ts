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

      callbacks['fetch'] = async (path, args, asText = false) => {
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
        return asText ? await response.text() : await response.json();
      };

      const enc = (v) => encodeURIComponent(String(v));
      // Drops undefined values so they don't end up as "undefined" in the query string
      const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
      const maxLogChars = 30000;

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
        const { projectId, ...query } = args;
        return config.gitlab?.useGitBeaker ? await gitlab.Pipelines.all(projectId, opt) : await callbacks['fetch'](`projects/${enc(projectId)}/pipelines`, clean(query));
      };

      callbacks['mergerequests'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch']('merge_requests', clean({
          scope: args.scope ?? 'assigned_to_me',
          state: args.state ?? 'opened',
          search: args.search,
        }));
      };

      callbacks['mergerequest'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch'](`projects/${enc(args.projectId)}/merge_requests/${enc(args.mergeRequestIid)}`, {});
      };

      callbacks['mergerequestdiffs'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch'](`projects/${enc(args.projectId)}/merge_requests/${enc(args.mergeRequestIid)}/diffs`, {});
      };

      callbacks['mergerequestnotes'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch'](`projects/${enc(args.projectId)}/merge_requests/${enc(args.mergeRequestIid)}/notes`, { sort: 'asc' });
      };

      callbacks['pipelinejobs'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch'](`projects/${enc(args.projectId)}/pipelines/${enc(args.pipelineId)}/jobs`, {});
      };

      callbacks['joblog'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        const log = await callbacks['fetch'](`projects/${enc(args.projectId)}/jobs/${enc(args.jobId)}/trace`, undefined, true);
        // Job logs can be huge; the end of the log usually contains the failure
        return log.length > maxLogChars
          ? `[... log truncated, showing last ${maxLogChars} of ${log.length} characters ...]\n` + log.slice(-maxLogChars)
          : log;
      };

      callbacks['file'] = async (args) => {
        const err = await callbacks['noConfig'](args);
        if (err) return err;
        return await callbacks['fetch'](`projects/${enc(args.projectId)}/repository/files/${enc(args.filePath)}/raw`, clean({ ref: args.ref }), true);
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
        { name: 'pipelines', description: "Retrieves a list of pipelines of a project", args: { projectId: z.string().describe('Project ID or URL-encoded path, e.g. "group/project"'), ref: z.string().describe('Branch or tag').optional(), status: z.string().describe('e.g. failed, success, running').optional() } },
        { name: 'projects', description: "Retrieves a list of projects", args: {search: z.string().describe('Search term').optional() } },
        { name: 'mergerequests', description: "Lists merge requests across all projects. Defaults to open MRs assigned to me", args: { scope: z.enum(['assigned_to_me', 'created_by_me', 'reviewer', 'all']).describe('Defaults to assigned_to_me').optional(), state: z.enum(['opened', 'closed', 'merged', 'all']).describe('Defaults to opened').optional(), search: z.string().describe('Search in title and description').optional() } },
        { name: 'mergerequest', description: "Retrieves a single merge request", args: { projectId: z.string().describe('Project ID or path'), mergeRequestIid: z.string().describe('The MR number (iid) shown in GitLab, e.g. 123 for !123') } },
        { name: 'mergerequestdiffs', description: "Retrieves the file diffs of a merge request", args: { projectId: z.string().describe('Project ID or path'), mergeRequestIid: z.string().describe('The MR number (iid)') } },
        { name: 'mergerequestnotes', description: "Retrieves the comments/discussion of a merge request", args: { projectId: z.string().describe('Project ID or path'), mergeRequestIid: z.string().describe('The MR number (iid)') } },
        { name: 'pipelinejobs', description: "Lists the jobs of a pipeline incl. their status", args: { projectId: z.string().describe('Project ID or path'), pipelineId: z.string().describe('Pipeline ID') } },
        { name: 'joblog', description: "Retrieves the log of a CI job (last 30000 characters)", args: { projectId: z.string().describe('Project ID or path'), jobId: z.string().describe('Job ID') } },
        { name: 'file', description: "Retrieves the raw content of a file from a repository", args: { projectId: z.string().describe('Project ID or path'), filePath: z.string().describe('Path of the file in the repository'), ref: z.string().describe('Branch, tag or commit; defaults to the default branch').optional() } },
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
