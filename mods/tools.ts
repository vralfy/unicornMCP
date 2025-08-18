import * as fs from 'fs';

export const mcpTools = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      config.logprefixes = ['🦄 ', '✨ ', '🌈 '];
      console.log("🦄 Registering MCP tools...");
      config.echo = (...msg) => {
        config.logger(...msg);
        const prefix = config.logprefixes[Math.floor(Math.random() * config.logprefixes.length)];
        const timestamp = new Date().toISOString();
        const formatedParts = (msg ?? []).map(part => JSON.stringify(part));
        const formattedMsg = prefix + `[${timestamp}] ${formatedParts.join(' ')}`;
        console.log(formattedMsg);
      };

      config.logger = (...msg) => {
        const timestamp = new Date().toISOString();
        const formatedParts = (msg ?? []).map(part => JSON.stringify(part));
        const formattedMsg = `[${timestamp}] ${formatedParts.join(' ')}\n`;
        fs.appendFileSync(config.logfile, formattedMsg, 'utf8', { flag: 'a' });
      };

      resolve(null);
    } catch (error) {
      reject(error);
    }
  }),
};