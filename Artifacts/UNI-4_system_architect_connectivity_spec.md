# UNI-4: System Architect — Connectivity & Access Technical Specification

Summary
- Purpose: Verify all agents (Orchestrator, System Architect, Lead Developer, QA, Documentation) can communicate with the Paperclip control plane and have required source/repo access. Provide a maintainable implementation plan to perform periodic connectivity checks and capture results for auditing and automation.
- Governance: Implementation must wait for CEO sign-off. This document is saved at Artifacts/UNI-4_system_architect_connectivity_spec.md for traceability.

Required connectors / token names (names only)
- PAPERCLIP_API_KEY
- PAPERCLIP_API_URL
- PAPERCLIP_AGENT_ID (per-agent)
- PAPERCLIP_GITHUB_BROKER_TOKEN
- PAPERCLIP_GIT_TOKEN
- PAPERCLIP_GITHUB_AUTH_MODE
- PAPERCLIP_WORKSPACE_REPO_URL
- PAPERCLIP_RUNNER_NETWORK_ACCESS
- PAPERCLIP_RUNNER_NETWORK_ROOTS

Reconfiguration & permission steps (high level)
1. Verify API connectivity
   - Confirm PAPERCLIP_API_URL resolves and is reachable from runner hosts.
   - Confirm PAPERCLIP_API_KEY grants GET /api/agents/me and POST /api/issues/$TASK/comments.
2. Validate Git/GitHub broker
   - Ensure PAPERCLIP_GITHUB_BROKER_TOKEN is present and valid. Test: attempt git ls-remote $PAPERCLIP_WORKSPACE_REPO_URL using broker flow.
   - Ensure PAPERCLIP_GITHUB_AUTH_MODE is set according to environment ("broker" vs "direct").
3. Ensure agent identities & scopes
   - Confirm each agent has a stable PAPERCLIP_AGENT_ID and that orchestration role mapping exists (Orchestrator, System Architect, Lead Dev, QA, Docs).
4. Runner/network
   - Ensure PAPERCLIP_RUNNER_NETWORK_ACCESS allows outbound access to the Paperclip API and GitHub endpoints or relay/proxy.
5. Permissions for operations
   - Provide read-only repo access for connectivity checks; require write access only when performing pushes or creating PRs.

Missing environment variables / Git & broker notes
- Confirm presence/validity of the following env vars: PAPERCLIP_API_KEY, PAPERCLIP_GITHUB_BROKER_TOKEN, PAPERCLIP_GIT_TOKEN.
- Known issue observed: configuration_directory_unavailable and broker_transport_unavailable errors indicate broker or credential store problems. These must be resolved before automated checks will fully pass.

Blockers and mitigations
- Blocker: Broker transport unavailable (prevents managed Git operations).
  - Mitigation: Rotate PAPERCLIP_GITHUB_BROKER_TOKEN, restart broker service, and validate with git ls-remote through the broker endpoint. Fallback: use PAPERCLIP_GIT_TOKEN direct PAT for short-term operations.
- Blocker: API unreachable from runner (HTTP/000 errors).
  - Mitigation: Confirm network egress, DNS, and that PAPERCLIP_API_URL is correct. Add network routes or proxy in PAPERCLIP_RUNNER_NETWORK_ROOTS.
- Blocker: Missing agent mapping or stale PAPERCLIP_AGENT_ID.
  - Mitigation: Re-register agent or update mapping via admin console; validate with GET /api/agents/me.

Estimated effort
- Authoring & DB model + migration: 3h
- Backend service + API endpoints: 5h
- Background job + scheduler + retries: 2h
- Tests (unit & integration): 2h
- Documentation, PR, and rollout steps: 2h
- Total estimate: 14 hours (1.75 dev-days)

Verdict (quick)
- Agent communication: Possible but unreliable in current environment — observed HTTP 000 for Paperclip API. Needs network/broker fixes before automation.
- Source-code access: Read access exists, but managed Git broker is broken (broker_transport_unavailable). Cannot rely on broker for write ops until fixed.
- Orchestrator capability: Present, but constrained by broker & API reachability; Orchestrator should be able to run checks once tokens and broker are healthy.

Proposed data model changes
- New table: agent_connectivity_status
  - Columns:
    - id UUID primary key
    - agent_id UUID indexed (references agents table)
    - service varchar NOT NULL -- e.g., 'paperclip_api', 'github_broker'
    - status varchar NOT NULL CHECK (status IN ('ok','warn','fail'))
    - last_checked_at timestamptz NOT NULL
    - latency_ms integer NULL
    - details jsonb NULL -- diagnostic payload, error codes (no secrets)
  - Indexes: agent_id, service, last_checked_at

- Optional: connectivity_checks (history) storing per-check runs for audit

