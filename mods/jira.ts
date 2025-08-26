import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import JiraApi from "jira-client";
import z from "zod";

export const mcpJira = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      config.echo("Registering MCP Jira...");
      const jira = new JiraApi(config.secrets.jira.server);

      // const test = async () => {
      //   const ticket = await jira.findIssue('KFIFA-4418');
      //   console.log(ticket, config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/');
      // };
      // test();

      mcp.registerResource(
        "jira_ticket",
        new ResourceTemplate("jira_ticket://{message}", { list: undefined }),
        {
          title: "Jira Ticket",
          description: "Returns a jira ticket",
        },
        async (uri, { message }) => {
          config.echo('Retrieving Jira ticket:', message, uri);
          const ticket = await jira.findIssue(message);
          const url = config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/' + message;
          config.logger("Jira ticket retrieved:", uri, message, url, ticket);
          return {
            contents: [{
              uri: url,
              text: JSON.stringify(ticket, null, 2)
            }]
          };
        }
      );

      mcp.registerTool(
        "jira_ticket",
        {
          title: "Jira Ticket",
          description: "Retrieves information about a Jira ticket",
          inputSchema: { message: z.string().describe('The ID of the Jira ticket to retrieve') },
        },
        async ({ message }) => {
          message = message || "";
          const url = config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/' + message;
          config.echo('Retrieving Jira ticket:', message, url);

          const ticket = await jira.findIssue(message);
          ticket.url = url;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(ticket, null, 2)
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
