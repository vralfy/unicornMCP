import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import JiraApi from "jira-client";
import z from "zod";

export const mcpJira = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const jira = new JiraApi({
        "protocol": "https",
        "apiVersion": 2,
        "strictSSL": true,
        ...config.secrets.jira.server
      });
      const callbacks = {};

      [
        { name: 'User', jiraMethod: 'getCurrentUser', description: null, args: {} },
        { name: 'Project', jiraMethod: 'getProject', description: null, args: { projectId: z.string().describe('The ID of the Jira project to retrieve') } },
        { name: 'Ticket', jiraMethod: 'findIssue', description: null, args: { ticketId: z.string().describe('The ID of the Jira ticket to retrieve') } },
        { name: 'TicketHistory', jiraMethod: 'getIssueChangelog', description: null, args: { ticketId: z.string().describe('The ID of the Jira ticket to retrieve') } },
        { name: 'Board', jiraMethod: 'getBoard', description: null, args: { boardId: z.string().describe('The ID of the Jira board to retrieve') } },
        { name: 'LatestSprint', jiraMethod: 'getLastSprintForRapidView', description: null, args: { boardId: z.string().describe('The ID of the Jira board') } },
        { name: 'SprintIssues', jiraMethod: 'getSprintIssues', description: null, args: { boardId: z.string().describe('The ID of the Jira board'), sprintId: z.string().describe('The ID of the Sprint') } }
      ].forEach(item => {
        callbacks['get' + item.name] = async (...args) => {
          const result = await jira[item.jiraMethod](...args);
          return result;
        };

        const resourceUrl = Object.keys(item.args ?? {}).length ? '/' + Object.keys(item.args ?? {}).map(key => `{${key}}`).join('/') : '';
        // register resource
        mcp.registerResource(
          config.prefix + "jira" + item.name.toLowerCase() + "resource",
          new ResourceTemplate(config.prefix + "jira://" + item.name.toLowerCase() + resourceUrl, { list: undefined }),
          {
            title: "Jira " + item.name,
            description: item.description ?? "Returns a jira " + item.name.toLowerCase(),
          },
          async (uri, args) => {
            try {
              config.info('Retrieving Jira ' + item.name + ':', args);
              const returnvalue = await callbacks['get' + item.name](...Object.values(args));
              return {
                contents: [{
                  uri: uri.href,
                  text: JSON.stringify(returnvalue, null, 2)
                }]
              };
            } catch (e) {
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
          config.prefix + "jira" + item.name.toLowerCase(),
          {
            title: "Jira " + item.name,
            description: item.description ?? "Returns a jira " + item.name.toLowerCase(),
            inputSchema: item.args ?? { },
          },
          async (args) => {
            try {
              config.info('Retrieving Jira ' + item.name + ':', args);
              const returnValue = await callbacks['get' + item.name](...Object.values(args));
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(returnValue, null, 2)
                  }
                ]
              };
            } catch (e) {
              config.error("Error retrieving Jira " + item.name.toLowerCase() + ":", e.message);
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
      });

      callbacks['getTicket'] = async (id) => {
        const url = config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/' + (id || '');
        const ticket = await jira.findIssue(id);
        ticket.url = url;

        if (ticket?.fields?.parent?.key) {
          ticket.parent = await callbacks['getTicket'](ticket.fields.parent.key);
        }

        return ticket;
      };

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
