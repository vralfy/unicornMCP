import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
// Magical imports for webserver
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

const echo = (...msg) =>{
  logger(...msg);
  const timestamp = new Date().toISOString();
  const formatedParts = (msg ?? []).map(part => JSON.stringify(part));
  const formattedMsg = `[${timestamp}] ${formatedParts.join(' ')}\n`;
  console.log(formattedMsg);
}

const logger = (...msg) => {
  const timestamp = new Date().toISOString();
  const formatedParts = (msg ?? []).map(part => JSON.stringify(part));
  const formattedMsg = `[${timestamp}] ${formatedParts.join(' ')}\n`;
  fs.appendFileSync(logfile, formattedMsg, 'utf8', { flag: 'a' });
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
});

server.registerPrompt(
  "exampleprompt",
  {
    title: "Example Prompt",
    description: "Generates a prompt",
  },
  ({ txt }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please check the text for spelling and grammar errors:\n\n${txt}`
          }
        }
      ]
    };
  }
);

server.registerResource(
  "exampleresource",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  {
    title: "Echo a message",
    description: "Returns the input message",
  },
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.registerTool(
  "exampletool",
  {
    title: "Echo a message backwards",
    description: "Reverses the input message",
    argsSchema: { message: z.string() },
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text",
          text: `Tool echo: ${message.split('').reverse().join('')}`
        }
      ]
    };
  }
);

// Magical transport selection: use HTTP if --rainbowroad flag is set
let transport;
if (process.argv.includes('--rainbowroad')) {
  const app = express();
  const port = process.env.PORT || 3000;
  transport = new StreamableHTTPServerTransport({ app });
  await server.connect(transport);
  app.listen(port, () => {
    logger(`🦄 Rainbow Road activated! MCP server is trotting at http://localhost:${port}`);
    console.log(`🦄 Rainbow Road activated! MCP server is trotting at http://localhost:${port}`);
  });
} else {
  transport = new StdioServerTransport();
  await server.connect(transport);
}

// Unicorn Prompt
server.registerPrompt(
  "unicorn",
  {
    title: "Unicorn Prompt",
    description: "Generates a prompt for the unicorn.",
    argsSchema: { txt: z.string() },
  },
  ({ txt }) => {
    try {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: fs.readFileSync(process.cwd() + '/.vscode/prompts/basic.prompt.md') + "\n\n Here is your prompt:" + txt
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

// New prompt: Unicorn Name Generator
server.registerPrompt(
  "unicornNameGenerator",
  {
    title: "Unicorn Name Generator",
    description: "Generates a name for a unicorn based on its attributes.",
    argsSchema: {
      color: z.string(),
      food: z.string(),
      mood: z.string(),
      expertise: z.string()
    }
  },
  ({ color, food, mood, expertise }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please give me a name for a unicorn 🦄✨ Its favorite color is ${color}, its favorite food is ${food}, its mood is ${mood}, and its an expert in ${expertise}.`
          }
        }
      ]
    };
  }
);

// New prompt: send Unicorns to missions
server.registerPrompt(
  "unicornSend",
  {
    title: "Send Unicorns to Missions",
    description: "Sends available unicorns to their respective missions.",
  },
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Check for missions and send unicorn vehicles. Try to accomplish all missions in the most performant way. Do not send busy unicorns or those which are under maintenance. Do not send a unicorn twice.`
          }
        }
      ]
    };
  }
);

// Tool: List unicorn vehicles and their status
server.registerTool(
  "unicornListVehicles",
  {
    title: "List Unicorn Vehicles",
    description: "Retrieves the current status of all unicorn vehicles.",
    inputSchema: {}
  },
  async () => {
    // Example unicorn vehicles data
    const vehicles = [];
    const statuses = [
      ...(new Array(5).fill('available')),
      ...(new Array(3).fill('busy')),
      ...(new Array(2).fill('in maintenance')),
    ];
    for (let i = 1; i < 3; i++) {
      vehicles.push({
        name: `Unicorn Wrangler ${i}`,
        type: "Wrangler",
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
      vehicles.push({
        name: `Rainbow Engineer ${i}`,
        type: "Engineer",
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
      vehicles.push({
        name: `Horn Polisher ${i}`,
        type: "Polisher",
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
      vehicles.push({
        name: `Snack Courier ${i}`,
        type: "Courier",
        status: statuses[Math.floor(Math.random() * statuses.length)]
      });
      vehicles.push({
        name: `Pegasus Guide ${i}`,
        type: "Guide",
        status: statuses[Math.floor(Math.random() * statuses.length)]
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
server.registerTool(
  "unicornListMissions",
  {
    title: "List Magical Missions",
    description: "Returns a list of magical missions with id, title, description, and required vehicles",
    inputSchema: {}
  },
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

    const missions = new Array(20).fill(0).map((_, i) => {
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
server.registerTool(
  "unicornAssignVehicles",
  {
    title: "Assign Vehicles to Mission",
    description: "Assigns an array of unicorn vehicles to a unicorn mission by mission ID.",
    inputSchema: {
      missionId: z.number(),
      vehicles: z.array(z.string())
    }
  },
  async ({ missionId, vehicles }) => {
    if (!vehicles.length) {
      logger('No vehicles assigned to mission', missionId);
      return {
        content: [{
          type: "text",
          text: `You did not assign any unicorns. May rainbows be with you! 🦄🌈`
        }]
      };
    }
    // Log the magical assignment
    echo(`✨ Mission ${missionId} assigned to vehicles: ${vehicles.join(", ")}`);
    // Return a sparkly confirmation
    return {
      content: [{
        type: "text",
        text: `Mission ${missionId} has been assigned to these unicorn vehicles: ${vehicles.join(", ")}. May rainbows guide their way! 🦄🌈`
      }]
    };
  }
);

// This server was brought to you by