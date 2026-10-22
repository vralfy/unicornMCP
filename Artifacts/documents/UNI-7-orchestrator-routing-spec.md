# UNI-7: Orchestrator repair & routing plan

Author: System Architect (CTO)
Date: 2026-10-22
Repo: `unicornMCP`

## Executive summary

The orchestrator currently uses ad-hoc `localhost` curl calls to contact local agent bridge processes. This pattern is brittle across containers, VMs, and host OSes and produces intermittent failures (connection refused, timeouts, wrong process reached). Replace the ad-hoc approach with a canonical route registry and a small routing service that provides deterministic discovery, authenticated registration, heartbeats, and health-aware resolution. The change is feature-flagged and rolled out via canary to minimize risk.

This document provides:
- root cause analysis,
- proposed architecture,
- data model changes (DB migration),
- new internal API endpoints and function signatures,
- edge cases and security considerations,
- test plan, metrics, rollback and owners,
- a Developer’s Checklist.

Do not implement until CEO approval. Implementation should be feature-flagged.

---

## Root cause analysis

Symptoms:
- intermittent `curl http://127.0.0.1:PORT/...` failures;
- connection refused or successful TCP but application-level errors;
- orchestrator sometimes reaches stale ports/processes.

Primary causes:
- network namespace mismatch (container vs host loopback),
- bridge binds to an interface not reachable by orchestrator,
- race conditions at startup (no canonical ready/registered state),
- stale configuration (orchestrator constructs endpoints instead of using validated registry),
- TLS/protocol mismatch,
- port collisions / ephemeral reuse.

Conclusion: Relying on implicit loopback is fragile. A canonical registry + resolution is required.

---

## Recommended architecture

Core components:
- Route Registry (DB-backed): stores active registrations for agent endpoints.
- Routing Service (API + in-memory cache): resolves agent_id -> endpoint, performs active health checks, enforces auth, and supplies route metadata.
- Agent registration + heartbeat: agents register their reachable endpoint and send periodic heartbeats.
- Sweeper job: background process marking stale routes inactive.
- Optional sidecar (Envoy/NGINX): provides a stable address on the host and can be used to localize TLS termination and caching.

Properties:
- Authenticated registration (mTLS/HMAC).
- TTL-based registrations (heartbeat every N seconds).
- Health-checked resolution with cached results.
- Feature-flagged orchestrator switch (`use_route_registry`).

---

## Proposed data model changes

Add table `routes`.

SQL migration example:

```sql
CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  protocol text NOT NULL DEFAULT 'http', -- http|https|unix|tcp
  host text,
  port integer,
  socket_path text,
  tls boolean DEFAULT false,
  meta jsonb DEFAULT '{}', -- {version, tags, env, etc}
  last_heartbeat_at timestamptz,
  status text DEFAULT 'active', -- active|draining|inactive
  weight integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX ON routes (agent_id);
```

Notes:
- For unix-socket-based routes, `protocol='unix'` and `socket_path` populated; `host`/`port` null.
- Keep registrations short-lived (heartbeat TTL, e.g., 90s). Sweeper job marks status `inactive` if heartbeat older than TTL.

---

## New internal API endpoints (auth-required)

All endpoints are internal only (infrastructure network + mTLS/HMAC). Example base: `POST https://internal-api.internal/v1/internal/routes/...`

1) POST /internal/routes/register
- Purpose: agent registers a reachable endpoint.
- Request JSON:
  - { "agent_id": string, "protocol": "http"|"https"|"unix"|"tcp", "host": string|null, "port": int|null, "socket_path": string|null, "tls": boolean, "meta": object|null }
- Response: { "route_id": uuid, "expires_in": seconds }
- Behavior: creates or upserts route for agent_id; sets `last_heartbeat_at = now()`.

2) POST /internal/routes/heartbeat
- Purpose: refresh registration TTL.
- Request JSON:
  - { "route_id": uuid } OR { "agent_id": string, "host": string?, "port": int? }
- Response: { "route_id", "expires_in" }

3) POST /internal/routes/deregister
- Purpose: agent voluntarily deregisters (on shutdown).
- Request JSON: { "route_id": uuid | "agent_id": string }
- Response: { "ok": true }

