import { mcpWeather } from "./weather";
import { registerMCPResource, registerMCPTool } from "./abstract";
import "tslib";

// Mocks
jest.mock("undici", () => ({
  fetch: jest.fn()
}));
const { fetch } = require("undici");

jest.mock("./abstract", () => ({
  registerMCPResource: jest.fn(),
  registerMCPTool: jest.fn()
}));

describe("mcpWeather", () => {
  let config: any;
  let mcp: any;
  let express: any;

  beforeEach(() => {
    config = { secrets: { openweathermap: { apiKey: "test-key" } }, error: jest.fn() };
    mcp = undefined;
    express = undefined;
    (registerMCPResource as jest.Mock).mockClear();
    (registerMCPTool as jest.Mock).mockClear();
    (fetch as jest.Mock).mockClear();
  });

  it("registers MCP resources and tools", async () => {
    await mcpWeather.register(config, mcp, express);
    expect(registerMCPResource).toHaveBeenCalledTimes(2);
    expect(registerMCPTool).toHaveBeenCalledTimes(2);
  });

  it("returns error if no API key (coordinates)", async () => {
    config.secrets.openweathermap.apiKey = undefined;
    await mcpWeather.register(config, mcp, express);
    const callbacks = (registerMCPResource as jest.Mock).mock.calls[0][2];
    const result = await callbacks["coordinates"]({ lat: 0, lon: 0 });
    expect(result.content[0].text).toMatch(/No API key/);
    expect(config.error).toHaveBeenCalled();
  });

  it("returns error if no API key (city)", async () => {
    config.secrets.openweathermap.apiKey = undefined;
    await mcpWeather.register(config, mcp, express);
    const callbacks = (registerMCPResource as jest.Mock).mock.calls[1][2];
    const result = await callbacks["city"]({ city: "Berlin" });
    expect(result.content[0].text).toMatch(/No API key/);
    expect(config.error).toHaveBeenCalled();
  });

  it("fetches weather by coordinates", async () => {
    (fetch as jest.Mock).mockResolvedValue({ json: () => Promise.resolve({ weather: "sunny" }) });
    await mcpWeather.register(config, mcp, express);
    const callbacks = (registerMCPResource as jest.Mock).mock.calls[0][2];
    const result = await callbacks["coordinates"]({ lat: 52.52, lon: 13.405 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("lat=52.52&lon=13.405"));
    expect(result.weather).toBe("sunny");
  });

  it("fetches weather by city", async () => {
    (fetch as jest.Mock).mockResolvedValue({ json: () => Promise.resolve({ weather: "rainbow" }) });
    await mcpWeather.register(config, mcp, express);
    const callbacks = (registerMCPResource as jest.Mock).mock.calls[1][2];
    const result = await callbacks["city"]({ city: "RainbowCity" });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("q=RainbowCity"));
    expect(result.weather).toBe("rainbow");
  });
});

