import z from "zod";
import fs from "fs";
import { fetch } from "undici";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpLeitstellenspiel = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Leitstellenspiel';
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
        '  * Feuerwehrkran = FWK',
        '  * GW-A = GWA',
        '  * GW-Atemschutz = GWA',
        '  * GW-Gefahrgut = GWG',
        '  * GW-Höhenrettung = GWH',
        '  * GW-L2-Wasser = SW',
        '  * GW-Messtechnik = GWM',
        '  * GW-Öl = GWO',
        '  * GW-Werksfeuerwehr = GWW',
        '  * ULF = ULF',
        '  * Teleskopmast = TELE',
        '  * Turbolöscher = TURBO',
        '  * Dekon-P = DEKONP',
        '  * Schlauchwagen = SW',
        '  * ELW 1 = ELW',
        '  * ELW 2 = ELW2',
        '  * Funkstreifenwagen = POL',
        '  * Polizeihubschrauber = POLH',
        '  * Zivilstreifenwagen = ZIV',
        '  * MTW-TZ = THWMTW',
        '  * MzGW (FG N) = THWGWN',
        '  * Anhänger Drucklufterzeugung = THWDLE',
        '  * all kinds of K9 units = DOG',
        '  * all kinds of boat units = BOAT',
        '* if not mapped, provide the full name as key',
        '* if there is a probability of less than 50 for a vehicle, do not add it',
        '* add a RTW for each expected patient, use minimal amount if given',
        '* add one NEF if probability is given and at least 50'
      ];

      const callbacks = {}
      callbacks['Mission'] = async (args) => {
        if (!fs.existsSync(config.pwd + '/tmp/missions')) {
          fs.mkdirSync(config.pwd + '/tmp/missions', { recursive: true });
        }
        const file = config.pwd + '/tmp/missions/' + args.missionId + '.html';
        const url = 'https://www.leitstellenspiel.de/einsaetze/' + args.missionId;

        if (!fs.existsSync(file)) {
          config.log("Creating mission file", file, 'from', url);
          const response = await fetch(url);
          const ok = response.ok;
          const html = await response.text();
          fs.writeFileSync(file, html, { encoding: 'utf8', flag: 'w+' });
        }

        const html = fs.readFileSync(file, 'utf8');
        return html;
      }

      [
        { name: 'Mission', description: "Returns the mission details", args: { missionId: z.string().describe("Mission ID") } },
      ].forEach(item => {
        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      mcp.registerPrompt(
        config.prefix + pluginName + "_create_scene",
        {
          title: "Create a scene for Leitstellenspiel",
          description: "Generates a scene for a Leitstellenspiel mission",
          argsSchema: { txt: z.string().describe("Mission ID") }
        },
        ({ txt }) => {
          config.info("Calling", config.prefix + pluginName + "_create_scene");
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