4) GET /internal/routes/resolve?agent_id={id}
- Purpose: resolve best active route for an agent.
- Response:
  - 200: { "route": { route fields... }, "resolved_at": timestamptz }
  - 404: { "error": "no-route" }
- Behavior: resolves active route(s) by status and weight, performs health-check if necessary, returns endpoint metadata. Cache results for short TTL (e.g., 5s).

5) GET /internal/routes/list?agent_id={id}&status=active
- Returns list of routes (useful for admin UI and troubleshooting).

6) POST /internal/routes/health-check
- Admin or router uses this to trigger active health checks against specific route(s). Response returns last-checked status.

Auth and rate limiting required for all endpoints. All endpoints should log to audit trail.

Function signatures (backend pseudocode):

- registerRoute(req: RegisterRequest, authCtx) -> RegisterResponse
- heartbeatRoute(req: HeartbeatRequest, authCtx) -> HeartbeatResponse
- deregisterRoute(req: DeregisterRequest, authCtx) -> DeregisterResponse
- resolveRoute(agentId: string, options?) -> Route | null
- listRoutes(filter: RouteFilter) -> Route[]

---

## Orchestrator changes (high level)

- Add `routeService` client used by the orchestrator core.
- Add new function `resolveRoute(agentId: string): Route | null`.
- Replace direct `curl 127.0.0.1:PORT` with logic:
  - if `config.use_route_registry`:
    - r = routeService.resolveRoute(agentId)
    - if r.protocol==='unix' use unix-socket transport
    - else use r.host/r.port with TLS settings from `r.tls`
  - else (legacy) fallback to `127.0.0.1:DEFAULT_PORT`.

- Keep change behind feature flag `use_route_registry` (default false until canary).
- Add instrumentation: latency of `resolveRoute`, cache hits/misses, route health metrics.

Pseudocode:

```js
async function callAgent(agentId, path, opts) {
  if (config.use_route_registry) {
    const r = await routeService.resolveRoute(agentId);
    if (!r) throw new Error('no-route');
    return http.request({ host: r.host, port: r.port, path, tls: r.tls });
  } else {
    return http.request({ host: '127.0.0.1', port: DEFAULT_PORT, path });
  }
}
```

---

## Heartbeat & TTLs

- Agent registers on bootstrap; receives `expires_in`.
- Agent sends heartbeat every `heartbeat_interval` (suggest 30s).
- Sweeper job: runs every `sweeper_interval` (30s) and marks `status='inactive'` if `last_heartbeat_at` < now() - TTL (TTL=90s default).

---

## Health checking & caching

- Routing service should optionally perform an active health check before returning route for `resolve`. For performance, return cached result if cached health is fresh (<5s).
- Health-check failures flag route `draining` and schedule reevaluation.

---

## Edge cases & behavioral details

- Multiple routes for same agent_id: use `weight` and `status` to select; prefer `active` with highest weight.
- Unix socket resolution: orchestrator process must be able to access socket path (permissions, mounts). For containerized setups, prefer host-side sidecar.
- Network namespace mismatch: agent should register a reachable host IP (not `127.0.0.1`) when orchestrator and agent are in different namespaces.
- Partial startup: if an agent isn't registered yet, orchestrator should retry with exponential backoff and produce clear error for callers.
- Stale port reuse: route entries expire via TTL to avoid stale endpoints.
- Race on deregister: if agent deregisters during call, orchestrator should receive readable error and retry based on config.

---

## Security considerations

- All internal APIs must require mTLS and/or signed HMAC token with short expiry.
- Input validation: reject registrations where `host` resolves to cloud metadata endpoints or private IP ranges reserved for other purposes (prevent SSRF). Whitelist acceptable host patterns if needed.
- Audit log every register/deregister/change event.
- Key rotation: provide rotated HMAC keys and certs with gradual roll-over.
- Rate limit registration and heartbeat endpoints to prevent DoS.
- Log sanitized meta fields to avoid leaking secrets.

---

## Monitoring & metrics (Prometheus)

Essential metrics:
- `route_registry.register_total` (counter)
- `route_registry.heartbeat_total`
- `route_registry.active_routes` (gauge)
- `route_service.resolve_latency_seconds` (histogram)
- `route_service.resolve_failures_total` (counter)
- `route_sweeper.inactive_marked_total` (counter)
- `route.healthcheck_failures_total` (counter)

