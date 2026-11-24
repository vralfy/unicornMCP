import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

// Confluence REST API (v1) via fetch, so requests go through the configured proxy.
// Works with Confluence Cloud (baseUrl "https://<site>.atlassian.net/wiki", username = e-mail, password = API token)
// and Confluence Data Center (baseUrl "https://host/confluence", username/password or token = personal access token).
export const mcpConfluence = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Confluence';
      const server = config.secrets?.confluence?.server;
      if (!server) {
        reject(new Error("No Confluence server config found"));
        return;
      }

      const baseUrl = String(server.baseUrl).replace(/\/+$/, '');
      const hostname = new URL(baseUrl).hostname;
      const noProxy: string[] = config.secrets?.proxy?.noProxy ?? [];
      const bypassProxy = server.useProxy === false
        || noProxy.some((entry) => {
          const suffix = String(entry).replace(/^\*?\./, '');
          return hostname === suffix || hostname.endsWith('.' + suffix);
        });
      const doFetch = bypassProxy ? config.proxy.fetch : config.proxy.fetchProxy;

      const authHeader = server.token
        ? 'Bearer ' + server.token
        : 'Basic ' + Buffer.from(server.username + ':' + server.password).toString('base64');

      const get = async (path: string, query: Record<string, any> = {}) => {
        const qs = new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''))).toString();
        const url = baseUrl + '/rest/api/' + path + (qs ? '?' + qs : '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await doFetch(url, {
            headers: { Authorization: authHeader, Accept: 'application/json' },
            signal: controller.signal,
          });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 300)}`);
          }
          return JSON.parse(text);
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const enc = (v) => encodeURIComponent(String(v));
      const pageUrl = (page) => page?._links?.webui ? baseUrl + page._links.webui : undefined;

      // Turns plain search terms into CQL; real CQL (containing an operator) is passed through
      const toCql = (query: string, spaceKey?: string) => {
        const isCql = /(~|=|!=|\bAND\b|\bOR\b|\bORDER BY\b)/.test(query);
        let cql = isCql ? query : `text ~ "${query.replace(/"/g, '\\"')}"`;
        if (spaceKey) cql = `space = "${spaceKey}" AND (${cql})`;
        return cql;
      };

      const callbacks = {};

      callbacks['Space'] = async (args) => get(`space/${enc(args.space)}`, { expand: 'description.plain,homepage' });

      callbacks['PageContent'] = async (args) => {
        const page = await get(`content/${enc(args.pageId)}`, { expand: 'body.storage,version,space,ancestors' });
        return {
          id: page.id,
          title: page.title,
          space: page.space?.key,
          version: page.version?.number,
          lastModified: page.version?.when,
          lastModifiedBy: page.version?.by?.displayName,
          ancestors: (page.ancestors ?? []).map((a) => ({ id: a.id, title: a.title })),
          url: pageUrl(page),
          body: page.body?.storage?.value,
        };
      };

      callbacks['PageLabels'] = async (args) => {
        const result = await get(`content/${enc(args.pageId)}/label`);
        return (result.results ?? []).map((l) => l.name);
      };

      callbacks['search'] = async (args) => {
        const result = await get('content/search', {
          cql: toCql(args.query, args.spaceKey),
          limit: args.limit ?? 25,
          expand: 'space,version',
        });
        return {
          totalSize: result.totalSize ?? result.size,
          results: (result.results ?? []).map((r) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            space: r.space?.key,
            lastModified: r.version?.when,
            url: pageUrl(r),
          })),
        };
      };

      callbacks['PageByTitle'] = async (args) => {
        const result = await get('content', { spaceKey: args.spaceKey, title: args.title, expand: 'version' });
        return (result.results ?? []).map((r) => ({ id: r.id, title: r.title, lastModified: r.version?.when, url: pageUrl(r) }));
      };

      callbacks['PageChildren'] = async (args) => {
        const result = await get(`content/${enc(args.pageId)}/child/page`, { limit: 100 });
        return (result.results ?? []).map((r) => ({ id: r.id, title: r.title, url: pageUrl(r) }));
      };

      callbacks['PageComments'] = async (args) => {
        const result = await get(`content/${enc(args.pageId)}/child/comment`, { expand: 'body.storage,version', depth: 'all', limit: 100 });
        return (result.results ?? []).map((c) => ({
          id: c.id,
          author: c.version?.by?.displayName,
          created: c.version?.when,
          body: c.body?.storage?.value,
        }));
      };

      callbacks['PageAttachments'] = async (args) => {
        const result = await get(`content/${enc(args.pageId)}/child/attachment`, { limit: 100, expand: 'version' });
        return (result.results ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          mediaType: a.extensions?.mediaType ?? a.metadata?.mediaType,
          fileSize: a.extensions?.fileSize,
          lastModified: a.version?.when,
          download: a._links?.download ? baseUrl + a._links.download : undefined,
        }));
      };

      [
        { name: 'Space', description: 'Returns a Confluence space by its key', args: { space: z.string().describe('The key of the Confluence space') } },
        { name: 'PageContent', description: 'Returns a Confluence page incl. its body (storage format)', args: { pageId: z.string().describe('The ID of the Confluence page') } },
        { name: 'PageLabels', description: 'Returns the labels of a Confluence page', args: { pageId: z.string().describe('The ID of the Confluence page') } },
        { name: 'search', description: 'Searches Confluence. Accepts plain search terms or CQL, e.g. \'title ~ "Release" AND type = page\'', args: { query: z.string().describe('Search terms or CQL'), spaceKey: z.string().describe('Restrict to a space').optional(), limit: z.number().describe('Max results, default 25').optional() } },
        { name: 'PageByTitle', description: 'Finds a Confluence page by its exact title within a space', args: { spaceKey: z.string().describe('The key of the Confluence space'), title: z.string().describe('The exact page title') } },
        { name: 'PageChildren', description: 'Lists the child pages of a Confluence page', args: { pageId: z.string().describe('The ID of the Confluence page') } },
        { name: 'PageComments', description: 'Returns the comments of a Confluence page', args: { pageId: z.string().describe('The ID of the Confluence page') } },
        { name: 'PageAttachments', description: 'Lists the attachments of a Confluence page', args: { pageId: z.string().describe('The ID of the Confluence page') } },
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
