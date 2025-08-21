import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import express from 'express';

export const mcpExpress = {
  setup: (config, mcp, app) => new Promise((resolve, reject) => {
    try {
      config.echo("Setting up Express server...");
      // 🌈 Mister Fluffy here! Let's sprinkle some magic and disable host check for our Express server!
      // This allows requests from any host, perfect for unicorns galloping in from all corners of the magical city!
      app.set('trust proxy', true); // Accept requests from any host/proxy
      // disableHostCheck
      app.use(express.json());
      app.post(config.path, async (req: express.Request, res: express.Response) => {
        // In stateless mode, create a new instance of transport and server for each request
        // to ensure complete isolation. A single instance would cause request ID collisions
        // when multiple clients connect concurrently.
        const body = req.body;
        config.logger('Received POST MCP request', body);

        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          ...(config.transportOptions.sessionIdGenerator ? {sessionIdGenerator: () => randomUUID()} : {}),
          ...config.transportOptions
        });
        try {
          res.on('close', () => {
            transport.close();
            mcp.close();
          });
          await mcp.connect(transport);
          await transport.handleRequest(req, res, body);
        } catch (error) {
          if (!res.headersSent) {
            config.echo('Error handling POST MCP request', error);
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error ' + JSON.stringify(error),
              },
              id: null,
            });
          }
        }
      });

      // SSE notifications not supported in stateless mode
      app.get(config.path, async (req: express.Request, res: express.Response) => {
        const body = req.body;
        config.logger('Received GET MCP request', req.headers, body);
        res.writeHead(405).end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "GET Method not allowed."
          },
          id: null
        }));
      });

      app.delete(config.path, async (req: express.Request, res: express.Response) => {
        const body = req.body;
        config.logger('Received DELETE MCP request', body);
        res.writeHead(405).end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "DELETE Method not allowed."
          },
          id: null
        }));
      });
    } catch (error) {
      config.echo('Error registering Express routes', error);
      reject(error);
    }
  }),
};