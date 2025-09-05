
import z from "zod";
import Parser from 'rss-parser';
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpRSS = {
  // https://www.rss-verzeichnis.de/ << great list of rss feeds
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'RSSFeeds';
      const rssConfig = config.secrets?.rss ?? config.rss;
      const callbacks = {};
      callbacks['getFeeds'] = async (args) => {
        return rssConfig.feeds;
      }
      callbacks['getFeed'] = async (args) => {
        const parser = new Parser();
        return await parser.parseURL(args.url);
      }

      [
        { name: 'getFeeds', description: null, args: {} },
        { name: 'getFeed', description: null, args: { url: z.string().describe("The URL of the RSS feed to retrieve") } },
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
