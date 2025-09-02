import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import Parser from 'rss-parser';

export const mcpRSS = {
  // https://www.rss-verzeichnis.de/ << great list of rss feeds
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {

      const rssConfig = config.secrets?.rss ?? config.rss;

      const getFeed = async (url) => {
        const parser = new Parser();
        const feed = await parser.parseURL(url);
        return feed;
      }

      mcp.registerTool(
        config.prefix + "getfeeds",
        {
          title: "Get RSS feeds",
          description: "Returns a list of all available feeds",
          inputSchema: { },
        },
        async ({ }) => {
          config.echo("Calling", config.prefix + "getfeeds");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(rssConfig.feeds)
              }
            ]
          };
        }
      );

      mcp.registerTool(
        config.prefix + "getfeed",
        {
          title: "Get one specific rss feed",
          description: "Retrieves the details of a specific RSS feed",
          inputSchema: { id: z.string() },
        },
        async ({ id }) => {
          config.echo("Calling", config.prefix + "getfeed");

          const feed = await getFeed(rssConfig.feeds.find(f => f.id === id).url);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(feed)
              }
            ]
          };
        }
      );

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
