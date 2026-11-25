import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mcpChat } from './chat.ts';

/** Minimal McpServer stand-in that records registrations. */
const fakeMcp = () => {
  const tools: Record<string, Function> = {};
  const resources: Record<string, { uri: any; cb: Function }> = {};
  return {
    tools,
    resources,
    server: { registerCapabilities: jest.fn(), notification: jest.fn(async () => { }) },
    registerTool: (name, _meta, cb) => { tools[name] = cb; },
    registerResource: (name, uri, _meta, cb) => { resources[name] = { uri, cb }; },
  };
};

const fakeExpress = () => {
  const routes: Record<string, Function> = {};
  return {
    routes,
    get: (p, fn) => { routes['GET ' + p] = fn; },
    post: (p, fn) => { routes['POST ' + p] = fn; },
  };
};

const text = (result) => result.content[0].text as string;

describe('mcpChat module', () => {
  let dir: string;
  let mcp: ReturnType<typeof fakeMcp>;
  let app: ReturnType<typeof fakeExpress>;
  let config: any;
  const call = async (tool: string, args: any = {}) => text(await mcp.tools['chat' + tool](args));

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-mod-'));
    mcp = fakeMcp();
    app = fakeExpress();
    config = {
      prefix: '',
      pwd: path.resolve(__dirname, '../..'),
      args: ['node', 'mcp.ts', '--rainbowroad'], // http mode: no background watcher in tests
      chat: { dir },
      info: () => { }, error: () => { }, log: () => { },
    };
    await expect(mcpChat.register(config, mcp, app)).resolves.toBeNull();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('registers all tools, but only read-only resources', () => {
    expect(Object.keys(mcp.tools).sort()).toEqual(
      ['agents', 'broadcast', 'history', 'inbox', 'manual', 'post', 'register', 'send', 'subscribe', 'thread', 'topics', 'unsubscribe'].map(n => 'chat' + n).sort());
    expect(Object.keys(mcp.resources).sort()).toEqual(
      ['agents', 'history', 'manual', 'thread', 'topics'].map(n => 'chat' + n + 'resource').sort());
    expect(String(mcp.resources['chatmanualresource'].uri)).toBe('chat://manual');
  });

  it('serves the manual', async () => {
    expect(await call('manual')).toContain('Anleitung für Agenten');
  });

  it('runs a conversation with unread hints', async () => {
    expect(await call('register', { name: 'a' })).toContain("Registriert als 'a'");
    await call('register', { name: 'b' });
    const sent = await call('send', { agent: 'a', to: 'b', body: 'hi' });
    expect(sent).toContain('Gesendet an direct:a+b');
    expect(await call('subscribe', { agent: 'b', topic: 'x' })).toContain('📬 1 ungelesene Nachricht');
    const inbox = await call('inbox', { agent: 'b' });
    expect(inbox).toMatch(/\[direct:a\+b\] a · .* · id=.*\nhi/);
    expect(await call('inbox', { agent: 'b' })).toBe('Keine neuen Nachrichten.');
  });

  it('refuses to wait in http mode', async () => {
    await call('register', { name: 'a' });
    const res = await call('inbox', { agent: 'a', waitSeconds: 5 });
    expect(res).toContain('HTTP-Modus');
  });

  it('waits for new messages in stdio mode', async () => {
    const mcp2 = fakeMcp();
    await mcpChat.register({ ...config, args: ['node', 'mcp.ts'], chat: { dir, pollIntervalMs: 20, notifyIntervalMs: 60_000 } }, mcp2, undefined);
    await text(await mcp2.tools['chatregister']({ name: 'waiter' }));
    await call('register', { name: 'sender' });
    const pending = mcp2.tools['chatinbox']({ agent: 'waiter', waitSeconds: 5 });
    setTimeout(() => call('send', { agent: 'sender', to: 'waiter', body: 'ping' }), 100);
    expect(text(await pending)).toContain('ping');
  });

  it('returns errors as text for unknown agents', async () => {
    expect(await call('inbox', { agent: 'ghost' })).toContain("Rufe zuerst 'register' auf");
  });

  it('accepts messages from the web view and auto-registers the human', async () => {
    await call('register', { name: 'a' });
    const res = { json: jest.fn(), status: jest.fn(function () { return this; }) };
    await app.routes['POST /chat/api/messages']({ body: { from: 'human', kind: 'topic', topic: 'ops', body: 'hello' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ from: 'human', channel: 'topic:ops' }));
    expect(await call('history', { channel: 'topic-ops' })).toContain('hello');
  });
});
