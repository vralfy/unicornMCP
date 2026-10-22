# UNI-4 Technical Spec: AI Company Connectivity & Access Check

Updated: 2026-10-22T10:10:00+0200 (Europe/Berlin)

## Verdict

The company is partially functional and now has a working routed path again.

- Agent roster: verified from local Paperclip company files.
- Source access: available for this runtime; the UnicornMCP workspace is readable and Git metadata is present.
- Orchestrator direct curl bridge: broken from this run. `PAPERCLIP_API_URL=http://127.0.0.1:3100` failed with connection failure / HTTP `000`.
- Paperclip MCP control surface: working. It listed projects, read UNI-4 context, and created real child tasks.
- Current routing state: `UNI-5` assigned to Orchestrator and `UNI-6` assigned to System Architect through the working Paperclip MCP path.

## Verified Agent Roster

- CEO: `22c0e2b8-3fb3-440f-b0c7-c506c85e271c`
- Orchestrator: `24cd18f3-4bee-491e-b1ce-882bce451852`
- System Architect: `9ebf7831-9c41-4618-9062-2115761383b6`
- Lead Developer: `38f7e0e4-1813-48c4-83aa-e223b68a5998`
- QA / Testing: `e657358e-3add-40af-a01a-d5ed0540c8cf`
- Documentation: `86e9cef0-f630-48fb-8e7e-605984ce9ca7`

## Required Connectors / Tokens

Names only:

- `PAPERCLIP_API_URL`
- `PAPERCLIP_API_KEY`
- `PAPERCLIP_AGENT_ID`
- `PAPERCLIP_COMPANY_ID`
- `PAPERCLIP_TASK_ID`
- `PAPERCLIP_RUN_ID`
- `PAPERCLIP_WORKSPACE_ID`
- `PAPERCLIP_GITHUB_BROKER_URL`
- `PAPERCLIP_GITHUB_BROKER_TOKEN`
- `PAPERCLIP_GIT_TOKEN` or working broker-managed Git credentials
- Optional repo MCP connectors: OpenWeatherMap API key, Jira credentials, Confluence credentials, Bitbucket credentials, GitLab token, proxy config

## Current Findings

- `PAPERCLIP_API_URL=http://127.0.0.1:3100`
- `PAPERCLIP_API_KEY=SET`
- `PAPERCLIP_GITHUB_BROKER_TOKEN=SET`
- `PAPERCLIP_GITHUB_BROKER_URL=SET`
- `PAPERCLIP_GIT_TOKEN=UNSET`
- Fresh direct curl probe to `/api/agents/me`: failed to connect, HTTP `000`
- Paperclip MCP task/project tools: working
- Git remote is locally readable: `https://github.com/vralfy/unicornMCP`
- `git status` emitted broker/config warnings: `configuration_directory_unavailable` and `broker_transport_unavailable`
- `node_modules` does not appear to be installed, so runtime/test execution needs dependency installation before test verification

## Reconfiguration / Permission Steps

1. Treat Paperclip MCP as the working control-plane path for UNI-4 until the direct curl bridge is repaired.
2. Repair direct API reachability from Codex shells:
   - start/fix the Paperclip bridge on `127.0.0.1:3100`, or
   - inject a reachable `PAPERCLIP_API_URL` for sandboxed runs.
3. Verify run authentication:
   - keep `PAPERCLIP_API_KEY` injected,
   - include `X-Paperclip-Run-Id` on modifying direct API calls.
4. Repair Git/broker access before implementation:
   - provide `PAPERCLIP_GIT_TOKEN`, or
   - fix broker-managed Git credentials and configuration directory access.
5. Validate repo execution path:
   - install dependencies if missing,
   - run `npm test`,
   - smoke-check `npm run cli` or `npm run server`.

## Blockers + Mitigations

- Blocker: Direct Orchestrator/curl bridge unreachable at `http://127.0.0.1:3100`.
  - Mitigation: use Paperclip MCP for routing now; repair bridge separately.
  - Estimate: 0.5-1.5 hours.

- Blocker: Git credential path degraded; `PAPERCLIP_GIT_TOKEN` unset and broker transport unavailable.
  - Mitigation: fix broker transport/config or inject a Git token for agents that need source-control writes.
  - Estimate: 1-2 hours.

- Blocker: Dependency/runtime verification not completed.
  - Mitigation: install dependencies and run test/server smoke checks.
  - Estimate: 1-2 hours.

## Active Follow-Up Tasks

- `UNI-5` / `587eda82-1b00-478c-a41c-163716573b53`: Orchestrator repair and routing check, assigned to Orchestrator `24cd18f3-4bee-491e-b1ce-882bce451852`.
- `UNI-6` / `623941bd-d9f0-4bb6-a320-904e53d3d242`: System Architect connectivity spec, assigned to System Architect `9ebf7831-9c41-4618-9062-2115761383b6`.

## Estimated Effort

Total estimated effort to restore end-to-end company operation: 3.5-6 hours.

## Files Inspected

- `Artifacts/UNI-4-AI-company-check.md`
- `Artifacts/UNI-4-orchestrator-env-check.md`
- `Artifacts/UNI-4-orchestrator-fallback-note.md`
- `Artifacts/UNI-4-assignee-proposal.md`
- `Artifacts/UNI-4-system-architect-task.md`
- `Artifacts/UNI-4-tech-spec.md`
- `package.json`
- `README.md`
- `.vscode/mcp.json`
- `mcp.ts`
- `mods/tools.ts`
- `mods/server.ts`
- `mods/gitlab.ts`
- `mods/bitbucket.ts`
- `mods/jira.ts`
- `mods/confluence.ts`
- `mods/google.ts`
- `mods/weather.ts`
- `mods/rss.ts`
- `example.config.json`
- `example.secrets.json`
- `test/connection.test.ts`
- `test/connectiontest.ts`
- `/tmp/UNI4_env.txt`
