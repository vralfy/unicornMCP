import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import JiraApi from "jira-client";
import z from "zod";

export const mcpJira = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      config.echo("Registering MCP Jira...");
      const jira = new JiraApi(config.secrets.jira.server);

      const getTicket = async (id, recursive) => {
        const url = config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/' + (id || '');
        config.echo('Retrieving Jira ticket:', url);
        const ticket = await jira.findIssue(id);
        ticket.url = url;

        if (recursive && ticket?.fields?.parent?.key) {
          ticket.parent = await getTicket(ticket.fields.parent.key, false);
        }

        return ticket;
      };

      mcp.registerResource(
        config.prefix + "jira",
        new ResourceTemplate(config.prefix + "jira://ticket/{message}", { list: undefined }),
        {
          title: "Jira Ticket",
          description: "Returns a jira ticket",
        },
        async (uri, { message }) => {

          try {
            const ticket = await getTicket(message, true);
            return {
              contents: [{
                uri: uri.href,
                text: JSON.stringify(ticket, null, 2)
              }]
            };
          } catch(e) {
            return {
              contents: [{
                uri: uri.href,
                text: e.message
              }]
            };

          }
        }
      );

      mcp.registerTool(
        config.prefix + "jiraticket",
        {
          title: "Jira Ticket",
          description: "Retrieves information about a Jira ticket",
          inputSchema: { message: z.string().describe('The ID of the Jira ticket to retrieve') },
        },
        async ({ message }) => {
          try {
            const ticket = await getTicket(message, true);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(ticket, null, 2)
                }
              ]
            };
          } catch (e) {
            config.logger("Error retrieving Jira ticket:", e.message);
            return {
              content: [
                {
                  type: "text",
                  text: e.message
                }
              ]
            };
          }
        }
      );

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
