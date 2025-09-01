import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import fs from "fs";

export const mcpLeitstellenspiel = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const name = 'leitstellenspiel';
      const createSceneInstruction = [
        'Create a scene entry from scene description. The scene format is as follows:',
        '```json',
        '"{missionId}" : ["type1": 3, "type2": 6], // {mission title}',
        '```',
        '* do not modify any files',
        '* Ask for mission id if not provided',
        '* if its a landing page the value is null',
        '* there is an mcp tool available to get the mission data. Use it!',
        '* explain the user which vehicle types are used in the mission',
        '* do not translate mission title',
        '* vehicle types need to be replaced with the following:',
        '  * Loeschfahrzeug = LF',
        '  * Ruestwagen = RW',
        '  * Drehleiter = DLK',
        '  * Feuerwehrkran = FKW',
        '  * GW-A = GWA',
        '  * GW-Atemschutz = GWA',
        '  * GW-Gefahrgut = GWG',
        '  * GW-L2-Wasser = SW',
        '  * GW-Messtechnik = GWM',
        '  * GW-Öl = GWO',
        '  * Funkstreifenwagen = POL',
        '  * Zivilstreifenwagen = ZIV',
        '* if not mapped, provide the full name as key',
        '* if there is a probability of less than 50 for a vehicle, do not add it',
        '* add a RTW for each expected patient, use minimal amount if given',
        '* add one NEF if probability is given and at least 50'
      ];

      const getMission = async (id) => {
        if (!fs.existsSync(config.pwd + '/tmp/missions')) {
          fs.mkdirSync(config.pwd + '/tmp/missions', { recursive: true });
        }
        const file = config.pwd + '/tmp/missions/' + id + '.html';
        const url = 'https://www.leitstellenspiel.de/einsaetze/' + id;

        if (!fs.existsSync(file)) {
          config.echo("Creating mission file", file, 'from', url);
          const response = await fetch(url);
          const ok = response.ok;
          const html = await response.text();
          fs.writeFileSync(file, html, { encoding: 'utf8', flag: 'w+' });
        }

        const html = fs.readFileSync(file, 'utf8');
        return html;
      }

      mcp.registerResource(
        config.prefix + name,
        new ResourceTemplate(config.prefix + name + "://mission/{message}", { list: undefined }),
        {
          title: "Leitstellenspiel Mission",
          description: "Returns the mission details",
        },
        async (uri, { message }) => {
          try {
            const html = await getMission(message);

            return {
              contents: [{
                uri: uri.href, // this needs to be uri.href
                text: html
              }]
            }
          } catch (e) {
            config.error("Error creating mission file", e);
            return {
              contents: [{
                uri: uri.href, // this needs to be uri.href
                text: `Error creating mission file: ${message}`
              }]
            }
          }
        }
      );

      mcp.registerTool(
        config.prefix + "leitstellenspiel_get_mission",
        {
          title: "Get Leitstellenspiel mission",
          description: "Retrieves the details of a Leitstellenspiel mission",
          inputSchema: { message: z.string() },
        },
        async ({ message }) => {
          config.echo("Calling", config.prefix + "leitstellenspiel_get_mission");
          message = message || "";
          const html = await getMission(message);
          return {
            content: [
              {
                type: "text",
                text: html
              }
            ]
          };
        }
      );

      mcp.registerPrompt(
        config.prefix + name + "_create_scene",
        {
          title: "Create a scene for Leitstellenspiel",
          description: "Generates a scene for a Leitstellenspiel mission",
          argsSchema: { txt: z.string().describe("Mission ID") }
        },
        ({ txt }) => {
          config.echo("Calling", config.prefix + name + "_create_scene");
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: createSceneInstruction.join('\n') + `\n\nMission ID: ${txt}`
                }
              }
            ]
          };
        }
      );

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
