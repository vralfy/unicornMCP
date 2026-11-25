// 🦄 Registers this unicornMCP checkout as local stdio MCP connection in Paperclip.
//
//   npm run paperclip:register                    -> first company of http://127.0.0.1:3100
//   npm run paperclip:register -- <companyId>     -> specific company
//   npm run paperclip:register -- --dry-run       -> only print what would be sent
//
//   PAPERCLIP_URL=http://127.0.0.1:3100           -> other Paperclip instance
//
// Paperclip only runs stdio commands from an approved template, and the template carries the
// tool list (Paperclip does not ask the server itself). So this script starts the server once,
// reads tools/list, stores it in a template "unicorn-<hash>" and points the connection at it.
// Re-run it whenever tools change: a new template is created, old ones get disabled.
//
// Paperclip spawns the command without cwd and with an env that only contains PATH, so the
// template runs a shell that changes into this checkout and sets the env variables itself.
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [companyArg] = args.filter(a => a !== '--dry-run');
const base = (process.env.PAPERCLIP_URL || 'http://127.0.0.1:3100').replace(/\/$/, '') + '/api';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const CONNECTION_NAME = 'Unicorn MCP (stdio)';
const ENV = { NODE_TLS_REJECT_UNAUTHORIZED: '0', NO_PROXY: 'localhost,127.0.0.1' };

const node = process.execPath;
const command = win ? 'cmd' : '/bin/sh';
const commandArgs = win
  ? ['/d', '/s', '/c', `cd /d "${dir}" && ${Object.entries(ENV).map(([k, v]) => `set "${k}=${v}"`).join(' && ')} && "${node}" --experimental-strip-types mcp.ts`]
  : ['-c', `cd '${dir}' && ${Object.entries(ENV).map(([k, v]) => `${k}='${v}'`).join(' ')} exec '${node}' --experimental-strip-types mcp.ts`];

// Starts the server like Paperclip does and returns its tools/list result.
function listTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { env: { PATH: process.env.PATH ?? '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server hat nicht innerhalb von 30s geantwortet.\n' + err)); }, 30000);
    child.stderr.on('data', d => { err += d; });
    child.stdout.on('data', d => {
      out += d;
      for (const line of out.split('\n')) {
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
        }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          return msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result.tools);
        }
      }
      out = out.slice(out.lastIndexOf('\n') + 1);
    });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'paperclip-register', version: '1.0.0' } },
    }) + '\n');
  });
}

async function api(method, url, body) {
  if (dryRun && method !== 'GET') {
    console.log(`> ${method} ${url}`, body ? JSON.stringify(body).slice(0, 300) + '…' : '');
    return {};
  }
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

try {
  const tools = (await listTools()).map(t => ({
    name: t.name,
    title: t.title ?? null,
    description: t.description ?? null,
    inputSchema: t.inputSchema ?? null,
    annotations: t.annotations ?? null,
  }));
  console.log(`🦄 ${tools.length} Tools gefunden.`);

  const companyId = companyArg ?? (await api('GET', '/companies'))[0]?.id;
  if (!companyId) throw new Error('Keine Paperclip-Company gefunden.');

  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ command, commandArgs, tools }))
    .digest('hex').slice(0, 10);
  const templateId = `unicorn-${hash}`;

  const { templates = [] } = await api('GET', `/companies/${companyId}/tools/stdio-templates`);
  const current = templates.find(t => t.templateId === templateId);
  if (current?.status === 'disabled') throw new Error(`Vorlage ${templateId} ist deaktiviert.`);
  if (!current) {
    await api('POST', `/companies/${companyId}/tools/stdio-templates`, {
      templateId,
      name: 'Unicorn MCP',
      description: `unicornMCP aus ${dir}`,
      command,
      args: commandArgs,
      envKeys: [],
      tools,
    });
    console.log(`✨ Vorlage ${templateId} angelegt.`);
  } else {
    console.log(`✨ Vorlage ${templateId} ist schon aktuell.`);
  }

  const res = await api('GET', `/companies/${companyId}/tools/connections`);
  const connections = Array.isArray(res) ? res : res.connections ?? [];
  let connection = connections.find(c => c.name === CONNECTION_NAME);
  if (!connection) {
    connection = await api('POST', `/companies/${companyId}/tools/connections`, {
      name: CONNECTION_NAME,
      applicationName: CONNECTION_NAME,
      transport: 'local_stdio',
      authKind: 'none',
      config: { templateId },
      enabled: true,
    });
    console.log(`🌈 Verbindung "${CONNECTION_NAME}" angelegt.`);
  } else {
    await api('PATCH', `/tool-connections/${connection.id}`, { config: { templateId } });
    console.log(`🌈 Verbindung "${CONNECTION_NAME}" auf ${templateId} umgestellt.`);
  }

  if (!dryRun) {
    await api('PATCH', `/tool-connections/${connection.id}`, { status: 'active', enabled: true });
    const refreshed = await api('POST', `/tool-connections/${connection.id}/catalog/refresh`, {});
    console.log(`💖 Aktiv, Health: ${refreshed.connection?.healthStatus ?? '?'}, Katalog: ${refreshed.catalog?.length ?? '?'} Tools.`);
  }

  for (const old of templates.filter(t => t.templateId.startsWith('unicorn-') && t.templateId !== templateId && t.status !== 'disabled')) {
    await api('POST', `/companies/${companyId}/tools/stdio-templates/${encodeURIComponent(old.templateId)}/disable`, { reason: `ersetzt durch ${templateId}` });
    console.log(`🦋 Alte Vorlage ${old.templateId} deaktiviert.`);
  }
} catch (e) {
  console.error(e.cause?.code === 'ECONNREFUSED'
    ? `Paperclip unter ${base} nicht erreichbar. Läuft 'npm run paperclip'?`
    : e.message);
  process.exit(1);
}
