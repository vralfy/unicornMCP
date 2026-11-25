import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { createChatStore, channelToFile, channelLabel, directFile, formatMessages, formatUnread } from './store.ts';

describe('chat store', () => {
  let dir: string;
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-test-'));
    store = createChatStore(dir);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));

  describe('naming', () => {
    it('builds readable file names', () => {
      expect(directFile('dev-1', 'architect')).toBe('direct-architect+dev-1.jsonl');
      expect(channelToFile('topic:api')).toBe('topic-api.jsonl');
      expect(channelToFile('direct-b+a')).toBe('direct-a+b.jsonl');
      expect(channelToFile('broadcast')).toBe('broadcast.jsonl');
      expect(channelLabel('direct-a+b.jsonl')).toBe('direct:a+b');
    });

    it('rejects unsafe names', () => {
      expect(() => store.register('../evil')).toThrow(/Ungültiger/);
      expect(() => channelToFile('topic-A B')).toThrow(/Ungültiger/);
      expect(() => channelToFile('whatever')).toThrow(/Unbekannter Kanal/);
    });
  });

  describe('register', () => {
    it('assigns a uuid when no name is given', () => {
      const { agent, created } = store.register();
      expect(created).toBe(true);
      expect(agent.name).toMatch(/^[0-9a-f-]{36}$/);
      expect(fs.existsSync(path.join(dir, `agent-${agent.name}.json`))).toBe(true);
    });

    it('re-registers and reports recent activity', () => {
      store.register('dev-1', 'first');
      const again = store.register('dev-1');
      expect(again.created).toBe(false);
      expect(again.recentlyActive).toBe(true);
      expect(again.agent.description).toBe('first');
    });

    it('requires registration for sending', () => {
      expect(() => store.broadcast('ghost', 'hi')).toThrow(/register/);
    });
  });

  describe('inbox', () => {
    beforeEach(() => {
      store.register('a');
      store.register('b');
    });

    it('delivers direct messages without subscription and excludes own messages', () => {
      store.send('a', 'b', 'hallo b');
      expect(store.readInbox('a').messages).toHaveLength(0);
      const inbox = store.readInbox('b');
      expect(inbox.messages.map(m => m.body)).toEqual(['hallo b']);
      expect(inbox.messages[0].channel).toBe('direct:a+b');
      expect(store.readInbox('b').messages).toHaveLength(0); // cursor advanced
    });

    it('shows only broadcasts sent after the first registration', () => {
      store.broadcast('a', 'old');
      store.register('c');
      store.broadcast('a', 'new');
      expect(store.readInbox('c').messages.map(m => m.body)).toEqual(['new']);
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['old', 'new']);
    });

    it('delivers the full topic history on first subscription', () => {
      store.post('a', 'api', 'one');
      store.post('a', 'api', 'two');
      expect(store.readInbox('b').messages).toHaveLength(0); // not subscribed
      store.subscribe('b', 'api');
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['one', 'two']);
    });

    it('does not replay read posts after unsubscribe/subscribe', () => {
      store.subscribe('b', 'api');
      store.post('a', 'api', 'one');
      store.readInbox('b');
      store.unsubscribe('b', 'api');
      store.post('a', 'api', 'missed while away');
      store.subscribe('b', 'api');
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['missed while away']);
    });

    it('auto-subscribes on post', () => {
      store.post('b', 'release', 'starting');
      store.post('a', 'release', 'ok');
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['ok']);
      expect(store.listTopics()).toEqual([{ topic: 'release', channel: 'topic-release', subscribers: ['a', 'b'], messages: 2 }]);
    });

    it('respects limit and keeps the rest unread', () => {
      store.send('a', 'b', '1');
      store.broadcast('a', '2');
      store.send('a', 'b', '3');
      const first = store.readInbox('b', 2);
      expect(first.messages.map(m => m.body)).toEqual(['1', '2']);
      expect(first.remaining).toBe(1);
      expect(store.unreadCounts('b')).toEqual({ total: 1, counts: { 'direct:a+b': 1 } });
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['3']);
    });

    it('ignores a half written last line until it is complete', () => {
      store.send('a', 'b', 'complete');
      const file = path.join(dir, 'direct-a+b.jsonl');
      fs.appendFileSync(file, '{"id":"x","ts":"2099-01-01T00:00:00.000Z","from":"a","bo');
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['complete']);
      fs.appendFileSync(file, 'dy":"late","threadId":"x"}\n');
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['late']);
    });
  });

  describe('threads and replies', () => {
    beforeEach(() => {
      store.register('a');
      store.register('b');
    });

    it('links replies across channels into one thread', () => {
      const root = store.post('a', 'api', 'question');
      const r1 = store.post('b', 'api', 'answer', root.id);
      const r2 = store.send('a', 'b', 'private follow-up', r1.id);
      expect(r1.threadId).toBe(root.id);
      expect(r2.threadId).toBe(root.id);
      expect(store.thread(r2.id).map(m => m.body)).toEqual(['question', 'answer', 'private follow-up']);
    });

    it('forbids replies to broadcasts', () => {
      const b = store.broadcast('a', 'announcement');
      expect(() => store.send('b', 'a', 're', b.id)).toThrow(/Broadcasts/);
      expect(() => store.post('b', 'x', 're', b.id)).toThrow(/Broadcasts/);
    });

    it('rejects unknown replyTo ids', () => {
      expect(() => store.send('a', 'b', 'x', 'nope')).toThrow(/nicht gefunden/);
    });
  });

  describe('history', () => {
    it('reads without moving cursors and supports limit/before', () => {
      store.register('a');
      store.register('b');
      const m1 = store.send('a', 'b', '1');
      store.send('b', 'a', '2');
      const m3 = store.send('a', 'b', '3');
      expect(store.history('direct:b+a').map(m => m.body)).toEqual(['1', '2', '3']);
      expect(store.history('direct-a+b', 1).map(m => m.body)).toEqual(['3']);
      expect(store.history('direct-a+b', undefined, m3.ts).map(m => m.body)).toEqual(['1', '2']);
      expect(store.history('direct-a+b', undefined, m1.id)).toEqual([]);
      expect(store.readInbox('b').messages.map(m => m.body)).toEqual(['1', '3']);
    });
  });

  describe('locking', () => {
    it('takes over a stale lock', () => {
      store.register('a');
      const lock = path.join(dir, 'broadcast.jsonl.lock');
      fs.writeFileSync(lock, '');
      const old = new Date(Date.now() - 60_000);
      fs.utimesSync(lock, old, old);
      expect(store.broadcast('a', 'still works').body).toBe('still works');
      expect(fs.existsSync(lock)).toBe(false);
    });

    it('times out on a fresh foreign lock', () => {
      const s = createChatStore(dir, { lockTimeoutMs: 100, lockStaleMs: 60_000 });
      s.register('a');
      fs.writeFileSync(path.join(dir, 'broadcast.jsonl.lock'), '');
      expect(() => s.broadcast('a', 'x')).toThrow(/Zeitüberschreitung/);
    });

    it('keeps every line intact with parallel writer processes', async () => {
      store.register('w1');
      store.register('w2');
      const storeUrl = pathToFileURL(path.resolve(__dirname, 'store.ts')).href;
      const script = path.join(dir, 'writer.mts');
      fs.writeFileSync(script, `
        const { createChatStore } = await import(${JSON.stringify(storeUrl)});
        const [dir, name, n] = process.argv.slice(2);
        const s = createChatStore(dir);
        for (let i = 0; i < Number(n); i++) s.post(name, 'load', name + '-' + i);
      `);
      const run = (name: string) => new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', script, dir, name, '50']);
        let err = '';
        child.stderr.on('data', d => { err += d; });
        child.on('exit', code => (code === 0 ? resolve() : reject(new Error(err))));
      });
      await Promise.all([run('w1'), run('w2')]);
      const lines = store._readLines('topic-load.jsonl');
      expect(lines).toHaveLength(100);
      expect(lines.every(Boolean)).toBe(true);
      expect(new Set(lines.map(m => m.body)).size).toBe(100);
    }, 60_000);
  });

  describe('formatting', () => {
    it('renders compact text and unread hints', () => {
      const text = formatMessages([{ id: 'i1', ts: '2026-11-25T10:02:03.123Z', from: 'a', body: 'hi', threadId: 'i1', replyTo: 'p', channel: 'topic:api' }]);
      expect(text).toBe('[topic:api] a · 2026-11-25 10:02:03Z · id=i1 · re=p\nhi');
      expect(formatUnread({ total: 0, counts: {} })).toBe('');
      expect(formatUnread({ total: 2, counts: { broadcast: 2 } })).toContain('2 ungelesene Nachrichten (2 broadcast)');
    });
  });
});
