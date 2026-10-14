import fs from "fs";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpMattpocock = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(config.pwd + '/assets/mattpocock/skills/skills')) {
        resolve(null);
        return;
      }
      const pluginName = 'MattPocock';
      const callbacks = {}
      config.info('Scanning skills directory:', config.pwd + '/assets/mattpocock/skills/skills');
      ['productivity'].forEach(category => {
        console.log('Loading skills for category:', category);
        fs.readdirSync(config.pwd + '/assets/mattpocock/skills/skills/' + category)
          .filter(subfolder => fs.statSync(config.pwd + '/assets/mattpocock/skills/skills/' + category + '/' + subfolder).isDirectory())
          .forEach(subfolder => {
            const item = { name: 'skill_' + category + '_' + subfolder, description: `Skill from ${category}/${subfolder}`, args: {} };
            callbacks[item.name] = async (args) => {
              let content = fs.readFileSync(config.pwd + '/assets/mattpocock/skills/skills/' + category + '/' + subfolder + '/SKILL.md', 'utf8');
              return content;
            };

            registerMCPResource(config, mcp, callbacks, pluginName, item);
            registerMCPTool(config, mcp, callbacks, pluginName, item);
            mcp.registerPrompt(item.name, {
              title: `Skill: ${category}/${subfolder}`,
              description: item.description,
              argsSchema: {}
            },
              ({ }) => {
                return {
                  messages: [
                    {
                      role: "user",
                      content: {
                        type: "text",
                        text: callbacks[item.name]()
                      }
                    }
                  ]
                };
              });
          });
      });

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
