// 🦄 Registers this unicornMCP checkout as stdio MCP server in Claude Code.
//
//   npm run mcp:add                      -> scope "user", name "unicorn"
//   npm run mcp:add -- project           -> scope "project" (.mcp.json in the current project)
//   npm run mcp:add -- user unicorn2     -> custom name
//   npm run mcp:add -- --dry-run         -> only print the command
//
// The absolute path of this checkout is filled in automatically, so the server always
// starts in this directory (relative paths like tmp/chat resolve here).
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [scope = 'user', name = 'unicorn'] = args.filter(a => a !== '--dry-run');
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';

const server = win
  ? ['cmd', '/c', 'npm', 'run', 'cli', `--prefix=${dir}`]
  : ['npm', 'run', 'cli', `--prefix=${dir}`];

// name first: --env is variadic and would otherwise swallow the server name
const claudeArgs = [
  'mcp', 'add', name,
  '--scope', scope,
  '--env', 'NODE_TLS_REJECT_UNAUTHORIZED=0',
  '--env', 'NO_PROXY=localhost,127.0.0.1',
  '--', ...server,
];

const quote = a => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
console.log('> claude ' + claudeArgs.map(quote).join(' '));
if (dryRun) process.exit(0);

try {
  // claude is a .cmd shim on Windows, which needs a shell
  if (win) execFileSync('claude ' + claudeArgs.map(quote).join(' '), { stdio: 'inherit', shell: true });
  else execFileSync('claude', claudeArgs, { stdio: 'inherit' });
} catch (e) {
  console.error(e.code === 'ENOENT' || /not recognized|not found/i.test(String(e.message))
    ? "Claude Code CLI ('claude') nicht gefunden. Installation: npm install -g @anthropic-ai/claude-code"
    : `claude mcp add fehlgeschlagen (${e.status ?? e.message})`);
  process.exit(1);
}
