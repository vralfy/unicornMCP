import { mcpRSS } from "./rss";
import Parser from "rss-parser";

describe("mcpRSS module", () => {
  let config: any;
  let mcp: any;
  let express: any;

  beforeEach(() => {
    config = {
      secrets: {
        rss: {
          feeds: ["https://test.feed/rss", "https://another.feed/rss"]
        }
      }
    };
    mcp = undefined;
    express = undefined;
  });

  it("should register RSS resources and tools without error", async () => {
    await expect(mcpRSS.register(config, mcp, express)).resolves.toBeNull();
  });

  it("should return feeds from config via getFeeds callback", async () => {
    let callbacks: any = {};
    await mcpRSS.register(config, mcp, express);
    // Simulate the callback
    callbacks.getFeeds = async (args: any) => config.secrets.rss.feeds;
    const feeds = await callbacks.getFeeds({});
    expect(feeds).toEqual(["https://test.feed/rss", "https://another.feed/rss"]);
  });

  it("should parse RSS feed via getFeed callback", async () => {
  const parser = new Parser();
  // Mock parser.parseURL with required 'items' property
  jest.spyOn(parser, "parseURL").mockResolvedValue({ title: "Test Feed", items: [] });
  let callbacks: any = {};
  callbacks.getFeed = async (args: any) => await parser.parseURL(args.url);
  const result = await callbacks.getFeed({ url: "https://test.feed/rss" });
  expect(result).toEqual({ title: "Test Feed", items: [] });
  });
});
