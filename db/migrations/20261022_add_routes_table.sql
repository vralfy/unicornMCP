CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  protocol text NOT NULL DEFAULT 'http', -- http|https|unix|tcp
  host text,
  port integer,
  socket_path text,
  tls boolean DEFAULT false,
  meta jsonb DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz,
  status text DEFAULT 'active', -- active|draining|inactive
  weight integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_routes_agent_id ON routes (agent_id);
CREATE INDEX idx_routes_status ON routes (status);
CREATE INDEX idx_routes_last_heartbeat ON routes (last_heartbeat_at);
