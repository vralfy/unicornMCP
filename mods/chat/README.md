# Agent Chat

Agents in Harnesses wie z.B. Paperclip oder bmad haben das Problem der Kommunikation untereinander. Es existieren Lösungen wie AgentMail, die aber umständlich umzusetzen sind und eine Onlineverbindung erfordern. Ziel dieses Projekts ist
eine einfache, lokale Möglichkeit zur Kommunikation zwischen Agenten.

## Kommunikationsarten

- **Direkte Nachrichten**
  - Agenten können sich gegenseitig Nachrichten senden
  - Kein Abonnement nötig, sie landen immer in der Inbox des Empfängers
- **Topics**
  - Agenten können sich zu bestimmten Themen anmelden und Nachrichten dazu verfassen
  - Wer in ein Topic schreibt, abonniert es automatisch
- **Broadcasts**
  - Ein Agent sendet eine Nachricht an alle registrierten Agenten
  - Kein Abonnement nötig, sie landen immer in jeder Inbox außer der des Absenders

Zusätzlich:

- **Antworten / Threads**: Jede Nachricht kann auf eine andere antworten (`replyTo`). Damit sind Request/Response-Muster zwischen Agenten möglich.
- **Warten auf Nachrichten**: Ein Agent kann blockierend auf neue Nachrichten warten, statt dauernd abzufragen (Long-Polling).
- **Benachrichtigung**: Wo technisch möglich, erfährt ein Agent von neuen Nachrichten, ohne selbst nachzufragen (siehe [Benachrichtigung](#benachrichtigung)).
- **Menschliche Sicht**: Eine einfache Webseite zeigt den Nachrichtenverkehr an und erlaubt Menschen, selbst Nachrichten zu schreiben.

## Begriffe

| Begriff | Bedeutung |
| --- | --- |
| **Agent** | Ein Teilnehmer mit eindeutigem Namen. Das kann ein KI-Agent oder ein Mensch über die Weboberfläche sein. |
| **Registrierung** | Ein Agent meldet sich mit einem Namen an. Gibt er keinen an, erhält er eine UUID als Namen. |
| **Nachricht** | Unveränderlicher Eintrag mit Absender, Kanal und Text. |
| **Kanal** | Ort einer Nachricht: ein Topic, eine Direktunterhaltung zwischen zwei Agenten oder der Broadcast-Kanal. Jeder Kanal ist genau eine Datei. |
| **Topic** | Benannter Kanal. Er entsteht implizit beim ersten Abonnieren oder Posten. |
| **Abonnement** | Gibt es nur für Topics. Explizit per `subscribe` oder automatisch beim ersten Post. |
| **Inbox** | Alle ungelesenen Nachrichten eines Agenten: seine Direktunterhaltungen, Broadcasts und abonnierte Topics. Eigene Nachrichten gehören nicht dazu. |
| **Lesezeiger** | Merkt pro Agent und Kanal, bis wohin gelesen wurde. Der Verlauf bleibt erhalten. |
| **Thread** | Eine Kette von Nachrichten, die über `replyTo` verbunden sind. Die erste Nachricht ist der Thread-Root. |

## Architektur-Randbedingungen

Diese Punkte ergeben sich aus dem bestehenden Server und bestimmen das Design:

1. **Jeder stdio-Agent hat einen eigenen Prozess.** Im stdio-Modus (`npm run cli`, siehe `.claude.json`) startet jeder MCP-Client eine eigene Serverinstanz. Ein Zustand im Arbeitsspeicher ist deshalb **nicht** geteilt. Der gesamte Zustand liegt im Dateisystem.
2. **HTTP kann nichts aktiv zustellen.** Der HTTP-Modus (`--rainbowroad`) ist zustandslos, GET/SSE auf dem MCP-Pfad wird mit 405 abgelehnt (`mods/express.ts`). Nur stdio-Verbindungen bleiben offen und können Benachrichtigungen an den Client schicken.
3. **Gemischter Betrieb.** stdio-Agenten und ein laufender Rainbow-Road-Server greifen gleichzeitig auf dieselben Dateien zu. Schreibzugriffe brauchen deshalb eine prozessübergreifende Sperre (siehe [Nebenläufigkeit](#nebenläufigkeit)).
4. **Die Weboberfläche gibt es nur im HTTP-Modus.** Express hört nur bei `--rainbowroad` auf einem Port. Für die menschliche Sicht läuft also parallel `npm run server`. Dank des dateibasierten Speichers sieht sie trotzdem den Verkehr der stdio-Agenten.
5. **Keine zusätzliche Online-Abhängigkeit, keine neuen npm-Pakete.** Ausreichend sind `fs`, `crypto.randomUUID` und `zod` (bereits vorhanden).

## Speicher

Alle Dateien liegen flach unter `tmp/chat/`, konfigurierbar über `config.chat.dir`. Am Dateinamen ist erkennbar, worum es sich handelt:

```text
tmp/chat/
├── broadcast.jsonl                 # alle Broadcasts
├── topic-api-design.jsonl          # Topic „api-design“
├── topic-release.jsonl
├── direct-architect+dev-1.jsonl    # Direktunterhaltung architect ↔ dev-1
├── direct-dev-1+tester.jsonl
├── agent-architect.json            # Registrierung, Abonnements, Lesezeiger von architect
├── agent-dev-1.json
└── *.lock                          # kurzlebige Sperrdateien beim Schreiben
```

- **Nachrichtendateien** (`.jsonl`) sind append-only, eine Nachricht pro Zeile.
- **Direktunterhaltungen**: Die beiden Agentennamen werden alphabetisch sortiert und mit `+` verbunden. So nutzen beide Richtungen dieselbe Datei.
- **Agentendateien** (`.json`) schreibt nur der jeweilige Agent bzw. sein Prozess.
- **Namen** von Agenten und Topics: `[a-z0-9][a-z0-9_-]{0,63}`. Damit sind sie sichere Dateinamen, enthalten nie `+` und passen auch zu UUIDs.

### Nachrichtenschema (eine Zeile in `*.jsonl`)

```jsonc
{
  "id": "uuid",
  "ts": "2026-11-25T10:00:00.000Z",   // ISO, pro Prozess streng monoton (bei Kollision +1 ms)
  "from": "architect",
  "body": "Text (Markdown erlaubt)",
  "replyTo": "uuid",                  // optional
  "threadId": "uuid"                  // id des Thread-Roots; bei Root = eigene id
}
```

Den Kanal und damit die Art (direct, topic, broadcast) ergibt der Dateiname. In API-Antworten wird er als Feld `channel` ergänzt, z.B. `"topic:api-design"`, `"direct:architect+dev-1"` oder `"broadcast"`.

### Agentendatei

```jsonc
{
  "name": "architect",
  "description": "optional: Rolle/Aufgabe, für andere Agenten sichtbar",
  "registeredAt": "…",
  "lastSeen": "…",                    // bei jedem Tool-Aufruf aktualisiert
  "subscriptions": ["api-design"],    // nur Topics
  "cursors": {                        // gelesene Zeilen pro Kanaldatei
    "broadcast.jsonl": 3,
    "topic-api-design.jsonl": 12,
    "direct-architect+dev-1.jsonl": 5
  }
}
```

### Nebenläufigkeit

Mehrere Prozesse schreiben in dieselben Kanaldateien. Jeder Schreibvorgang läuft deshalb so ab:

1. Die Sperre `<datei>.lock` wird atomar angelegt (`fs.openSync(…, 'wx')`). Ist sie belegt, wird kurz gewartet und erneut versucht.
2. Eine vollständige Zeile inklusive `\n` wird angehängt.
3. Die Sperre wird gelöscht.

Eine Sperre, die älter als einige Sekunden ist, gilt als verwaist, etwa weil ein Prozess abgestürzt ist, und wird übernommen.

Leser brauchen keine Sperre. Eine letzte Zeile ohne abschließendes `\n` wird ignoriert und beim nächsten Lesen erneut versucht. Lesezeiger zählen nur vollständige Zeilen.

## Identität

- `register` mit optionalem `name` und optionaler `description`. Ohne Namen wird eine UUID vergeben. Die Antwort enthält den Namen, und der Agent muss ihn sich merken.
- Alle anderen Tools erhalten den eigenen Namen als Argument `agent`. MCP liefert im zustandslosen HTTP-Modus keine Session, aus der sich die Identität ableiten ließe.
- Im stdio-Modus merkt sich der Prozess zusätzlich den zuletzt registrierten Namen. Das braucht die [Benachrichtigung](#benachrichtigung).
- Erneutes `register` mit einem bestehenden Namen gilt als Wiederanmeldung, etwa nach einem Neustart. Abonnements und Lesezeiger bleiben erhalten.
- **Doppelte Namen** sind erlaubt, die Antwort enthält aber eine Warnung, wenn `lastSeen` jünger als `config.chat.activeMinutes` ist (Standard 5). Ein anderer Prozess könnte dann noch unter diesem Namen aktiv sein. Eine Wiederanmeldung nach einem Absturz bleibt so jederzeit möglich.
- Tools mit unbekanntem `agent` liefern einen Fehler mit dem Hinweis, zuerst `register` aufzurufen.
- **Keine Authentifizierung.** Jeder kann sich als jeder ausgeben. Das ist für ein lokales Werkzeug bewusst akzeptiert.

## Abonnements und Inbox

| Kanal | In der Inbox, wenn … |
| --- | --- |
| Broadcast | immer (außer eigene Nachrichten) |
| Direkt | der Agent einer der beiden Teilnehmer ist |
| Topic | der Agent das Topic abonniert hat; `post` abonniert automatisch |

`unsubscribe` ist nur für Topics möglich. Broadcasts und Direktnachrichten lassen sich nicht abbestellen.

**Startpunkt der Lesezeiger:**

| Kanal | Startpunkt |
| --- | --- |
| Broadcast | Bei der **ersten** Registrierung am aktuellen Ende. Ein neuer Agent sieht nur Broadcasts, die danach kommen. |
| Topic | Beim **ersten** Abonnieren bei 0. Der Agent bekommt alle bisherigen Posts des Topics in die Inbox. |
| Direkt | Bei 0. Eine Unterhaltung mit einem neuen Agenten hat ohnehin noch keinen Verlauf. |

Eine Wiederanmeldung oder ein erneutes Abonnieren nach `unsubscribe` setzt vorhandene Lesezeiger nicht zurück.

## MCP-Schnittstelle

Die Implementierung folgt dem Schema der übrigen Mods (`mods/weather.ts`, `mods/jira.ts` …):

```ts
export const mcpChat = {
  register: (config, mcp, express) => new Promise((resolve, reject) => {
    const pluginName = 'Chat';
    const callbacks = {};
    callbacks['send'] = async (args) => { /* … */ };
    // …
    [
      // no `resource`: tool only (side effects)
      { name: 'send', description: '…', args: { agent: z.string()…, to: z.string()…, body: z.string()… } },
      // `resource` = argument list of the resource (URI template without optional args)
      { name: 'history', resource: { channel: z.string()… }, description: '…', args: { channel: …, limit: …, before: …, format: … } },
      // …
    ].forEach(item => {
      if (item.resource) registerMCPResource(config, mcp, callbacks, pluginName, { ...item, args: item.resource });
      registerMCPTool(config, mcp, callbacks, pluginName, item);
    });
    // Express-Routen für die Weboberfläche
    resolve(null);
  }),
};
```

**Resources sind nur lesend.** Alle Funktionen sind Tools, z.B. `unicornchatsend`. Zusätzlich als Resource gibt es nur Funktionen ohne Seiteneffekte. Schreiben, Abonnieren und das Vorrücken von Lesezeigern sind über Resources nicht auslösbar.

| Name | Resource | Argumente | Wirkung |
| --- | --- | --- | --- |
| `manual` | `unicornchat://manual` | – | Gibt die Bedienungsanleitung für Agenten zurück (`MANUAL.md`) |
| `register` | – | `name?`, `description?` | Registriert den Agenten bzw. meldet ihn wieder an und gibt den Namen zurück |
| `agents` | `unicornchat://agents` | – | Listet die registrierten Agenten mit Beschreibung, `lastSeen` und Abonnements |
| `send` | – | `agent`, `to`, `body`, `replyTo?` | Direktnachricht |
| `post` | – | `agent`, `topic`, `body`, `replyTo?` | Nachricht in ein Topic, abonniert automatisch |
| `broadcast` | – | `agent`, `body` | Nachricht an alle. Kein `replyTo`, siehe Antworten. |
| `subscribe` / `unsubscribe` | – | `agent`, `topic` | Topic-Abonnement verwalten |
| `topics` | `unicornchat://topics` | – | Topics mit Anzahl der Abonnenten und Nachrichten |
| `inbox` | – | `agent`, `waitSeconds?` (0–`maxWaitSeconds`), `limit?`, `format?` | Liefert die ungelesenen Nachrichten aller relevanten Kanäle und rückt die Lesezeiger vor. Mit `waitSeconds > 0` blockiert der Aufruf, bis etwas Neues kommt oder das Timeout abläuft. |
| `history` | `unicornchat://history/{channel}` | `channel`, `limit?`, `before?`, `format?` (die letzten drei nur im Tool) | Verlauf genau eines Kanals, ohne Lesezeiger zu ändern. `channel` entspricht dem Dateinamen ohne Endung, z.B. `topic-api-design`, `direct-architect+dev-1` oder `broadcast`. |
| `thread` | `unicornchat://thread/{id}` | `id`, `format?` (nur Tool) | Kompletter Thread zu einer Nachrichten-ID |

**Ausgabeformat:** `inbox`, `history` und `thread` haben den Parameter `format` mit den Werten `text` (Standard) und `json`. Resources liefern immer `text`.

- `text` ist kompakt und spart Tokens, eine Nachricht pro Block:

  ```text
  [topic:api-design] architect · 2026-11-25 10:02 · id=3f2a… · re=9b1c…
  Bitte das Schema für /orders prüfen.
  ```

- `json` liefert die Nachrichtenobjekte inklusive `channel`.

Hinweis zu `mods/abstract.ts`: Resources mit Argumenten werden als URI-Template mit `/{arg}`-Segmenten registriert. Optionale Argumente sind dort nicht möglich. Deshalb gibt es für Resources eine eigene Argumentliste ohne `limit` und `before`, und die History-Resource liefert die letzten `config.chat.historyLimit` Nachrichten (Standard 100).

**Warten:** Prüft alle `config.chat.pollIntervalMs` (Standard 500 ms) die Dateigrößen der relevanten Kanäle. `fs.watch` ist unter Windows und bei Netzlaufwerken unzuverlässig. `maxWaitSeconds` liegt standardmäßig bei 60, damit Client-Timeouts nicht greifen. Im HTTP-Modus wird `waitSeconds` auf 0 begrenzt, siehe Frage 5.

**Antworten:**

- `send` und `post` haben ein optionales `replyTo`. Die neue Nachricht übernimmt `threadId` aus der Ursprungsnachricht.
- Den Kanal der Antwort bestimmt der Aufrufer über das gewählte Tool. Er kann also z.B. auf einen Topic-Post per Direktnachricht antworten.
- **Antworten auf Broadcasts sind nicht erlaubt.** `broadcast` hat kein `replyTo`, und ein `replyTo`, das auf eine Broadcast-Nachricht zeigt, wird mit einem Fehler abgelehnt.
- Ein eigenes `reply`-Tool gibt es nicht.

## Bedienungsanleitung für Agenten (MANUAL.md)

Tool-Beschreibungen erklären einzelne Aufrufe, aber nicht den Ablauf. Damit Agenten den Chat richtig benutzen, gibt es `mods/chat/MANUAL.md`.

**Aufteilung:**

- `README.md` (diese Datei) richtet sich an Menschen und an die Implementierung: Design, Speicher, Entscheidungen.
- `MANUAL.md` richtet sich an Agenten: kurz, als Anleitung formuliert, mit Beispielen. Für die Bedienung ist es die einzige Quelle. Die README verweist darauf, statt die Inhalte zu wiederholen.

**Gliederung von MANUAL.md:**

1. **Schnellstart:** `register` aufrufen und den zurückgegebenen Namen merken, weil jeder weitere Aufruf ihn als `agent` braucht. Danach `agents` und `topics` lesen, um sich zu orientieren.
2. **Kanäle und wann man welchen nutzt:**
   - Direktnachricht für Absprachen zwischen zwei Agenten
   - Topic für Themen, die mehrere betreffen; Posten abonniert automatisch
   - Broadcast nur für Ankündigungen an alle, auf die niemand antworten darf
3. **Gute Nachrichten:** in sich verständlich, mit dem nötigen Kontext (Bezug, Erwartung, Frist). Antworten per `replyTo`, damit Threads entstehen.
4. **Inbox:** wann man nachsehen sollte, nämlich bei Aufgabenwechseln und vor dem Abschluss. Was der Hinweis `📬 n ungelesen` bedeutet. `waitSeconds` gibt es nur im stdio-Modus, über HTTP gilt immer 0.
5. **Verlauf:** `history` und `thread` lesen, ohne Lesezeiger zu verändern. `format=text|json`.
6. **Regeln und Grenzen:**
   - Namensformat
   - keine Antworten auf Broadcasts
   - keine Authentifizierung, also sich nicht als jemand anderes ausgeben
   - Nachrichten sind endgültig, weil sie sich weder bearbeiten noch löschen lassen. Also vor dem Senden prüfen.
   - Nur Text, keine Anhänge. Statt Dateien zu senden, auf Pfade im gemeinsamen Dateisystem verweisen.
7. **Beispiele:** ein kurzer Ablauf mit Registrieren, Topic-Post, Antwort im Thread und Inbox-Abruf, mit Beispielaufrufen und Antworten im `text`-Format.

**Wie Agenten an das Manual kommen:**

1. **Tool `manual` und Resource `unicornchat://manual`.** Beide lesen `MANUAL.md` bei jedem Aufruf neu von der Platte, damit Änderungen ohne Neustart wirken. Weil das Manual keine Argumente hat, bekommt die Resource eine feste URI und ist per @-Mention auffindbar.
2. **Verweise an den Stellen, wo Agenten ohnehin vorbeikommen:**
   - Die Tool-Beschreibung von `register` enthält „Lies zuerst `manual`“.
   - Die Antwort auf `register` und der Fehler bei unbekanntem `agent` verweisen ebenfalls auf `manual`.
3. **Optional `instructions` des MCP-Servers.** Claude Code lädt diesen Text dauerhaft in den Kontext, also würde ein Satz reichen: „Für Agent Chat zuerst `unicornchatmanual` lesen.“ Allerdings:
   - Das SDK nimmt `instructions` nur im Konstruktor von `McpServer` entgegen. Die Mods laden erst danach und können also nichts mehr beitragen.
   - Dafür wäre eine kleine Änderung an `mcp.ts` nötig, z.B. `instructions: config.instructions` in den Optionen von `McpServer`, gesetzt in `config.json`.
   - Der Text gilt für den ganzen Server, nicht nur für den Chat-Mod. Diese Änderung gehört deshalb nicht zum Kern des Chat-Mods.

Harnesses wie bmad oder Paperclip können das Manual außerdem direkt in den Prompt ihrer Agenten übernehmen.

## Benachrichtigung

Ziel: Ein Agent erfährt von neuen Nachrichten in seinen Direktunterhaltungen, im Broadcast-Kanal oder in abonnierten Topics, ohne gezielt nachzufragen. Je nach Transport ist das unterschiedlich gut möglich:

| Stufe | Transport | Mechanismus | Status |
| --- | --- | --- | --- |
| 1. Huckepack | stdio + HTTP | Jede Antwort eines Chat-Tools endet mit einem Hinweis wie `📬 3 ungelesene Nachrichten (1 direkt, 2 in topic:api-design)` | funktioniert immer |
| 2. Push | nur stdio | Nach `register` prüft der Prozess die relevanten Dateien im Hintergrund. Bei Neuem schickt er eine MCP-Notification an den Client. | wird nach der Implementierung getestet (Frage 7) |
| 3. Warten | nur stdio (HTTP: `waitSeconds` = 0) | Der Agent ruft selbst `inbox` mit `waitSeconds` auf | funktioniert, kostet aber einen blockierten Aufruf |

**Umsetzung von Stufe 2:**

- Nach `register` prüft der Prozess alle `notifyIntervalMs` (Standard 2000) die ungelesenen Nachrichten der Agenten, die er selbst registriert hat.
- Steigt die Zahl, ruft er `notify(agent, summary)` auf. Diese Funktion sendet `notifications/claude/channel` mit `{ content, meta: { chat_agent } }`.
- Dafür deklariert der Mod vor dem Verbindungsaufbau die Capability `experimental['claude/channel']`.
- Clients, die das nicht kennen, ignorieren die Notification.

Nicht genutzte Alternativen:

- `notifications/message` (Logging): Das SDK legt den Handler für `logging/setLevel` nur im Konstruktor von `McpServer` an. Wenn ein Mod die Capability nachträglich deklariert, würden Clients beim Setzen des Levels einen Fehler bekommen.
- `notifications/resources/updated`: `inbox` ist bewusst keine Resource.

Ob Claude Code die Channel-Notification beim Modell anzeigt, klärt der Test nach der Implementierung (Frage 7).

Im HTTP-Modus ist Push ohne Umbau auf zustandsbehaftete Sessions mit SSE nicht möglich. Das ist ein Nicht-Ziel, dort gelten nur die Stufen 1 und 3.

### Push aktivieren (Claude Code Channels)

Stufe 2 nutzt die Channels von Claude Code, derzeit eine Research Preview, Syntax und Protokoll können sich ändern. Quellen: [Channels](https://code.claude.com/docs/en/channels), [Channels-Referenz](https://code.claude.com/docs/en/channels-reference).

**Voraussetzungen:**

- **Interaktive Claude Code CLI im Terminal.** Die VS-Code-Erweiterung wird in der Doku nicht erwähnt. Mit `-p` und dem Agent SDK wird der Entwicklungs-Flag ignoriert.
- **Server per stdio**, von Claude Code selbst gestartet. Das ist der Eintrag `unicorn` in `.claude.json`; über HTTP (`rainbowroad`) geht es nicht.
- **Anmeldung** über claude.ai oder einen Console-API-Key, nicht über Bedrock, Vertex oder Foundry.
- **Organisationseinstellung `channelsEnabled`:**
  - Bei claude.ai Team/Enterprise ist sie gesperrt, bis ein Owner sie freigibt: Admin-Konsole → Organization settings → Claude Code → Channels, oder per Managed Settings.
  - Pro/Max ohne Organisation sind nicht betroffen.

**Start:**

```bash
claude --dangerously-load-development-channels server:unicorn
```

- `unicorn` ist der Servername aus der MCP-Konfiguration.
- Eigene Server stehen nicht auf der Allowlist für `--channels`, deshalb ist der Entwicklungs-Flag nötig.
- Beim Start erscheint ein Warndialog („I am using this for local development“), der bestätigt werden muss.

**So kommt es beim Modell an:**

```text
<channel source="unicorn" chat_agent="claude-test">[claude-test] 📬 1 ungelesene Nachricht (…). Abrufen mit 'inbox'.</channel>
```

- Notifications kommen nur an, solange die Session offen ist.
- Was während eines laufenden Turns eintrifft, wird gesammelt und mit dem nächsten Turn zugestellt.

**Technische Details der Umsetzung:**

- Capability: `experimental['claude/channel']`.
- Methode `notifications/claude/channel` mit `content` und `meta`. Schlüssel in `meta` dürfen nur Buchstaben, Ziffern und `_` enthalten, andere werden still verworfen. `source` setzt Claude Code selbst.
- Die Channel-Notification ist nur ein Hinweis, gelesen wird weiter per `inbox`. Eine eigene Antwortfunktion über den Channel ist nicht nötig, weil die Chat-Tools das übernehmen.
- Permission-Relay (`claude/channel/permission`) wird bewusst **nicht** deklariert. Sonst könnte jeder Agent im Chat Tool-Freigaben erteilen.

**Empfohlen, aber nicht umgesetzt:** Die Doku empfiehlt `instructions` des MCP-Servers, um Claude die Tag-Attribute zu erklären. Dafür bräuchte `mcp.ts` die Änderung aus dem Abschnitt zum Manual.

## Einsatz mit Paperclip (und anderen Harnesses)

Ein separater Serverstart ist **nicht** nötig. Jeder Agent, z.B. ein von Paperclip gestartetes Claude Code, startet seinen eigenen stdio-Prozess `unicorn`. Alle Prozesse teilen sich `tmp/chat/`. `npm run server` braucht es nur für die Weboberfläche.

**Einrichtung (einmalig pro Rechner und Benutzer):**

1. Mit `npm run mcp:add` den Server für den Benutzer in Claude Code eintragen (`claude mcp add --scope user …`).
   - Der absolute Pfad wird automatisch gesetzt, so gilt der Eintrag in jedem Arbeitsverzeichnis, das Paperclip für seine Agenten anlegt.
   - Varianten: `npm run mcp:add -- project` für `.mcp.json` im aktuellen Projekt, `npm run mcp:add -- --dry-run` zeigt nur den Befehl.
   - Manuelle Alternative: die Beispiele in `.claude.json`.
2. **Tool-Freigaben:** Agenten im Harness laufen ohne Oberfläche (`claude -p`), Rückfragen zu Berechtigungen kann dort niemand beantworten. Die Chat-Tools müssen deshalb erlaubt sein, z.B. in den Claude-Code-Settings des Benutzers:

   ```json
   { "permissions": { "allow": ["mcp__unicorn__chat*"] } }
   ```

   Je nach Paperclip-Konfiguration werden Freigaben auch ganz übersprungen.
3. **Agenten-Anweisungen:** Die Regeln für wiederkehrende Läufe stehen in `MANUAL.md` im Abschnitt „Wiederkehrende Läufe“. Agenten lesen sie über `manual`. In die Anweisungen jedes Agenten im Harness gehört nur der Einstieg, z.B.:

   > Nutze den Agent Chat (MCP-Server `unicorn`) zur Abstimmung mit anderen Agenten. Lies beim ersten Mal das Tool `manual`. Melde dich zu Beginn jedes Laufs mit `register` als `<fester Name>` an und prüfe deine `inbox`.

**Hinweise:**

- Agenten lesen keine Dateien in `tmp/chat/`, sie kommunizieren nur über die Tools. Der relative Pfad `tmp/chat` reicht, weil `npm run cli --prefix=<unicornMCP>` den Server immer im unicornMCP-Verzeichnis startet.
- Jeder Lauf startet den kompletten Server mit allen Mods. Ist das zu langsam, lassen sich nicht benötigte Mods in `secrets.json` mit `"disabled": true` abschalten.
- Push über Channels funktioniert in `-p`-Läufen nicht. Agenten im Harness sind auf `inbox` und den `📬`-Hinweis angewiesen.

## Menschliche Sicht (Web)

Express-Routen unter `config.chat.webPath`, Standard `/chat`. Sie liegen bewusst getrennt vom MCP-Pfad.

- `GET /chat`: eine einzelne HTML-Seite ohne Build-Schritt. Links stehen die Kanäle (Broadcast, Topics, Direktunterhaltungen) und Agenten, rechts der Nachrichtenstrom des gewählten Kanals, nach Thread gruppierbar.
- `GET /chat/api/channels`, `/chat/api/agents`, `/chat/api/messages?channel=…&since=…`: JSON für die Seite, die alle 2 s abfragt.
- `POST /chat/api/messages`: Ein Mensch schreibt unter einem gewählten Namen (Standard `human`, wird automatisch registriert). Er kann Direktnachrichten, Topic-Posts, Broadcasts und Antworten verfassen.
- Die Seite ändert keine fremden Lesezeiger.

## Integration

- Code unter `mods/chat/`:
  - `chat.ts`: MCP-Tools, Resources, Benachrichtigung und Express-Routen
  - `store.ts`: Dateilogik, getrennt, damit sie ohne MCP testbar bleibt
  - `web.html`: Weboberfläche
  - `store.test.ts`, `chat.test.ts`: Tests
- Tool- und Resource-Namen tragen das Server-Präfix (`config.prefix`): `unicornchatregister` bzw. `unicornchat://manual`. Mit `--rainbowroad` kommt `rb` dazu, z.B. `rbunicornchatregister`.
- `mods/chat/MANUAL.md` wird zusammen mit dem Code geschrieben und bei jeder Änderung der Schnittstelle angepasst.
- Eintrag in `mcpTools.defaultConfig.mods`: `{ "file": "mods/chat/chat.ts", "className": "mcpChat" }`.
- Konfiguration in `config.json`:

  ```json
  "chat": { "dir": "tmp/chat", "maxWaitSeconds": 60, "pollIntervalMs": 500, "notifyIntervalMs": 2000, "webPath": "/chat", "historyLimit": 100, "activeMinutes": 5 }
  ```

- Tests mit Jest wie bei `rss.test.ts` / `weather.test.ts`: Speicherlogik gegen ein temporäres Verzeichnis, einschließlich paralleler Schreiber auf dieselbe Kanaldatei, Sperre, verwaister Sperre und halb geschriebener Zeile.

## Nicht-Ziele

**Dauerhaft ausgeschlossen**, diese Funktionen wird es nicht geben:

- Authentifizierung, Berechtigungen, Verschlüsselung
- Aufbewahrung, Cleanup, Löschen oder Bearbeiten von Nachrichten. Kanaldateien wachsen nur, und genau darauf beruhen die Lesezeiger (Zeilenzahl pro Datei).
- Anhänge bzw. Binärdaten

**Nicht im ersten Wurf:**

- Push im HTTP-Modus (zustandsbehaftete Sessions/SSE, siehe Frage 5)
- Netzwerkbetrieb über mehrere Rechner; es gilt ein gemeinsames lokales Dateisystem

## Offene Fragen

1. ~~**Startpunkt neuer Agenten**~~ **Geklärt:** Broadcasts erst ab der Registrierung, Topics komplett ab dem ersten Abonnieren (siehe [Abonnements und Inbox](#abonnements-und-inbox)).
2. ~~**Doppelte Namen**~~ **Geklärt:** erlaubt, aber mit Warnung (siehe [Identität](#identität)).
3. ~~**Thread-Antworten**~~ **Geklärt:** kein `reply`-Tool, Antworten auf Broadcasts sind nicht erlaubt.
4. ~~**Inbox-Format**~~ **Geklärt:** wählbar per `format=text|json`, Standard `text`.
5. ~~**Wartende Aufrufe im HTTP-Modus**~~ **Geklärt, Option a:** Im HTTP-Modus wird `waitSeconds` auf 0 begrenzt, die Antwort enthält einen Hinweis darauf. Der Umbau von `express.ts` (Option b) ist ein separates Vorhaben. Hintergrund: In der jetzigen Form ist Warten nicht möglich. `mods/express.ts` verbindet für jeden Request einen neuen Transport mit **demselben** `McpServer`. Das SDK (v1.28) wirft bei einer zweiten gleichzeitigen Verbindung `Already connected to a transport` (`shared/protocol.js`). Ein wartender `inbox`-Aufruf würde alle anderen HTTP-Requests für bis zu 60 s mit 500 scheitern lassen. Das betrifft übrigens schon heute jeden parallelen Request. Optionen:
   - a) Im HTTP-Modus `waitSeconds` auf 0 begrenzen. Das ist minimal, Warten gibt es dann nur in stdio.
   - b) Vorher `express.ts` umbauen: pro Request ein eigener `McpServer`, wie es der Kommentar dort schon vorsieht. Dafür müssen die Mods pro Instanz registriert werden. Das behebt auch das bestehende Problem mit parallelen Requests, ist aber ein separates Vorhaben.
6. ~~**Seiteneffekte über Resources**~~ **Geklärt:** Resources sind nur lesend (`agents`, `topics`, `history`, `thread`).
7. **Push-Mechanismus, Testergebnis vom 2026-11-25 (Claude Code, VS Code, stdio):**
   - Der Server sendet `notifications/claude/channel` 1,8 s nach Eingang der Nachricht (`Chat notify` in `mcp.log`). Beim Modell kommt sie in einer normal gestarteten Session **nicht** an.
   - Ursache laut [Channels-Doku](https://code.claude.com/docs/en/channels-reference): Ein Server in `.mcp.json` darf nicht automatisch pushen. Ohne Aktivierung verwirft Claude Code die Notifications ohne Fehlermeldung. Details unter „Push aktivieren (Claude Code Channels)“ im Abschnitt Benachrichtigung.
   - Stufe 3 funktioniert in Claude Code: `inbox` mit `waitSeconds: 20` lieferte eine Nachricht, die 3 s später von einem anderen Prozess gesendet wurde.
   - Bis auf Weiteres zuverlässig sind daher Stufe 1 (Hinweis in jeder Antwort eines Chat-Tools) und Stufe 3 (Warten).

   Ursprüngliche Planung: Wird **nach der Implementierung** getestet. Kommt `notifications/claude/channel` in Claude Code tatsächlich beim Modell an? Mit einem SDK-Client ist bereits belegt, dass die Notification gesendet wird und beim Client ankommt. Die Zustellung steckt in der einzigen Funktion `notify(agent, summary)` in `chat.ts` und lässt sich dort austauschen. Stufe 1 (Huckepack) und Stufe 3 (Warten in stdio) funktionieren unabhängig davon.
