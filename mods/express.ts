import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import express from 'express';

export const mcpExpress = {
  setup: (config, mcp, app) => new Promise((resolve, reject) => {
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      ...config.transportOptions
    });
    try {
      config.echo("Setting up Express server...");
      // 🌈 Mister Fluffy here! Let's sprinkle some magic and disable host check for our Express server!
      // This allows requests from any host, perfect for unicorns galloping in from all corners of the magical city!
      app.set('trust proxy', true); // Accept requests from any host/proxy
      // disableHostCheck
      config.echo('express.json: ', express.json());
      app.use(express.json());
      app.post(config.path, async (req: express.Request, res: express.Response) => {
        // In stateless mode, create a new instance of transport and server for each request
        // to ensure complete isolation. A single instance would cause request ID collisions
        // when multiple clients connect concurrently.
        try {
          res.on('close', () => {
            config.echo('Request closed');
            transport.close();
            mcp.close();
          });
          await mcp.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          config.echo('Error handling MCP request:', error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error',
              },
              id: null,
            });
          }
        }
      });

      // SSE notifications not supported in stateless mode
      app.get(config.path, async (req: express.Request, res: express.Response) => {
        config.echo('Received GET MCP request');
        res.writeHead(405).end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed."
          },
          id: null
        }));
      });

      app.delete(config.path, async (req: express.Request, res: express.Response) => {
        config.echo('Received DELETE MCP request');
        res.writeHead(405).end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed."
          },
          id: null
        }));
      });
    } catch (error) {
      reject(error);
    }
  }),
};