Alerts:
- active_routes drops for a given region/team.
- resolve failures spike for >5% of calls over 5m.
- repeated register spikes (possible credential leak).

---

## Test plan & verification

Unit tests:
- registration upsert semantics,
- TTL logic,
- resolve selection with weights/status.

Integration tests:
- agent registers -> orchestrator resolves -> agent receives request.
- heartbeat refresh -> last_heartbeat updates in DB.
- sweeper marks route inactive beyond TTL.

E2E tests:
- Simulate agent in a container; agent registers using container IP; orchestrator (outside container) resolves and succeeds.
- Simulate agent process crash: after TTL expires, orchestrator must not resolve to inactive route.
- Chaos: network partition + retries/backoff.

Manual verification checklist:
1. Register route (curl/register).
2. call orchestrator endpoint that triggers agent invocation; verify request reached agent.
3. Stop agent; ensure route expires and orchestrator returns meaningful errors or failovers.

---

## Rollback & deployment plan

- Add code behind `use_route_registry=false`.
- Deploy registry and routing service in staging; run tests.
- Canary rollout: enable `use_route_registry` for 5% of agents for 48h, monitor metrics.
- If critical errors: flip `use_route_registry=false` (instant rollback).
- For DB migration: run in non-destructive mode, take backups, and apply migration with a "dry run" in staging.

---

## Owners & estimates

- Infra: deploy routing service & sidecar — 2.5d
- Backend: migration + API + orchestrator changes — 3.5d
- Agent engineer: agent registration + heartbeat client — 1.5d
- QA: E2E & chaos tests — 2d
- Security: review & mTLS/HMAC config — 1d
- Monitoring: metrics & dashboards — 0.5d

Total ≈ 11 engineer-days distributed across teams.

---

## Developer’s checklist (concrete)

- [ ] Add DB migration for `routes` (SQL above). — Backend
- [ ] Implement internal API endpoints: `register`, `heartbeat`, `deregister`, `resolve`, `list`, `health-check`. — Backend
- [ ] Add strict auth (mTLS/HMAC), rate limiting, and audit logs. — Security/Backend
- [ ] Implement routeService client library used by orchestrator (with caching & metrics). — Backend
- [ ] Add `use_route_registry` feature flag and toggle logic in orchestrator. — Backend
- [ ] Implement agent registration: agent boot registers route and starts heartbeat loop. — Agent Engineer
- [ ] Implement sweeper job to mark stale routes inactive. — Backend/Infra
- [ ] Add Prometheus metrics and Grafana dashboard. — Monitoring
- [ ] Add unit/integration/e2e/chaos tests and run staging verification. — QA
- [ ] Canary rollout and monitor for 48–72h. — Product/Infra
- [ ] Security review & sign-off. — Security

---

## Appendix: example requests

Register (curl):

```bash
curl -X POST https://internal-api.internal/v1/internal/routes/register \
  --cert agent.crt --key agent.key \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"agent-123","protocol":"http","host":"10.0.4.21","port":45454,"tls":false,"meta":{"version":"1.2.1"}}'
```

Resolve (orchestrator):

```bash
curl -X GET https://internal-api.internal/v1/internal/routes/resolve?agent_id=agent-123 \
  --cert orchestrator.crt --key orchestrator.key
```

---

Decision Points / Open Questions

- Preferred internal auth mechanism: mTLS only, or mTLS + HMAC for limited agents? (Recommend mTLS mandatory where possible; HMAC as fallback).
- Should `resolve` perform active health checks synchronously (adds latency) or prefer cached health and async checks (favors latency)? (Recommend cached health with an option to force-check via `health-check` endpoint).
- Default TTL / heartbeat intervals for production (suggest: heartbeat 30s, TTL 90s, cache TTL 5s).
- Sidecar strategy for container deployments (recommend host-side sidecar to expose unix socket or host IP for orchestrator).

If you want me to proceed:
- Reply with (A) “write artifact” and I will write/commit `Artifacts/documents/UNI-7-orchestrator-routing-spec.md` (or open a PR), or
- Reply with (B) “open PR” and I will prepare the DB migration + API skeleton behind the `use_route_registry` feature flag and open the PR for review.

