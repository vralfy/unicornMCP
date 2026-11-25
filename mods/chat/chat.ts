import * as fs from 'fs';
import * as path from 'path';
import z from "zod";
import { registerMCPResource, registerMCPTool } from "../abstract.ts";
import { createChatStore, formatMessages, formatUnread, NAME_RE } from "./store.ts";

// 🦄 Agent Chat: local messaging between agents (direct, topics, broadcasts).
// Design: mods/chat/README.md – usage for agents: mods/chat/MANUAL.md

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mcpChat = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    try {
      const pluginName = 'Chat';
      const pwd = config.pwd ?? process.cwd();
      const opts = {
        dir: 'tmp/chat',
        maxWaitSeconds: 60,
        pollIntervalMs: 500,
        notifyIntervalMs: 2000,
        webPath: '/chat',
        historyLimit: 100,
        activeMinutes: 5,
        ...(config.chat ?? {}),
      };
      const dir = path.isAbsolute(opts.dir) ? opts.dir : path.resolve(pwd, opts.dir);
      const store = createChatStore(dir, { activeMinutes: opts.activeMinutes });
      const httpMode = (config.args ?? process.argv).includes('--rainbowroad');
      const manualFile = path.resolve(pwd, 'mods/chat/MANUAL.md');
      const webFile = path.resolve(pwd, 'mods/chat/web.html');
      const log = (...msg) => (config.log ?? (() => { }))(...msg);

      // ---------- push notifications (stdio only, see README "Benachrichtigung") ----------

      // Names registered by this very process: no duplicate warning for them, and they get push notifications.
      const ownAgents = new Set<string>();
      const lastNotified: Record<string, number> = {};
      let watcher: ReturnType<typeof setInterval> | null = null;

      // Candidate for Claude Code channels; harmless if the client ignores it. Must happen before connect.
      try {
        // (No 'logging' capability: the SDK installs the logging/setLevel handler only in its constructor.)
        mcp?.server?.registerCapabilities?.({ experimental: { 'claude/channel': {} } });
      } catch (e) {
        log('Chat: could not register notification capabilities', e?.message);
      }

      /** Single place for push delivery – the mechanism is evaluated after implementation (README, Frage 7). */
      const notify = async (agent: string, summary: string) => {
        log('Chat notify', agent, summary);
        const server = mcp?.server;
        if (!server) return;
        await server.notification?.({
          method: 'notifications/claude/channel',
          // meta keys must be identifiers (letters, digits, _); `source` is set by Claude Code from the server name
          params: { content: summary, meta: { chat_agent: agent } },
        }).catch(() => { });
      };

      const startWatcher = () => {
        if (httpMode || watcher || !mcp) return;
        watcher = setInterval(() => {
          for (const agent of ownAgents) {
            try {
              const unread = store.unreadCounts(agent);
              if (unread.total > (lastNotified[agent] ?? 0)) {
                notify(agent, `[${agent}] ${formatUnread(unread)}`);
              }
              lastNotified[agent] = unread.total;
            } catch (e) {
              log('Chat watcher error', agent, e?.message);
            }
          }
        }, opts.notifyIntervalMs);
        watcher.unref?.();
      };

      // ---------- helpers ----------

      /** Validates + touches the calling agent. */
      const me = (agent: string) => {
        store.requireAgent(agent);
        store.touch(agent);
        return agent;
      };

      /** Appends the unread hint (piggyback notification). */
      const withUnread = (agent: string, text: string) => {
        const hint = formatUnread(store.unreadCounts(agent));
        return hint ? `${text}\n\n${hint}` : text;
      };

      const num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
      const fmt = (v: any): 'text' | 'json' => (v === 'json' ? 'json' : 'text');
      const sent = (agent: string, msg) => withUnread(agent, `Gesendet an ${msg.channel} (id=${msg.id}${msg.replyTo ? `, re=${msg.replyTo}` : ''}).`);

      // ---------- callbacks ----------

      const callbacks = {};

      callbacks['manual'] = async () => fs.readFileSync(manualFile, 'utf8');

      callbacks['register'] = async (args) => {
        const { agent, created, recentlyActive } = store.register(args.name || undefined, args.description || undefined);
        const lines = [
          created ? `Registriert als '${agent.name}'.` : `Wieder angemeldet als '${agent.name}'.`,
          `Merke dir diesen Namen: alle weiteren Chat-Tools brauchen ihn als Argument 'agent'.`,
        ];
        if (recentlyActive && !ownAgents.has(agent.name)) {
          lines.push(`⚠️ Unter diesem Namen war in den letzten ${opts.activeMinutes} Minuten bereits jemand aktiv. Läuft evtl. ein zweiter Agent mit demselben Namen? Dann einen anderen Namen wählen.`);
        }
        if (agent.subscriptions.length) lines.push(`Abonnierte Topics: ${agent.subscriptions.join(', ')}`);
        lines.push(`Falls noch nicht geschehen: lies die Anleitung mit dem Tool 'manual'.`);
        ownAgents.add(agent.name);
        startWatcher();
        return withUnread(agent.name, lines.join('\n'));
      };

      callbacks['agents'] = async () => store.listAgents();

      callbacks['send'] = async (args) => sent(me(args.agent), store.send(args.agent, args.to, args.body, args.replyTo || undefined));

      callbacks['post'] = async (args) => sent(me(args.agent), store.post(args.agent, args.topic, args.body, args.replyTo || undefined));

      callbacks['broadcast'] = async (args) => sent(me(args.agent), store.broadcast(args.agent, args.body));

      callbacks['subscribe'] = async (args) => {
        const added = store.subscribe(me(args.agent), args.topic);
        return withUnread(args.agent, added ? `Topic '${args.topic}' abonniert.` : `Topic '${args.topic}' war bereits abonniert.`);
      };

      callbacks['unsubscribe'] = async (args) => {
        const removed = store.unsubscribe(me(args.agent), args.topic);
        return withUnread(args.agent, removed ? `Topic '${args.topic}' abbestellt.` : `Topic '${args.topic}' war nicht abonniert.`);
      };

      callbacks['topics'] = async () => store.listTopics();

      callbacks['inbox'] = async (args) => {
        const agent = me(args.agent);
        let waitSeconds = Math.max(0, Math.min(num(args.waitSeconds) ?? 0, opts.maxWaitSeconds));
        const notes: string[] = [];
        if (httpMode && waitSeconds > 0) {
          waitSeconds = 0;
          notes.push('Hinweis: Warten (waitSeconds) ist im HTTP-Modus nicht verfügbar, es wurde nicht gewartet.');
        }
        const until = Date.now() + waitSeconds * 1000;
        while (waitSeconds > 0 && store.unreadCounts(agent).total === 0 && Date.now() < until) {
          await sleep(opts.pollIntervalMs);
        }
        const { messages, remaining } = store.readInbox(agent, num(args.limit));
        lastNotified[agent] = remaining;
        if (fmt(args.format) === 'json') return { messages, remaining, notes };
        const text = messages.length ? formatMessages(messages) : (waitSeconds > 0 ? `Keine neuen Nachrichten (${waitSeconds}s gewartet).` : 'Keine neuen Nachrichten.');
        const tail = remaining ? `\n\n📬 Noch ${remaining} weitere ungelesen. Erneut 'inbox' aufrufen.` : '';
        return [...notes, text].join('\n\n') + tail;
      };

      callbacks['history'] = async (args) => {
        const limit = num(args.limit) ?? opts.historyLimit;
        return formatMessages(store.history(args.channel, limit, args.before || undefined), fmt(args.format));
      };

      callbacks['thread'] = async (args) => formatMessages(store.thread(args.id), fmt(args.format));

      // ---------- registration ----------

      const agentArg = z.string().regex(NAME_RE).describe("Dein eigener Agentenname aus 'register'");
      const replyToArg = z.string().optional().describe("Optional: id der Nachricht, auf die geantwortet wird (nicht auf Broadcasts)");
      const formatArg = z.enum(['text', 'json']).optional().describe("Ausgabeformat, Standard 'text'");
      const channelArg = z.string().describe("Kanal wie 'broadcast', 'topic-<topic>' oder 'direct-<agent>+<agent>'");

      [
        {
          name: 'manual', resource: {}, description: "Bedienungsanleitung für den Agent Chat. Vor der ersten Nutzung lesen.",
          args: {},
        },
        {
          name: 'register', description: "Am Agent Chat anmelden (lokale Kommunikation zwischen Agenten). Lies zuerst 'manual'. Ohne Namen wird eine UUID vergeben. Gibt den Namen zurück, den alle anderen Chat-Tools als 'agent' brauchen.",
          args: {
            name: z.string().regex(NAME_RE).optional().describe("Gewünschter Name, z.B. 'architect' oder 'dev-1'"),
            description: z.string().max(500).optional().describe("Rolle/Aufgabe, für andere Agenten sichtbar"),
          }
        },
        {
          name: 'agents', resource: {}, description: "Listet alle registrierten Chat-Agenten mit Beschreibung, lastSeen und abonnierten Topics.",
          args: {},
        },
        {
          name: 'send', description: "Direktnachricht an einen anderen Agenten.",
          args: {
            agent: agentArg,
            to: z.string().regex(NAME_RE).describe("Name des Empfängers"),
            body: z.string().min(1).describe("Nachrichtentext (Markdown erlaubt), in sich verständlich"),
            replyTo: replyToArg,
          }
        },
        {
          name: 'post', description: "Nachricht in ein Topic schreiben. Abonniert das Topic automatisch.",
          args: {
            agent: agentArg,
            topic: z.string().regex(NAME_RE).describe("Topic-Name, z.B. 'api-design'"),
            body: z.string().min(1).describe("Nachrichtentext (Markdown erlaubt), in sich verständlich"),
            replyTo: replyToArg,
          }
        },
        {
          name: 'broadcast', description: "Nachricht an alle Agenten. Nur für Ankündigungen; Antworten auf Broadcasts sind nicht erlaubt.",
          args: {
            agent: agentArg,
            body: z.string().min(1).describe("Nachrichtentext (Markdown erlaubt)"),
          }
        },
        {
          name: 'subscribe', description: "Topic abonnieren. Beim ersten Abonnieren landen alle bisherigen Posts in der Inbox.",
          args: { agent: agentArg, topic: z.string().regex(NAME_RE).describe("Topic-Name") }
        },
        {
          name: 'unsubscribe', description: "Topic abbestellen (Broadcasts und Direktnachrichten lassen sich nicht abbestellen).",
          args: { agent: agentArg, topic: z.string().regex(NAME_RE).describe("Topic-Name") }
        },
        {
          name: 'topics', resource: {}, description: "Listet alle Topics mit Abonnenten und Anzahl Nachrichten.",
          args: {},
        },
        {
          name: 'inbox', description: "Ungelesene Nachrichten abrufen (Direkt, Broadcasts, abonnierte Topics) und als gelesen markieren. Mit waitSeconds wird bis zu dieser Zeit auf neue Nachrichten gewartet (nur stdio).",
          args: {
            agent: agentArg,
            waitSeconds: z.number().int().min(0).max(opts.maxWaitSeconds).optional().describe(`Bis zu so viele Sekunden auf neue Nachrichten warten (max. ${opts.maxWaitSeconds}, im HTTP-Modus immer 0)`),
            limit: z.number().int().min(1).optional().describe("Maximal so viele Nachrichten liefern"),
            format: formatArg,
          }
        },
        {
          name: 'history', resource: { channel: channelArg }, description: "Verlauf eines Kanals lesen, ohne Lesezeiger zu verändern.",
          args: {
            channel: channelArg,
            limit: z.number().int().min(1).optional().describe(`Nur die letzten n Nachrichten (Standard ${opts.historyLimit})`),
            before: z.string().optional().describe("Nur Nachrichten vor dieser Nachrichten-ID oder diesem ISO-Zeitpunkt"),
            format: formatArg,
          }
        },
        {
          name: 'thread', resource: { id: z.string().describe("Nachrichten-ID") }, description: "Kompletten Thread zu einer Nachrichten-ID lesen.",
          args: { id: z.string().describe("Nachrichten-ID"), format: formatArg },
        },
      ].forEach((item: any) => {
        // Resources only for side-effect free functions (README: "Resources sind nur lesend")
        if (item.resource) registerMCPResource(config, mcp, callbacks, pluginName, { ...item, args: item.resource });
        registerMCPTool(config, mcp, callbacks, pluginName, item);
      });

      // ---------- web view (only reachable in --rainbowroad mode) ----------

      if (express) {
        const base = opts.webPath.replace(/\/$/, '');
        const handle = (fn) => async (req, res) => {
          try {
            res.json(await fn(req));
          } catch (e) {
            res.status(400).json({ error: e.message });
          }
        };

        express.get(base, (req, res) => {
          res.type('html').send(fs.readFileSync(webFile, 'utf8'));
        });
        express.get(base + '/api/agents', handle(() => store.listAgents()));
        express.get(base + '/api/topics', handle(() => store.listTopics()));
        express.get(base + '/api/channels', handle(() => store.listChannels()));
        express.get(base + '/api/messages', handle((req) => store.history(String(req.query.channel ?? 'broadcast'), num(req.query.limit) ?? opts.historyLimit)));
        express.get(base + '/api/thread/:id', handle((req) => store.thread(req.params.id)));
        express.post(base + '/api/messages', handle((req) => {
          const { from = 'human', kind, to, topic, body, replyTo } = req.body ?? {};
          if (!store.listAgents().some(a => a.name === from)) store.register(from, 'Mensch über die Weboberfläche');
          store.touch(from);
          if (kind === 'direct') return store.send(from, to, body, replyTo || undefined);
          if (kind === 'topic') return store.post(from, topic, body, replyTo || undefined);
          if (kind === 'broadcast') return store.broadcast(from, body);
          throw new Error("kind muss 'direct', 'topic' oder 'broadcast' sein");
        }));
      }

      resolve(null);
    } catch (error) {
      reject(error);
    }
  })
};
