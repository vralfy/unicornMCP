import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface MCPItem {
  name: string;
  description: string | null;
  args: Record<string, any>;
}

export const registerMCPResource = (config: any, mcp: any, callbacks: { [key: string]: Function }, pluginName: string, item: MCPItem) => {
  const resourceUrl = Object.keys(item.args ?? {}).length ? '/' + Object.keys(item.args ?? {}).map(key => `{${key}}`).join('/') : '';
  // register resource
  mcp.registerResource(
    config.prefix + pluginName.toLowerCase() + item.name.toLowerCase() + "resource",
    new ResourceTemplate(config.prefix + pluginName.toLowerCase() + "://" + item.name.toLowerCase() + resourceUrl, { list: undefined }),
    {
      title: pluginName + " " + item.name,
      description: item.description ?? "Returns a " + pluginName + " " + item.name.toLowerCase(),
    },
    async (uri, args) => {
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
  mcp.registerTool(
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
