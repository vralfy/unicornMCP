import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface MCPItem {
  name: string;
  description: string | null;
  args: Record<string, any>;
}

export const registerMCPResource = (config: any, mcp: any, callbacks: { [key: string]: Function }, pluginName: string, item: MCPItem) => {
  if (!mcp) return;
  const argKeys = Object.keys(item.args ?? {});
  const resourceUrl = argKeys.length ? '/' + argKeys.map(key => `{${key}}`).join('/') : '';
  const baseUri = config.prefix + pluginName.toLowerCase() + "://" + item.name.toLowerCase();
  // Resources without args are registered with a fixed URI so they show up in resources/list
  // (and thus in @-mention completion). Resources with args stay templates, since their
  // concrete URIs cannot be enumerated.
  const uriOrTemplate = argKeys.length
    ? new ResourceTemplate(baseUri + resourceUrl, { list: undefined })
    : baseUri;
  // register resource
  mcp?.registerResource(
    config.prefix + pluginName.toLowerCase() + item.name.toLowerCase() + "resource",
    uriOrTemplate,
    {
      title: pluginName + " " + item.name,
      description: item.description ?? "Returns a " + pluginName + " " + item.name.toLowerCase(),
    },
    async (uri, variables) => {
      // For fixed-URI resources the second parameter is the request context, not template variables
      const args = argKeys.length ? variables : {};
      try {
        config.info('Retrieving ' + pluginName + ' ' + item.name + ':', args);
        const returnvalue = await callbacks[item.name](args);
        return {
          contents: [{
            uri: uri.href,
            text: typeof returnvalue === 'string' ? returnvalue : JSON.stringify(returnvalue, null, 2)
          }]
        };
      } catch (e) {
        config.error("Error retrieving " + pluginName + " " + item.name + ":", e.message);
        return {
          contents: [{
            uri: uri.href,
            text: e.message
          }]
        };

      }
    }
  );
}

export const registerMCPTool = (config: any, mcp: any, callbacks: { [key: string]: Function }, pluginName: string, item: MCPItem) => {
  if (!mcp) return;
  mcp?.registerTool(
    config.prefix + pluginName.toLowerCase() + item.name.toLowerCase(),
    {
      title: pluginName + " " + item.name,
      description: item.description ?? "Returns a " + pluginName + " " + item.name.toLowerCase(),
      inputSchema: item.args ?? {},
    },
    async (args) => {
      try {
        config.info('Retrieving ' + pluginName + ' ' + item.name + ':', args);
        const returnvalue = await callbacks[item.name](args);
        return {
          content: [
            {
              type: "text",
              text: typeof returnvalue === 'string' ? returnvalue : JSON.stringify(returnvalue, null, 2)
            }
          ]
        };
      } catch (e) {
        config.error("Error retrieving " + pluginName + " " + item.name + ":", e.message);
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
}

// export abstract class AbstractPlugin {
//   abstract register(config: any, mcp: any, express: any): Promise<void>;

//   public registerResource(config: any, mcp: any, callbacks: { [key: string]: Function }, pluginName: string, item: MCPItem) {
//     registerMCPResource(config, mcp, callbacks, pluginName, item);
//   }

//   public registerTool(config: any, mcp: any, callbacks: { [key: string]: Function }, pluginName: string, item: MCPItem) {
//     registerMCPTool(config, mcp, callbacks, pluginName, item);
//   }
// }
