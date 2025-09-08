
import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";
import { Builder, Browser, By, Key } from 'selenium-webdriver'

// https://www.npmjs.com/package/selenium-webdriver
// Downloading chromedriver if needed: https://googlechromelabs.github.io/chrome-for-testing/#stable
// Downloading geckodriver (firefox) if needed: https://github.com/mozilla/geckodriver/releases/

export const mcpSelenium = {
  sessions: {},
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    config.selenium = config.selenium || {};
    config.selenium.timeout = config.selenium.timeout || 2000;
    config.selenium.wait = config.selenium.wait || 1000;

    try {
      const pluginName = 'Selenium';
      const callbacks = {};

      callbacks['sessions'] = async (args) => {
        return mcpSelenium.sessions;
      }

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

          // bring to front
          await webdriver.manage().window().maximize();

          const url = args?.url ?? 'https://www.google.com/ncr';
          config.info('Opened URL for Selenium test:', url);
          await webdriver.get(url);
          await webdriver.sleep(config.selenium.timeout);
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
        return await callbacks['sessions'](args);
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
          await session.driver.sleep(config.selenium.wait);
          return await callbacks['source'](args);
        } catch (err) {
          config.error("Error navigating with Selenium:", err);
          return err;
        }
      }

      callbacks['reload'] = async (args) => {
        const sessionId = args?.sessionId;

        if (!sessionId) {
          return 'No session ID provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Reloading page with Selenium:", sessionId);
          await session.driver.navigate().refresh();
          await session.driver.sleep(config.selenium.wait);
          return await callbacks['source'](args);
        } catch (err) {
          config.error("Error reloading page with Selenium:", err);
          return err;
        }
      }

      callbacks['fullsource'] = async (args) => {
        const sessionId = args?.sessionId;

        if (!sessionId) {
          return 'No session ID provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Getting full Selenium page source:", sessionId);
          const source = await session.driver.getPageSource();
          return source;
        } catch (err) {
          config.error("Error getting page source with Selenium:", err);
          return err;
        }
      }

      callbacks['source'] = async (args) => {
        try {
          let source = await callbacks['fullsource'](args);
          config.info("Getting stripped Selenium page source:", args?.sessionId);
          // Strip down to <body> part
          const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            source = bodyMatch[1];
          }
          // strip down inline javascript
          source = source.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
          // strip down inline css
          source = source.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
          // strip all html comments
          source = source.replace(/<!--[\s\S]*?-->/gi, '');
          return source;
        } catch (err) {
          config.error("Error getting page source with Selenium:", err);
          return err;
        }
      }

      callbacks['click'] = async (args) => {
        const sessionId = args?.sessionId;
        const xpath = args?.xpath;

        if (!sessionId || !xpath) {
          return 'No session ID or XPath provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Clicking element with Selenium:", sessionId, xpath);
          const element = await session.driver.findElement(By.xpath(xpath));
          await element.click();
          await session.driver.sleep(config.selenium.wait);
          return await callbacks['source'](args);
        } catch (err) {
          config.error("Error clicking element with Selenium:", err);
          return err;
        }
      }

      callbacks['enterValue'] = async (args) => {
        const sessionId = args?.sessionId;
        const xpath = args?.xpath;
        const value = args?.value;

        if (!sessionId || !xpath || !value) {
          return 'No session ID, XPath or value provided';
        }

        const session = mcpSelenium.sessions[sessionId];
        if (!session || !session.driver) {
          return 'Invalid session ID';
        }

        try {
          config.info("Entering value with Selenium:", sessionId, xpath, value);
          const element = await session.driver.findElement(By.xpath(xpath));
          await element.clear();
          // click, and mark all
          await element.click();
          await element.sendKeys(Key.chord(Key.CONTROL, 'a'));
          // enter the value
          await element.sendKeys(value);
          // blur
          await element.sendKeys(Key.TAB);
          await session.driver.sleep(config.selenium.wait);

          return await callbacks['source'](args);
        } catch (err) {
          config.error("Error entering value with Selenium:", err);
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
        { name: 'reload', description: "Reload the current page", args: { sessionId: z.string().describe("The ID of the session to reload the page in") } },
        // { name: 'fullsource', asResource: true, description: "Get the full page source of the current page", args: { sessionId: z.string().describe("The ID of the session to get the full page source from") } },
        { name: 'source', asResource: true, description: "Get the page source of the current page", args: { sessionId: z.string().describe("The ID of the session to get the page source from") } },
        { name: 'click', description: "Click an element on the page", args: { sessionId: z.string().describe("The ID of the session to click the element in"), xpath: z.string().describe("The XPath of the element to click") } },
        { name: 'enterValue', description: "Enter a value into an input field", args: { sessionId: z.string().describe("The ID of the session to enter the value in"), xpath: z.string().describe("The XPath of the input field"), value: z.string().describe("The value to enter") } },
        // { name: 'screenshot', asResource: true, description: "Take a screenshot of the current page", args: { sessionId: z.string().describe("The ID of the session to take a screenshot of") } },
      ].forEach(item => {
        if (item.asResource) {
          registerMCPResource(config, mcp, callbacks, pluginName, item);
        }
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      callbacks['selfTest'] = async (args) => {
        const sessionId = await callbacks['start']();
        config.log('Selenium Self Test - Start:', sessionId);
        config.log('Selenium Self Test - Sessions:', await callbacks['sessions']({}));
        config.log('Selenium Self Test - Source:', await callbacks['source']({ sessionId }));
        config.log('Selenium Self Test - Screenshot:', await callbacks['screenshot']({ sessionId }));
        config.log('Selenium Self Test - Stop:', await callbacks['stop']({ sessionId }));
      };
      // callbacks['selfTest']();

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
