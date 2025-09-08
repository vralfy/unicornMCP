
import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";
import { Builder, Browser } from 'selenium-webdriver'

// https://www.npmjs.com/package/selenium-webdriver
// Downloading chromedriver if needed: https://googlechromelabs.github.io/chrome-for-testing/#stable
// Downloading geckodriver (firefox) if needed: https://github.com/mozilla/geckodriver/releases/

export const mcpSelenium = {
  sessions: {},
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Selenium';
      const callbacks = {};
      callbacks['start'] = async (args) => {
        const sessionId = Math.floor(Math.random() * 1000) + '-' + (new Date()).getTime().toString();
        const session: { [index:string]: any } = { sessionId, args };

        try {
          config.info('Starting new Selenium session...', sessionId);
          const webdriver = await new Builder()
            .forBrowser(Browser.FIREFOX)
            // .setChromeOptions({

            // })
            // .setFirefoxOptions({

            // })
            .build();
          session["driver"] = webdriver;

          const url = args?.url ?? 'https://www.google.com/ncr';
          config.info('Opened URL for Selenium test:', url);
          await webdriver.get(url);
          // await webdriver.sleep(2000);
        } catch (error) {
          config.error("Error starting Selenium session:", error);
          delete mcpSelenium.sessions[sessionId];
          return error;
        }

        mcpSelenium.sessions[sessionId] = session;
        return sessionId;
      }

      callbacks['stop'] = async (args) => {
        if (!args?.sessionId) {
          return 'No session ID provided';
        }
        const sessionId = args.sessionId;
        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Stopping Selenium session:", sessionId);
          delete mcpSelenium.sessions[sessionId];

          if (session && session.driver) {
            await session.driver.quit();
          }
        } catch (err) {
          config.error("Error stopping Selenium session:", err);
          return err;
        }
        return sessionId;
      }

      callbacks['sessions'] = async (args) => {
        return mcpSelenium.sessions;
      }

      callbacks['openUrl'] = async(args) => {
        const sessionId = args?.sessionId;
        const url = args?.url;

        if (!sessionId || !url) {
          return 'No session ID or URL provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Navigating with Selenium:", sessionId, url);
          await session.driver.get(url);
        } catch (err) {
          config.error("Error navigating with Selenium:", err);
          return err;
        }
        return sessionId;
      }

      callbacks['source'] = async (args) => {
        const sessionId = args?.sessionId;

        if (!sessionId) {
          return 'No session ID provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Getting Selenium page source:", sessionId);
          const source = await session.driver.getPageSource();
          return source;
        } catch (err) {
          config.error("Error getting page source with Selenium:", err);
          return err;
        }
      }

      callbacks['screenshot'] = async (args) => {
        const sessionId = args?.sessionId;
        if (!sessionId) {
          return 'No session ID provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Taking screenshot for session:", sessionId);
          const screenshot = await session.driver.takeScreenshot();
          return screenshot;
        } catch (err) {
          config.error("Error taking screenshot with Selenium:", err);
          return err;
        }
      }

      [
        { name: 'start', description: "Start a new Selenium session", args: { url: z.string().describe("The URL to open in the browser") } },
        { name: 'stop', description: "Stop a Selenium session", args: { sessionId: z.string().describe("The ID of the session to stop") } },
        { name: 'sessions', asResource: true, description: "Get all active Selenium sessions", args: {} },
        { name: 'openUrl', description: "Open a URL in the browser", args: { sessionId: z.string().describe("The ID of the session to open the URL in"), url: z.string().describe("The URL to open") } },
        { name: 'source', asResource: true, description: "Get the page source of the current page", args: { sessionId: z.string().describe("The ID of the session to get the page source from") } },
        { name: 'screenshot', asResource: true, description: "Take a screenshot of the current page", args: { sessionId: z.string().describe("The ID of the session to take a screenshot of") } },
      ].forEach(item => {
        if (item.asResource) {
          registerMCPResource(config, mcp, callbacks, pluginName, item);
        }
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      const selfTest = async () => {
        const sessionId = await callbacks['start']();
        config.log('Selenium Self Test - Start:', sessionId);
        config.log('Selenium Self Test - Sessions:', await callbacks['sessions']({}));
        config.log('Selenium Self Test - Source:', await callbacks['source']({ sessionId }));
        config.log('Selenium Self Test - Screenshot:', await callbacks['screenshot']({ sessionId }));
        config.log('Selenium Self Test - Stop:', await callbacks['stop']({ sessionId }));
      };
      selfTest();

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
