import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// 🦄 Agent Chat storage: plain files under one directory, shared between processes.
// See README.md (Speicher, Nebenläufigkeit) for the design.

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const BROADCAST_FILE = 'broadcast.jsonl';

export interface ChatMessage {
  id: string;
  ts: string;
  from: string;
  body: string;
  replyTo?: string;
  threadId: string;
  channel?: string; // added on read, never stored
}

export interface ChatAgent {
  name: string;
  description?: string;
  registeredAt: string;
  lastSeen: string;
  subscriptions: string[];
  cursors: Record<string, number>;
}

export interface ChatStoreOptions {
  lockStaleMs?: number;
  lockTimeoutMs?: number;
  activeMinutes?: number;
}

interface Entry {
  file: string;
  idx: number;
  msg: ChatMessage;
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Strictly increasing per process: messages sent in the same millisecond keep their order.
let lastTsMs = 0;
const nextTs = () => {
  lastTsMs = Math.max(Date.now(), lastTsMs + 1);
  return new Date(lastTsMs).toISOString();
};

export const validateName = (name: string, what = 'Name') => {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new Error(`Ungültiger ${what} '${name}'. Erlaubt: ${NAME_RE.source} (Kleinbuchstaben, Ziffern, '-', '_', max. 64 Zeichen).`);
  }
  return name;
};

export const topicFile = (topic: string) => `topic-${topic}.jsonl`;
export const directFile = (a: string, b: string) => `direct-${[a, b].sort().join('+')}.jsonl`;
export const agentFile = (name: string) => `agent-${name}.json`;

/** "topic-x.jsonl" -> "topic:x", "direct-a+b.jsonl" -> "direct:a+b", "broadcast.jsonl" -> "broadcast" */
export const channelLabel = (file: string) => {
  const base = file.replace(/\.jsonl$/, '');
  if (base === 'broadcast') return 'broadcast';
  const m = base.match(/^(topic|direct)-(.+)$/);
  return m ? `${m[1]}:${m[2]}` : base;
};

/** Accepts "topic-x", "topic:x", "topic-x.jsonl", "direct-a+b", "direct:b+a", "broadcast" */
export const channelToFile = (channel: string) => {
  const c = (channel ?? '').trim().replace(/\.jsonl$/, '');
  if (c === 'broadcast') return BROADCAST_FILE;
  const m = c.match(/^(topic|direct)[-:](.+)$/);
  if (!m) throw new Error(`Unbekannter Kanal '${channel}'. Beispiele: 'broadcast', 'topic-api-design', 'direct-architect+dev-1'.`);
  if (m[1] === 'topic') return topicFile(validateName(m[2], 'Topic'));
  const parts = m[2].split('+');
  if (parts.length !== 2) throw new Error(`Ungültiger Direktkanal '${channel}', erwartet 'direct-<agent>+<agent>'.`);
  return directFile(validateName(parts[0], 'Agentenname'), validateName(parts[1], 'Agentenname'));
};

