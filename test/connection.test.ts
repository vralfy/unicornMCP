import "tslib";
import * as fs from "fs";
import { ProxyAgent, setGlobalDispatcher, fetch } from "undici";

describe("Connection test suite", () => {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

  let config: any = {};
  if (fs.existsSync('config.json')) {
    config = JSON.parse(fs.readFileSync('config.json', "utf-8"));
  }
  if (fs.existsSync('secrets.json')) {
    config.secrets = JSON.parse(fs.readFileSync('secrets.json', "utf-8"));
  }

  const sitesToCheck = [
    ...(config.secrets?.openweathermap?.apiKey ? [`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${config.secrets?.openweathermap?.apiKey}`] : []),
    'http://ip-api.com/json/',
    'https://www.google.com',
    'https://github.com',
  ];

  if (config.secrets?.proxy) {
    // Setting up proxy for undici (which powers fetch in Node.js)
    console.info(`Setting up proxy`);
    const proxyAgent = new ProxyAgent(config.secrets.proxy.http);
    setGlobalDispatcher(proxyAgent);
  }

  sitesToCheck.forEach(url => {
    it(`should successfully connect to ${url}`, async () => {
      try {
        const res = await fetch(url);
        expect(res.ok).toBe(true);
      } catch (e: any) {
        throw new Error(`Connection test failed to ${url}: ${e}`);
      }
    });
  });

});