Example SQL migration (Postgres)
```sql
CREATE TABLE agent_connectivity_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  service varchar NOT NULL,
  status varchar NOT NULL CHECK (status IN ('ok','warn','fail')),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  latency_ms integer NULL,
  details jsonb NULL
);
CREATE INDEX ON agent_connectivity_status (agent_id);
CREATE INDEX ON agent_connectivity_status (service);
CREATE INDEX ON agent_connectivity_status (last_checked_at);
```

New API endpoints / function signatures
- POST /api/internal/connectivity/check-all
  - Purpose: trigger an on-demand connectivity check for all known agents. Restricted to orchestration-role service principals (mTLS or service token).
  - Request body: optional { "force": true }
  - Response: { "run_id": "uuid", "started_at": "timestamp" }
- GET /api/internal/connectivity/agents/{agent_id}
  - Purpose: return latest agent_connectivity_status rows for the agent.
  - Response: { "agent_id": "uuid", "statuses": [{ "service": "paperclip_api", "status": "ok", "last_checked_at": "...", "latency_ms": 120, "details": {...} } ] }

- Background worker function signatures (pseudocode)
  - async function checkAllAgentsConnectivity(ctx) -> ConnectivityReport
  - async function checkAgentConnectivity(agentId, options) -> AgentStatus
    - AgentStatus fields: agent_id, service, status, last_checked_at, latency_ms, details

Operational behavior
- Schedule: run checks every 10 minutes by default; make interval configurable per-environment.
- Per-agent checks include (minimal set):
  - Paperclip API: authenticated GET /api/agents/me using agent's token/service principal; validate 2xx + JSON shape.
  - Git broker: git ls-remote $PAPERCLIP_WORKSPACE_REPO_URL via broker flow when BROKER token is present; capture latency and exit code.
  - Optional: TCP probe for endpoints and DNS resolution check.
- Persist results to agent_connectivity_status and optionally to connectivity_checks for history.
- Emit monitoring metrics and events: checks_total, checks_failed, check_latency_ms, checks_by_service

Potential edge cases & security considerations
- Secrets handling
  - Never log token values. Mask any token-derived identifiers in details.
  - Store tokens in platform secret store or KMS; checks should read via secure API and not persist secrets.
- Rate limits & DoS
  - Throttle checks to avoid hitting external rate limits (GitHub/APIs). Use shared circuit breaker and per-service quotas.
- Transient failures
  - Treat single transient failures as 'warn'; require N consecutive failures (configurable, e.g., 3 within 30m) to escalate to 'fail'.
- Audit & retention
  - Persist check history for >= 30 days. Provide an archive/rolloff policy.
- Least privilege & RBAC
  - Run checks using least-privileged tokens; restrict POST /api/internal/* endpoints to service principals and admin roles.
- Sensitive telemetry
  - details JSON must not contain raw tokens or secrets. Only include error codes, masked ids, and stack traces if sanitized.

Acceptance criteria (pre-implementation)
- CEO sign-off recorded on this spec.
- Required tokens and broker connectivity validated manually.
- No broker_transport_unavailable or configuration_directory_unavailable errors in the environment.

Developer's Checklist (Lead Developer)
- Prep & Validation
  - [ ] Confirm CEO approval present.
  - [ ] Validate presence of required env vars listed above in staging and prod.
  - [ ] Fix broker/token issues (rotate tokens, restart broker) if broker_transport_unavailable.
- DB & Models
  - [ ] Add migration for agent_connectivity_status and optional connectivity_checks history.
  - [ ] Add ORM model and repository methods (list, upsert latest, query history).
- Services & Worker
  - [ ] Implement checkAgentConnectivity(agentId) and checkAllAgentsConnectivity() service functions.
  - [ ] Implement retry/backoff, circuit-breaker and throttling; make thresholds configurable via env/config.
  - [ ] Wire a periodic scheduler (cron every 10m) and an endpoint to trigger ad-hoc checks.
- API
  - [ ] Implement and secure POST /api/internal/connectivity/check-all and GET /api/internal/connectivity/agents/{agent_id}.
- Tests
  - [ ] Unit tests for service functions, DB writes, and helper utilities.
  - [ ] Integration test mocking Paperclip API and Git broker flows; test 'warn' vs 'fail' thresholds.
- Monitoring & Alerts
  - [ ] Add metrics (checks_total, checks_failed, avg_latency_ms) and create alert rule for consecutive failures (e.g., 3 fails in 30 minutes).
- Docs & Rollout
  - [ ] Update README or operations runbook with required env vars and recovery steps.
  - [ ] Create PR with clear description, testing notes, and rollback plan.

Notes & next steps
- Implementation must not proceed without CEO sign-off.
- After sign-off I can generate DB migration SQL, API skeletons, and starter patches for review. Say "Prepare implementation tasks" to get those artifacts.