export const createChatStore = (dir: string, options: ChatStoreOptions = {}) => {
  const lockStaleMs = options.lockStaleMs ?? 5000;
  const lockTimeoutMs = options.lockTimeoutMs ?? 10000;
  const activeMinutes = options.activeMinutes ?? 5;

  fs.mkdirSync(dir, { recursive: true });
  const p = (file: string) => path.join(dir, file);

  // ---------- low level ----------

  const withLock = <T>(file: string, fn: () => T): T => {
    const lock = p(file) + '.lock';
    const start = Date.now();
    for (;;) {
      try {
        fs.closeSync(fs.openSync(lock, 'wx'));
        break;
      } catch (e) {
        // Windows reports EPERM/EACCES/EBUSY while another process is deleting the lock ("delete pending")
        if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > lockStaleMs) {
            fs.rmSync(lock, { force: true }); // orphaned lock of a crashed process
            continue;
          }
        } catch { /* lock vanished meanwhile, retry */ }
        if (Date.now() - start > lockTimeoutMs) throw new Error(`Zeitüberschreitung beim Sperren von ${file} (${e.code})`);
        sleepSync(10 + Math.random() * 20);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lock, { force: true });
    }
  };

  /** Complete lines only: a trailing fragment without "\n" is being written right now and is ignored. */
  const readLines = (file: string): (ChatMessage | null)[] => {
    let content: string;
    try {
      content = fs.readFileSync(p(file), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const lines = content.split('\n');
    lines.pop(); // either "" after the last "\n" or an incomplete fragment
    return lines.map(line => {
      try {
        return JSON.parse(line) as ChatMessage;
      } catch {
        return null; // keep the slot so cursors stay line based
      }
    });
  };

  const lineCount = (file: string) => readLines(file).length;

  const listFiles = (re: RegExp) => {
    try {
      return fs.readdirSync(dir).filter(f => re.test(f));
    } catch {
      return [];
    }
  };

  const append = (file: string, msg: Omit<ChatMessage, 'ts'>): ChatMessage =>
    withLock(file, () => {
      // ts inside the lock keeps timestamps monotonic within one file
      const full: ChatMessage = { id: msg.id, ts: nextTs(), from: msg.from, body: msg.body, ...(msg.replyTo ? { replyTo: msg.replyTo } : {}), threadId: msg.threadId };
      fs.appendFileSync(p(file), JSON.stringify(full) + '\n', 'utf8');
      return { ...full, channel: channelLabel(file) };
    });

  // ---------- agents ----------

  const readAgent = (name: string): ChatAgent | null => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return JSON.parse(fs.readFileSync(p(agentFile(name)), 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        sleepSync(20); // concurrent rewrite, try again
      }
    }
    throw new Error(`Agentendatei von '${name}' ist nicht lesbar`);
  };

  const writeAgent = (agent: ChatAgent) => {
    const file = p(agentFile(agent.name));
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(agent, null, 2), 'utf8');
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(tmp, file);
        return;
      } catch (e) {
        if (attempt >= 10) {
          fs.rmSync(tmp, { force: true });
          throw e;
        }
        sleepSync(20); // Windows: target briefly opened by a reader
      }
    }
  };

  const updateAgent = (name: string, fn: (a: ChatAgent) => void): ChatAgent =>
    withLock(agentFile(name), () => {
      const agent = readAgent(name);
      if (!agent) throw unknownAgent(name);
      fn(agent);
      writeAgent(agent);
      return agent;
    });

  const unknownAgent = (name: string) =>
    new Error(`Unbekannter Agent '${name}'. Rufe zuerst 'register' auf (Anleitung: Tool 'manual').`);

  const requireAgent = (name: string): ChatAgent => {
    validateName(name, 'Agentenname');
    const agent = readAgent(name);
    if (!agent) throw unknownAgent(name);
    return agent;
  };

  const touch = (name: string) => updateAgent(name, a => { a.lastSeen = new Date().toISOString(); });

  const register = (name?: string, description?: string) => {
    const agentName = name ? validateName(name, 'Agentenname') : randomUUID();
    return withLock(agentFile(agentName), () => {
      const now = new Date();
      const existing = readAgent(agentName);
      if (existing) {
        const activeAgoMs = now.getTime() - new Date(existing.lastSeen).getTime();
        const active = activeAgoMs < activeMinutes * 60_000;
        existing.lastSeen = now.toISOString();
        if (description) existing.description = description;
        writeAgent(existing);
        return { agent: existing, created: false, recentlyActive: active };
      }
      const agent: ChatAgent = {
        name: agentName,
        ...(description ? { description } : {}),
        registeredAt: now.toISOString(),
        lastSeen: now.toISOString(),
        subscriptions: [],
        // new agents only see broadcasts sent after their first registration
        cursors: { [BROADCAST_FILE]: lineCount(BROADCAST_FILE) },
      };
      writeAgent(agent);
      return { agent, created: true, recentlyActive: false };
    });
  };

  const listAgents = () =>
    listFiles(/^agent-.+\.json$/)
      .map(f => readAgent(f.replace(/^agent-|\.json$/g, '')))
      .filter(Boolean)
      .map(({ cursors, ...rest }) => rest)
      .sort((a, b) => a.name.localeCompare(b.name));

  // ---------- subscriptions ----------

  const subscribe = (name: string, topic: string) => {
    validateName(topic, 'Topic');
    let added = false;
    updateAgent(name, a => {
      if (!a.subscriptions.includes(topic)) {
        a.subscriptions.push(topic);
        added = true;
      }
      // first subscription: the whole topic history lands in the inbox
      if (a.cursors[topicFile(topic)] === undefined) a.cursors[topicFile(topic)] = 0;
    });
    return added;
  };

  const unsubscribe = (name: string, topic: string) => {
    validateName(topic, 'Topic');
    let removed = false;
    updateAgent(name, a => {
      removed = a.subscriptions.includes(topic);
      a.subscriptions = a.subscriptions.filter(t => t !== topic);
      // cursor stays, a later re-subscription does not replay read posts
    });
    return removed;
  };

  // ---------- messages ----------

  const allMessageFiles = () => listFiles(/^(broadcast|topic-.+|direct-.+)\.jsonl$/);

  const findMessage = (id: string): ChatMessage | null => {
    for (const file of allMessageFiles()) {
      const msg = readLines(file).find(m => m?.id === id);
      if (msg) return { ...msg, channel: channelLabel(file) };
    }
    return null;
  };

  const resolveReply = (replyTo?: string) => {
    if (!replyTo) return {};
    const parent = findMessage(replyTo);
    if (!parent) throw new Error(`Nachricht '${replyTo}' für replyTo nicht gefunden.`);
    if (parent.channel === 'broadcast') throw new Error('Antworten auf Broadcasts sind nicht erlaubt.');
    return { replyTo, threadId: parent.threadId ?? parent.id };
  };

  const newMessage = (from: string, body: string, replyTo?: string) => {
    if (!body || !body.trim()) throw new Error('Leere Nachricht.');
    const id = randomUUID();
    return { id, from, body, threadId: id, ...resolveReply(replyTo) };
  };

  const send = (from: string, to: string, body: string, replyTo?: string) => {
    requireAgent(from);
    validateName(to, 'Empfänger');
    if (!readAgent(to)) throw new Error(`Empfänger '${to}' ist nicht registriert. Registrierte Agenten liefert 'agents'.`);
    if (to === from) throw new Error('Direktnachrichten an sich selbst sind nicht möglich.');
    return append(directFile(from, to), newMessage(from, body, replyTo));
  };

  const post = (from: string, topic: string, body: string, replyTo?: string) => {
    requireAgent(from);
    validateName(topic, 'Topic');
    const msg = append(topicFile(topic), newMessage(from, body, replyTo));
    subscribe(from, topic); // posting subscribes automatically
    return msg;
  };

  const broadcast = (from: string, body: string) => {
    requireAgent(from);
    return append(BROADCAST_FILE, newMessage(from, body));
  };

  // ---------- inbox ----------

  const relevantFiles = (agent: ChatAgent) => {
    const direct = listFiles(/^direct-.+\.jsonl$/).filter(f => f.replace(/^direct-|\.jsonl$/g, '').split('+').includes(agent.name));
    return [BROADCAST_FILE, ...agent.subscriptions.map(topicFile), ...direct];
  };

  const collectUnread = (agent: ChatAgent) => {
    const perFile: Record<string, number> = {};
    const foreign: Entry[] = [];
    for (const file of relevantFiles(agent)) {
      const lines = readLines(file);
      perFile[file] = lines.length;
      const start = Math.min(agent.cursors[file] ?? 0, lines.length);
      for (let idx = start; idx < lines.length; idx++) {
        const msg = lines[idx];
        if (msg && msg.from !== agent.name) foreign.push({ file, idx, msg });
      }
    }
    foreign.sort((a, b) => a.msg.ts.localeCompare(b.msg.ts) || a.idx - b.idx);
    return { perFile, foreign };
  };

  /** Unread counts per channel label, without touching cursors. */
  const unreadCounts = (name: string) => {
    const { foreign } = collectUnread(requireAgent(name));
    const counts: Record<string, number> = {};
    foreign.forEach(e => { const l = channelLabel(e.file); counts[l] = (counts[l] ?? 0) + 1; });
    return { total: foreign.length, counts };
  };

  /** Returns unread messages (oldest first) and advances the cursors past them. */
  const readInbox = (name: string, limit?: number) =>
    withLock(agentFile(name), () => {
      const agent = readAgent(name);
      if (!agent) throw unknownAgent(name);
      const { perFile, foreign } = collectUnread(agent);
      const take = limit && limit > 0 ? foreign.slice(0, limit) : foreign;
      const left = foreign.slice(take.length);
      for (const file of Object.keys(perFile)) {
        const firstLeft = left.filter(e => e.file === file).reduce((min, e) => Math.min(min, e.idx), Infinity);
        agent.cursors[file] = firstLeft === Infinity ? perFile[file] : firstLeft;
      }
      agent.lastSeen = new Date().toISOString();
      writeAgent(agent);
      return {
        messages: take.map(e => ({ ...e.msg, channel: channelLabel(e.file) })),
        remaining: left.length,
      };
    });

  // ---------- history / thread / overview ----------

  const history = (channel: string, limit?: number, before?: string) => {
    const file = channelToFile(channel);
    let msgs = readLines(file).filter(Boolean).map(m => ({ ...m, channel: channelLabel(file) }));
    if (before) {
      const ref = /^\d{4}-\d{2}-\d{2}/.test(before) ? before : findMessage(before)?.ts;
      if (!ref) throw new Error(`'before' ist weder ein ISO-Zeitpunkt noch eine bekannte Nachrichten-ID: ${before}`);
      msgs = msgs.filter(m => m.ts < ref);
    }
    return limit && limit > 0 ? msgs.slice(-limit) : msgs;
  };

  const thread = (id: string) => {
    const msg = findMessage(id);
    if (!msg) throw new Error(`Nachricht '${id}' nicht gefunden.`);
    const root = msg.threadId ?? msg.id;
    const all: ChatMessage[] = [];
    for (const file of allMessageFiles()) {
      readLines(file).forEach(m => { if (m && (m.threadId ?? m.id) === root) all.push({ ...m, channel: channelLabel(file) }); });
    }
    return all.sort((a, b) => a.ts.localeCompare(b.ts));
  };

  const listTopics = () => {
    const agents = listAgents();
    const names = new Set<string>([
      ...listFiles(/^topic-.+\.jsonl$/).map(f => f.replace(/^topic-|\.jsonl$/g, '')),
      ...agents.flatMap(a => a.subscriptions),
    ]);
    return [...names].sort().map(topic => ({
      topic,
      channel: `topic-${topic}`,
      subscribers: agents.filter(a => a.subscriptions.includes(topic)).map(a => a.name),
      messages: lineCount(topicFile(topic)),
    }));
  };

  const listChannels = () =>
    allMessageFiles().sort().map(file => {
      const lines = readLines(file).filter(Boolean);
      return { channel: file.replace(/\.jsonl$/, ''), label: channelLabel(file), messages: lines.length, lastTs: lines.at(-1)?.ts ?? null };
    });

  return {
    dir,
    register,
    requireAgent,
    touch,
    listAgents,
    subscribe,
    unsubscribe,
    send,
    post,
    broadcast,
    findMessage,
    unreadCounts,
    readInbox,
    history,
    thread,
    listTopics,
    listChannels,
    // exposed for tests
    _readLines: readLines,
    _withLock: withLock,
  };
};

export type ChatStore = ReturnType<typeof createChatStore>;

// ---------- formatting ----------

const fmtTs = (ts: string) => ts.replace('T', ' ').replace(/\.\d+Z$/, 'Z');

export const formatMessages = (messages: ChatMessage[], format: 'text' | 'json' = 'text') => {
  if (format === 'json') return messages;
  if (!messages.length) return 'Keine Nachrichten.';
  return messages
    .map(m => `[${m.channel}] ${m.from} · ${fmtTs(m.ts)} · id=${m.id}${m.replyTo ? ` · re=${m.replyTo}` : ''}\n${m.body}`)
    .join('\n\n');
};

export const formatUnread = (u: { total: number; counts: Record<string, number> }) =>
  u.total
    ? `📬 ${u.total} ungelesene Nachricht${u.total === 1 ? '' : 'en'} (${Object.entries(u.counts).map(([c, n]) => `${n} ${c}`).join(', ')}). Abrufen mit 'inbox'.`
    : '';
