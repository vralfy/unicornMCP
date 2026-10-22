// Minimal routeService client used by orchestrator.
import fetch from 'node-fetch';

export interface Route {
  id: string;
  agent_id: string;
  protocol: string;
  host?: string;
  port?: number;
  socket_path?: string;
  tls?: boolean;
  meta?: any;
}

export class RouteServiceClient {
  baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async resolveRoute(agentId: string): Promise<Route | null> {
    const url = `${this.baseUrl}/internal/routes/resolve?agent_id=${encodeURIComponent(agentId)}`;
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.route || null;
  }
}

export default RouteServiceClient;
