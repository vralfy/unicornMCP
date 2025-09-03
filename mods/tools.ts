import * as fs from 'fs';

export const mcpTools = {
  loadConfigFile: (configFile) => {
    if (!fs.existsSync(configFile)) {
      console.error("Config file not found:", configFile);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(configFile, "utf-8"));
  },

  loadConfig: () => {
    let configFile = process.cwd() + '/config.json';
    const configFlag = process.argv.find(arg => arg.startsWith('-c'));
    const configFlagLong = process.argv.find(arg => arg.startsWith('--config='));
    if (configFlag) {
      const configPath = process.argv[process.argv.indexOf(configFlag) + 1];
      if (configPath) {
        configFile = configPath;
      }
      console.log('found -c ', configFile);
    } else if (configFlagLong) {
      const configPath = configFlagLong.split('=')[1];
      if (configPath) {
        configFile = configPath;
      }
      console.log('found --config=', configFile);
    } else {
      console.log('No config flag found, using default config file:', configFile);
    }

    const config = mcpTools.loadConfigFile(configFile);
    mcpTools.setup(config);
    return config;
  },

  loadSecrets: (config) => {
    let configFile = config.pwd + "/secrets.json";
    const configFlag = process.argv.find(arg => arg.startsWith('-s'));
    const configFlagLong = process.argv.find(arg => arg.startsWith('--secrets='));
    if (configFlag) {
      const configPath = process.argv[process.argv.indexOf(configFlag) + 1];
      if (configPath) {
        configFile = configPath;
      }
      config.log('found -s ', configFile);
    } else if (configFlagLong) {
      const configPath = configFlagLong.split('=')[1];
      if (configPath) {
        configFile = configPath;
      }
      config.log('found --secrets=', configFile);
    } else {
      config.log('No secrets flag found, using default secrets file:', configFile);
    }
    // Check if secrets.json exists and load it if present
    if (!fs.existsSync(configFile)) {
      return config;
    }

    config.secrets = mcpTools.loadConfigFile(configFile);

    if (config.secrets?.mods) {
      config.secrets.mods.forEach((m) => {
        // check if there is already a mod with the same className
        if (!config.mods.find((mod) => mod.className === m.className)) {
          config.mods.push(m);
        } else {
          // replace existing mod
          const existingMod = config.mods.find((mod) => mod.className === m.className);
          if (existingMod) {
            Object.assign(existingMod, m);
          }
        }
      });
      config.mods = config.mods.filter((m) => !m.disabled);
    }
    return config;
  },

  setup: (config) => {
    try {
      config.server = config.server || {
        name: "Unicorn MCP Server",
        version: "1.0.0"
      };
      config.port = config.port || 3000;
      config.path = config.path || '/mcp';
      config.logfile = config.logfile || config.pwd + "/mcp.log";
      config.enableJsonOutput = config.enableJsonOutput || false;
      config.transportOptions = config.transportOptions || {
        enableDnsRebindingProtection: false,
        allowedHosts: ["localhost", "127.0.0.1", "localhost:3000"],
        allowedOrigins: ["http://localhost:3000"]
      };

      config.pwd = process.cwd();
      config.args = process.argv;
      config.prefix = config.prefix || '';
      config.logprefixes = config.logprefixes ?? ['🦄 ', '✨ ', '🌈 ', '🦋 ', '💫 ', '💖 ', '🌸 '];
      config.echo = (level, ...msg) => {
        level = level || console.log;
        config.logger(...msg);
        const prefix = config.logprefixes[Math.floor(Math.random() * config.logprefixes.length)];
        const timestamp = new Date().toISOString();
        const formatedParts = (msg ?? []).map(part => JSON.stringify(part));
        const formattedMsg = prefix + `[${timestamp}] ${formatedParts.join(' ')}`;
        level(formattedMsg);
      };

      config.logger = (...msg) => {
        const timestamp = new Date().toISOString();
        const formatedParts = (msg ?? []).map(part => JSON.stringify(part, null, 2));
        const formattedMsg = `[${timestamp}] ${formatedParts.join(' ')}\n`;
        fs.appendFileSync(config.logfile, formattedMsg, 'utf8', { flag: 'a' });
      };

      config.log = config.logger;
      config.info = (...msg) => config.echo(console.log, ...msg);
      config.warn = (...msg) => config.echo(console.warn, ...msg);
      config.error = (...msg) => config.echo(console.error, ...msg);

      return config;
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  },

  loadModules: async (config, mcp, express) => {
    await Promise.all(
      (config.mods ?? []).map(async (mod) => {
        const { file, className } = mod;
        try {
          config.info(`Try to register magical module: ${className}`);
          const importedMod = await import(config.pwd + "/" + file);
          if (importedMod && typeof importedMod[className]?.register === 'function') {
            await importedMod[className].register(config, mcp, express);
            config.info(`Registered magical module: ${className}`);
          } else {
            config.warn(`Module ${className} does not export a register function.`);
          }
        } catch (err) {
          config.error(`Failed to load module ${className}:`, err, 'from', file);
        }
      })
    );
  },
};