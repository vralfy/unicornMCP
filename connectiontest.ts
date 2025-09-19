/**
 * I noticed that sometimes my server has no internet access due to proxy issues.
 * This script tests connectivity to some common URLs, using the same proxy settings as the main server.
 * Usage: `node --experimental-strip-types connectiontest.ts`
 */
import fs from "fs";
import { setGlobalDispatcher, ProxyAgent } from 'undici';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const config = JSON.parse(fs.readFileSync('config.json', "utf-8"));
config.secrets = JSON.parse(fs.readFileSync('secrets.json', "utf-8"));
if (config.secrets?.proxy) {
  // Setting up proxy for undici (which powers fetch in Node.js)
  console.info(`Setting up proxy`);
  const proxyAgent = new ProxyAgent(config.secrets.proxy.http);
  setGlobalDispatcher(proxyAgent);
}

[
  'http://ip-api.com/json/',
  'https://www.google.com',
  ...(config.secrets?.openweathermap?.apiKey ? [`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${config.secrets?.openweathermap?.apiKey}`] : []),
].forEach(url => {
  console.info('ℹ️', `Testing connection to ${url}`);
  try {
    fetch(url).then(res => {
      if (res.ok) {
        console.info('✅', url, `Connection test successful`);
      } else {
        console.error('❌', url, `Connection test failed`);
      }
    });
  } catch (e) {
    console.error('❌', url, `Connection test failed`, e);
  }
});
