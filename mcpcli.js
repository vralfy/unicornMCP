import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import fs from "fs"

const info = JSON.parse(fs.readFileSync("mcp.json", "utf-8"))
const logfile = process.cwd() + "/mcp.log";
const enableJsonOutput = false;

fs.writeFileSync(logfile, JSON.stringify(info, null, 2), { encoding: 'utf8', flag: 'w+' }, (err) => {
  if (err) {
    console.error("Error writing", logfile, err);
  } else {
    console.log(logfile, "created successfully.");
  }
});

const logger = (...msg) => {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg.join(' ')}\n`;
  fs.appendFileSync(logfile, formattedMsg, 'utf8', { flag: 'a' });
  console.log(formattedMsg);
}

logger("Starting UniCorn MagicCP server with info:", info);

const server = new McpServer(info.server, {
  capabilities: {
    // tools: [
    //   {
    //     id: "add",
    //     name: "Add",
    //     description: "Adds two numbers",
    //     input: { a: "number", b: "number" },
    //     output: { content: [{ type: "text", text: "string" }] },
    //   },
    // ],
  },
})

server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.tool(
  "echo",
  "Echo a message backwards",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message.split('').reverse().join('')}` }]
  })
);

server.tool(
  "add",
  "Add two numbers",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  })
);

server.prompt(
  "unicornprompt",
  { txt: z.string() },
  async ({ txt }) => {
    try {

      return {
        messages: [
          {
            role: "user",
            context: {
              type: "text",
              text: fs.readFileSync(process.cwd() + '/.vscode/prompts/basic.prompt.md') + txt
            }
          }
        ]
      };
    } catch (e) {
      logger('Error creating unicorn prompt:', e.message);
      return {
        messages: [
          {
            role: "user",
            context: {
              type: "text",
              text: "Error creating unicorn prompt: " + e.message,
            }
          }
        ]
      };
    }

  }
);

server.tool(
  "unicorntool",
  "Provides a scene description",
  { id: z.number() },
  async ({ id }) => {
    const file = process.cwd() + '/missions/' + id + '.html';
    try {

      return {
        content: [{ type: "text", text: html }],
      }
    } catch (e) {
      logger('Error fetching scene description:', e.message);
      return {
        content: [{ type: "text", text: 'Error fetching scene description: ' + e.message }],
      }
    }
  }
);

const transport = new StdioServerTransport()
await server.connect(transport)

// Tool: List unicorn vehicles and their status
server.tool(
  "listUnicornVehicles",
  "Returns a list of unicorn vehicles and their status",
  {},
  async () => {
    // Example unicorn vehicles data
    const vehicles = [];

    for (let i = 1; i < 5; i++) {
      vehicles.push({
        name: `Unicorn Wrangler ${i}`,
        type: "Wrangler",
        status: ['available', 'busy', 'in maintenance'][Math.floor(Math.random() * 3)]
      });
      vehicles.push({
        name: `Rainbow Engineer ${i}`,
        type: "Engineer",
        status: ['available', 'busy', 'in maintenance'][Math.floor(Math.random() * 3)]
      });
      vehicles.push({
        name: `Horn Polisher ${i}`,
        type: "Polisher",
        status: ['available', 'busy', 'in maintenance'][Math.floor(Math.random() * 3)]
      });
      vehicles.push({
        name: `Snack Courier ${i}`,
        type: "Courier",
        status: ['available', 'busy', 'in maintenance'][Math.floor(Math.random() * 3)]
      });
      vehicles.push({
        name: `Pegasus Guide ${i}`,
        type: "Guide",
        status: ['available', 'busy', 'in maintenance'][Math.floor(Math.random() * 3)]
      });
    }
    logger('Generated unicorn vehicles:', JSON.stringify(vehicles, null, 2));
    return {
      content: enableJsonOutput ? [{
        type: "json",
        json: vehicles
      }] : [{
        type: "text",
        text: "The list of all unicorn vehicles: " + JSON.stringify(vehicles, null, 2)
      }]
    };
  }
);

// Tool: List magical missions
server.tool(
  "listMissions",
  "Returns a list of magical missions with id, title, description, and required vehicles",
  {},
  async () => {
    // Sparkly mission data
    const missionsList = [
      {
        title: "Unicorn Jam Clearance",
        description: "A group of unicorns is blocking a rainbow intersection. Dispatch Unicorn Wranglers to clear the jam and restore the flow of sparkly traffic!",
        vehicles: ["Wrangler", "Guide"]
      },
      {
        title: "Rainbow Road Repair",
        description: "A section of the rainbow road has faded. Send Rainbow Engineers to restore its vibrant colors and keep the city shining!",
        vehicles: ["Engineer"]
      },
      {
        title: "Horn Polishing Emergency",
        description: "A unicorn’s horn has lost its shine before the parade. Assign Horn Polishers for a quick magical fix!",
        vehicles: ["Polisher"]
      },
      {
        title: "Magical Snack Delivery",
        description: "Unicorns are hungry and refuse to move. Send Snack Couriers with enchanted treats to get them trotting again!",
        vehicles: ["Courier"]
      },
      {
        title: "Lost Pegasus Assistance",
        description: "A confused pegasus is causing traffic chaos. Deploy Pegasus Guides to help and restore harmony!",
        vehicles: ["Guide", "Wrangler"]
      }
    ];

    const missions = new Array(10).fill(0).map((_, i) => {
      return {
        ...missionsList[i % missionsList.length],
        id: 100 + i
      }
    });

    logger('Generated magical missions:', JSON.stringify(missions, null, 2));
    return {
      content: enableJsonOutput ? [{
        type: "json",
        json: missions
      }] : [{
        type: "text",
        text: "The list of all magical missions: " + JSON.stringify(missions, null, 2)
      }]
    };
  }
);
// Tool: Assign unicorn vehicles to a mission
server.tool(
  "assignVehiclesToMission",
  "Assigns an array of unicorn vehicles to a unicorn mission by mission ID.",
  { missionId: z.number(), vehicles: z.array(z.string()) },
  async ({ missionId, vehicles }) => {
    // Log the magical assignment
    logger(`✨ Mission ${missionId} assigned to vehicles: ${vehicles.join(", ")}`);
    // Return a sparkly confirmation
    return {
      content: [{
        type: "text",
        text: `Mission ${missionId} has been assigned to these unicorn vehicles: ${vehicles.join(", ")}. May rainbows guide their way! 🦄🌈`
      }]
    };
  }
);