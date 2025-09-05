import JiraApi from "jira-client";
import z from "zod";
import { registerMCPResource, registerMCPTool } from "./abstract.ts";

export const mcpJira = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Jira';
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
        callbacks[item.name] = async (args) => {
          const result = await jira[item.jiraMethod](...Object.values(args));
          return result;
        };
        registerMCPResource(config, mcp, callbacks, pluginName, item);
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      callbacks['Ticket'] = async (args) => {
        const url = config.secrets.jira.server.protocol + '://' + config.secrets.jira.server.host + '/browse/' + (args.ticketId || '');
        const ticket = await jira.findIssue(args.ticketId);
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
