# The tutor

`f-tutor`. An AI tutor on the synth page that explains the sound on the panel, proposes changes
the learner applies, and designs new sounds with their lesson (D6, plan §8). The prototype's tutor
(`prototype/src/ui/Tutor.jsx`) called Claude through `window.claude` and asked for JSON in the
reply. Here it runs through Sunrise's orchestration. **The model proposes, the server validates,
and the learner applies. The model never writes to the panel.**

t-53 built the agent, its tools and its context; t-54 the stream route and the daily allowance;
t-55 the place a designed sound keeps its lesson once saved ([`sounds.md`](./sounds.md), _A
sound's lesson_); t-56 the tutor panel on the synth page ([below](#the-panel)). `f-tutor-knowledge`
grounds it: t-57 the databank search ([`bank.md`](./bank.md#searching)) and its tool, t-58 its
meaning-based layer, t-59 web search through Brave ([below](#web-search)).

## Anti-patterns first

- **Don't make the tutor `public` or `invite_only`.** Sunrise's generic `POST /api/v1/chat/stream`
  serves both to any signed-in user, with no daily allowance, so it would be a way round the app's
  route and its limit (BeatBreaker found this in Phase 8). The definition leaves visibility to the
  platform baseline, `internal`, and `tests/unit/lib/app/tutor/chat-route.test.ts` runs that route
  against the tutor's row.
- **Don't give a tool a user.** No tool takes a user id in its arguments (every schema is
  `.strict()`, so an extra `userId` is refused), and none reads `CapabilityContext.userId` but
  `web_search`, which reads the caller's daily allowance and nothing else about them, because each
  search counts against it. A panel is the same whoever sent it. `tools.test.ts` holds every
  registered tutor tool to both, and names the one exception.
- **Don't let a tool write.** The panel tools read and propose, `search_databank` reads the
  databank and `web_search` asks Brave. A tool that changed stored state
  would need BeatBuddy's workspace row and its retry-on-conflict; these need neither, and two
  proposals in one model step are both worked out against the panel that was sent.
- **Don't repair a proposal.** `sanitizeSet` / `sanitizePreset` clamp and drop what they do not
  like, which was right for the prototype's JSON. The tools refuse instead, with a message that
  names the bad id or value, so nothing half-right reaches the page and the model can correct it.
  Use `validate.ts`; don't write another checker.
- **Don't put a synth's controls in the prompt.** The tool loop sends the system prompt again on
  every iteration. `describe_synth` is a lookup for every synth (below).
- **Don't trust `entityContext`.** As far as the dispatcher knows it is a free-form record. Every
  tool reads it through `readPanel()` (`lib/app/tutor/panel.ts`), which parses it, finds the
  definition, refuses another definition version and runs `validateSound`.
- **Don't take the agent, the context or the version from the client.** The stream route's body is
  the synth, the panel, the message and a conversation id, and nothing else reaches `streamChat()`
  from it (extra keys are stripped). The route pins the tutor, takes the user from the session, and
  builds `contextId` and `entityContext` from the synth it checked, at that synth's current
  definition version, so the prompt and the tools are about the same synth.
- **Don't call the section limiters from the route.** `proxy.ts` applies the `api` section cap. The
  route's own caps are the chat sub-caps the consumer chat route uses, so switching surfaces buys no
  extra turns.
- **Don't start a conversation on every visit.** An admin's `maxConversationsPerUser` counts each
  one, and a learner cannot archive a tutor conversation (the consumer routes do not serve an
  internal agent), so a panel that started afresh would lock them out at the cap. The panel carries
  on the synth's latest ([below](#which-conversation)).
- **Don't retry a failed turn.** A turn counts once its message is saved, even when the provider then
  fails ([The allowance](#the-allowance)). The panel sends a turn again only when the route refused
  it before saving anything, and only once.
- **Don't apply a proposal to a panel it was not made for.** It was worked out against the panel the
  turn sent; on any other it would silently undo what the learner did since. The chip offers Apply
  only while the panel is still that one.
- **Don't edit the instructions in the admin and expect them to stay.** The tutor is a platform
  agent: its instructions, tools and visibility are the code's and are written back after every
  deploy, and the admin's API refuses an edit to them. Provider, model and spend are the admin's.

## Where things are

| Piece                      | Location                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The stream route           | `app/api/v1/tutor/stream/route.ts`, its body `lib/app/tutor/request.ts`                                                          |
| The conversation to resume | `app/api/v1/tutor/conversation/route.ts`, read by `lib/app/tutor/conversation.ts`                                                |
| The tutor panel            | `components/app/tutor/tutor-panel.tsx`, its turn `use-tutor-chat.ts`, its rules for tool results `apply.ts`                      |
| The allowance              | `lib/app/tutor/allowance.ts`, read by `app/api/v1/tutor/allowance/route.ts`; `TUTOR_DAILY_TURNS` in `lib/app/env.ts`             |
| The agent's definition     | `lib/app/tutor/agent.ts` (`TUTOR_AGENT`, slug `synth-tutor`)                                                                     |
| The tools                  | `lib/app/tutor/{get-panel,describe-synth,propose-panel-change,design-sound,search-databank,web-search}.ts`, listed in `tools.ts` |
| Web search                 | `lib/app/tutor/web-search.ts`; `BRAVE_SEARCH_API_KEY` in `lib/app/env.ts`                                                        |
| An answer's sources        | `lib/app/tutor/sources.ts` (read from the searches' results), shown by `components/app/tutor/sources.tsx`                        |
| The databank search        | `lib/app/bank/search.ts`, also served by `app/api/v1/bank/search/route.ts`                                                       |
| Its meaning-based layer    | `lib/app/bank/knowledge.ts`; the job in `lib/app/jobs.ts`; `npm run bank:reindex` (`scripts/app/bank-reindex.ts`)                |
| The panel they read        | `lib/app/tutor/panel.ts` (`TutorEntityContextSchema`, `readPanel()`)                                                             |
| The synth context          | `lib/app/tutor/context.ts` (`synthContext()`, `contextType: 'synth'`)                                                            |
| Sections and the size cap  | `lib/app/tutor/sections.ts`                                                                                                      |
| Registration               | `lib/app/platform-agents.ts`, `lib/app/capabilities.ts`, `lib/app/context-contributors.ts`                                       |
| The capability rows        | `prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`                                                                              |
| Tests                      | `tests/unit/lib/app/tutor/`, `tests/unit/app/api/v1/tutor/`, `tests/unit/components/app/tutor/`                                  |
| Smoke run                  | `npm run smoke:tutor` (`scripts/smoke/tutor.ts`)                                                                                 |

## One turn

1. The tutor panel sends the learner's message and the panel to `POST /api/v1/tutor/stream`.
2. The route checks the synth and the panel, checks the allowance (below), and calls `streamChat()` with
   `agentSlug: 'synth-tutor'`, `contextType: 'synth'`, `contextId` the synth id, and
   `entityContext` `{ synthId, version, panel: { values, cables } }` (`TutorEntityContext`). The
   same synth in both: the tools see only `entityContext` and the prompt only `contextId`, so
   nothing downstream can notice if they differ.
3. The system prompt is the tutor's instructions, then the `LOCKED CONTEXT` the contributor builds
   for the synth: its name, what it is, how many controls it has, its section index, and the
   prefixes inside any section too big to describe at once. About 220 tokens for Model D, 420 for
   the DeepMind, 920 for System 55.
4. The model calls tools. Each reads the panel from `entityContext`; each result goes back to the
   model and out to the page as a `capability_result` event.
   - **Five model calls a turn** (`MAX_TOOL_ITERATIONS` in Sunrise's chat handler); tools called
     together in one call count once. So the instructions have the model read `get_panel` in the
     same call as its first lookup and go straight to the narrowest prefix it knows. One change to
     a DeepMind effect is three calls (`get_panel` and `fx1`, then `fx1.<effect>`, then the
     proposal), leaving one for the answer and one spare.
   - **Two failures and a tool is off for the turn** (`TOOL_FAILURE_THRESHOLD`). So a refused tool
     gets one corrected retry, and the instructions say so.
5. A proposal or a designed sound reaches the page only as a successful tool result, so only after
   it has passed validation. The panel checks it again and offers it ([The panel](#the-panel)).

## The routes

**`POST /api/v1/tutor/stream`**, signed in (`withAuth`; an API key works too if it has the `chat`
scope). The body is `{ synthId, panel: { values, cables }, message, conversationId? }`: the message
up to 4,000 characters, the conversation one the caller started with the tutor on this synth. The
answer is Sunrise's chat SSE stream (`sseResponse`): `start`, `content`, `capability_result(s)`,
`done`, or an `error` event.

Everything that can refuse a turn runs before the model is called, in this order:

| Check                                                                                    | Refused with                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Signed in                                                                                | 401                                                                                                    |
| The per-user chat cap, `consumerChatLimiter`: 10 a minute (`RATE_LIMIT_CONSUMER_CHAT`)   | 429 `RATE_LIMIT_EXCEEDED`, before the body is read                                                     |
| `Content-Length` at most 256 KB (the DeepMind's whole panel is about 40 KB)              | 413 `TUTOR_REQUEST_TOO_LARGE`, before the body is read                                                 |
| The body's shape                                                                         | 400 `VALIDATION_ERROR`                                                                                 |
| A synth the catalogue lists (`playableSynth`, as a saved sound)                          | 400 `VALIDATION_ERROR`, path `synthId`                                                                 |
| The panel fits its current definition (`checkPanel`, `validateSound`)                    | 400 `VALIDATION_ERROR`, each problem's path under `panel`                                              |
| The tutor is there and active                                                            | 503 `TUTOR_UNAVAILABLE`, a sentence the panel shows as it is                                           |
| The tutor's own per-minute limit, `agentChatLimiter` (the admin's `rateLimitRpm`, or 10) | 429 `RATE_LIMIT_EXCEEDED`                                                                              |
| A `conversationId` names the caller's own tutor conversation on this synth               | 404 `TUTOR_CONVERSATION_NOT_FOUND`; the panel starts a new one                                         |
| The daily allowance                                                                      | 429 `TUTOR_ALLOWANCE_SPENT`, a sentence, the allowance in `details`, and `Retry-After` until the reset |

The two per-minute caps are the consumer chat route's, keyed the same way, so a learner gets no
extra turns by switching surfaces. The prototype's copy for a 429 `RATE_LIMIT_EXCEEDED` was "Too
many questions in a short time. Wait a moment, then ask again."; the panel carries it.

A conversation stays on the synth it started on. Carried on with another one, its history would
talk about controls the new synth's context and tools do not have, and the conversation would still
be filed under the first synth. The check reads the caller's own conversation only, as `streamChat`
loads one, so the route is declared to the ownerless-surface guard beside the allowance.

The panel goes to the tools as checked, with the synth's current definition version. Like a saved
sound, a page loaded before a deploy that changed a definition sends a panel that is checked against
the new one.

**`GET /api/v1/tutor/allowance`**, signed in (or a `chat`-scoped key): `{ limit, used, remaining,
resetsAt }` for the caller, for the panel's meter.

**`GET /api/v1/tutor/conversation?synthId=`**, signed in (or a `chat`-scoped key): `{ conversation:
{ conversationId, messages } | null }`, the caller's latest active tutor conversation on that synth,
with its last 40 questions and answers oldest first. Tool calls and empty steps are left out, and
rows saved in the same millisecond are ordered by id. An answer that did not finish says how it
ended, from the marker Sunrise saved in its metadata: `ended: 'failed'` for `error: true`,
`'stopped'` for the same with `errorCode: 'aborted'` (the learner pressed Stop), and `'cost'` for
`endedReason: 'budget_exceeded'` (the per-turn cap, mid-loop), which keeps what was written and is
kept even when that is nothing. A failure marker's own text is written for an admin and is dropped.
The panel shows the line it showed at the time ("The tutor could not answer this one." for a
failure), not as an alert: it was said already. Read as
the stream route checks a conversation it carries on, so the id it returns is one that route takes.
The app's own because Sunrise's consumer conversation routes serve only `public` and `invite_only`
agents. Like the stream route, it is declared to the ownerless-surface guard.

Signed out, both are a 401, and the panel shows a sign-in prompt: the allowance is per person (D6)
and `streamChat()` needs a user.

## The allowance

Borrowed from BeatBuddy's (`~/code/beatbreaker/lib/app/breaks/buddy/allowance.ts`), and its reasons
hold: it is a cost cap, and the cost is per turn.

- **A turn is a message the learner sent**: an `AiMessage` with `role: 'user'` in one of their
  conversations with the tutor (the platform's row, `isSystem`, as the route loads it). The tutor's
  replies and tool messages are not turns, except a web search's.
- **A web search is a turn too** (D12): each `web_search` tool message whose saved result is a
  success (`metadata.result.success`). One refused before it reached Brave, or that Brave failed,
  costs nothing. A search with no turns left is refused, and the next question then gets the 429.
  The question that asks is already counted when the tool reads the allowance, so on the day's
  last question the tutor answers without searching: the search would be a turn past the cap.
- **It counts once it is saved**, which `streamChat` does before the model answers. So a turn the
  provider fails still counts, and a learner who retries through an outage spends a turn on each
  try. Counting only answered turns would put the transcript's shape into the query; that is worth
  it only if outages turn out to be common.
- **Over the UTC day.** One boundary for everybody, "back at midnight UTC", and nothing from the
  browser. `resetsAt` is the next UTC midnight.
- **Counted from the transcript, not stored.** So deleting a conversation gives its turns back. That
  is fine for a cost cap, and not worth a table.
- **The caller's own rows only.** `conversation: { userId }` from the session, like core's
  `conversations/export`: a thread nobody owns is nobody's turn. So it does not go through
  `conversation-access`, and is declared to Sunrise's ownerless-surface guard in
  `appOwnerlessSurfaceExceptions` (`lib/app/ci.ts`) with that reason.
- **A soft cap.** Turns sent together all read the count before any of them is saved, so all go
  ahead, and so do searches the model asks for together in one step. The per-user chat cap (10 a minute, per server process) bounds how many arrive together,
  so a day's overshoot is at most that many on each server process.
- **`TUTOR_DAILY_TURNS`**, through `lib/app/env.ts`: a whole number from 1 to 1,000, **30** when
  unset, as BeatBuddy's. An env setting so the number changes without a code change: set it and
  restart. Blank (`TUTOR_DAILY_TURNS=`) means unset, as core's `MIGRATE_DATABASE_URL`; anything
  else outside the range stops the server at boot. It is not in `.env.example`, which is Sunrise's
  file. The production number is set at f-launch x4 and recorded against D6.

## The agent

A platform agent (owner ruling, 2026-10-18, journaled on `f-tutor`): registered from
`lib/app/platform-agents.ts`, created by the reconcile in the install org only
(`audience: 'install-only'`), and brought back in line with the definition after every deploy.

| Field              | Value                                                                | Whose                           |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- |
| Visibility         | `internal` (the baseline)                                            | the code's                      |
| Temperature        | 0.4                                                                  | the code's                      |
| Max tokens         | 8,192 (room for a designed sound, the longest reply; see `agent.ts`) | the code's                      |
| Tools              | the six below                                                        | the code's                      |
| Provider and model | none: inherits the org's default at run time                         | the admin's                     |
| Per-turn cap       | **$0.20** to start (BeatBuddy's)                                     | the admin's, set once on create |
| Monthly budget     | **$50** to start                                                     | the admin's, set once on create |

Max tokens is the code's, so an admin cannot lower it, and nothing clamps it to the model's own
output limit: a model that stops at 4,096 output tokens would refuse every tutor call. Choose one
that allows at least 8,192, as Sunrise's provider auditors already need (they ask for 16,384).

### The sourcing rules

The instructions' last paragraph (t-60) sets where an answer comes from, in order:

1. **The databank first**, for any person, band, record or real instrument, keeping each claim to
   what it found.
2. **Then the web**, once, when the databank found nothing, keeping each claim to what that found.
3. **Then its own knowledge**, when neither found it or `web_search` refused, saying so in the
   answer, and saying search isn't set up when that is the refusal.

A question about the panel or how synthesis works needs no search, and each search costs one of the
learner's questions. The tutor lists no links in its reply: the panel shows the sources under it.

**Off-topic is declined by the instructions.** The tutor answers about music, sound and
synthesisers, and says briefly that anything else is outside what it does, without searching for
it. Sunrise's `topicBoundaries` is not used: it is a word blocklist, and no list of words tells a
question about a record from one about anything else.

The starting caps are placeholders for the admin to tune. The production provider, model and the
learner's daily allowance are decided at `x4` and recorded against D6. Changing the instructions
takes a deploy: the cost the owner accepted for keeping them in step with the tools.

## The tools

| Tool                   | Arguments                                                         | Returns                                                                                                                                         | Refuses with                                                                                         |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `get_panel`            | none                                                              | the controls that differ from init (id, label, value, value as shown), at most 100; the cables, at most 100; the version                        | `no_panel`, `unknown_synth`, `stale_panel`, `invalid_panel`                                          |
| `describe_synth`       | `section?`, `prefix?`                                             | `describeSynth` text for the whole synth, a section or a prefix, or an index to narrow by                                                       | the above, `unknown_section`, `unknown_prefix`                                                       |
| `propose_panel_change` | `set`, `addCables`, `removeCables`                                | the controls that change, the cables, and a row per change (label, from, to, as shown)                                                          | the above, `empty_proposal`, `invalid_proposal`, `no_change`                                         |
| `design_sound`         | name, blurb, level, category, how, steps, context, tweaks, phrase | the whole sound as a `Preset`, credited to the tutor, `ai: true`                                                                                | the above, `invalid_design`                                                                          |
| `search_databank`      | `query`, `kind?`                                                  | at most six databank rows, each with its page, a line that places it, an excerpt, its links and `matchedBy`; `search`; a `note` when none match | a bad argument only (it reads no panel)                                                              |
| `web_search`           | `query`                                                           | at most five web results, each its `title`, `url` and `snippet`; a `note` when none match                                                       | `web_search_not_configured`, `web_search_no_user`, `web_search_allowance_spent`, `web_search_failed` |

- **`propose_panel_change`** runs `checkSettings` on `set` and `checkCables` on `addCables`, then
  checks against the panel: a cable to remove must be in, a cable to add must not be (nor listed
  twice, nor also removed), and something must change. A control already at the proposed value is
  left out of the result. At most 64 controls and 16 cables each way. An empty call is refused as
  `empty_proposal`, not `no_change`: it is what a call cut off at the token cap arrives as. A cable
  to remove that is in but written input first gets the order to write it in.
- **`design_sound`** builds the sound the way `sanitizePreset` did (id `tutor-…`, ref, artist
  `AI tutor`, tags `[category, 'ai']`, a looping phrase) and runs `validatePreset`. The prototype's
  limits refuse rather than clamp: 1–9 steps, each setting a control or plugging a cable; up to 5
  tweaks; 1–32 riff notes of `[beat 0–16, MIDI 24–96, length 0.05–16]` at 40–180 bpm; the string
  lengths `sanitizePreset` cut to. Two bounds of its own: at most 32 controls set in one step, and
  context for at most 16. The id is random (`tutor-` and twelve hex digits). Everything but the
  name is `SoundLessonSchema` (`lib/app/sounds/lesson.ts`), the same schema a saved sound's lesson
  is held to, so a design the tool passes is one `POST /api/v1/sounds` takes. Saving one sends
  `{ blurb, level, category, how, steps, context, tweaks, phrase: { bpm, steps } }` as `lesson`,
  with `fromTutor: true`; the `Preset` the tool returns has the category as its first tag and a
  phrase with `loop`.
- **`search_databank`** is the databank search in [`bank.md`](./bank.md#searching): by name and
  text, no AI provider. The instructions tell the tutor to call it first for any person, band,
  record or real instrument, keep to what it found, and say when it is going from memory. Six rows
  keep a search small in a tool loop that sends every result again on each later step. With no
  match it says so in `note`, so the model does not read an empty list as licence to guess.
  When the meaning-based layer is on (below), its results are merged in: see
  [The meaning-based layer](#the-meaning-based-layer).
- Every tool's JSON schema says `additionalProperties: false`, as its Zod schema refuses any other
  key, so the model is told rather than refused.
- A refusal lists up to twelve problems, each with its path (`steps.1.set.filter.drive`), then
  how many more there are.
- **No per-tool rate limit.** The dispatcher counts a capability's `rateLimit` per agent, and one
  tutor serves every learner, so any limit there would be a cap for the whole app. The rows leave
  it `null` (unlimited). A learner's limit is the stream route's daily allowance, which
  `web_search`, the one tool that costs per call, also counts against; Brave's host has Sunrise's
  outbound per-host limit as well (60 a minute unless `ORCHESTRATION_OUTBOUND_RATE_LIMIT` says).

## Web search

`web_search` (t-59, D12) is for when the databank has no answer: the instructions have the tutor
call `search_databank` first, then `web_search` once, and keep to what it found.

- **Brave's Search API, for now** (owner ruling, 2026-10-19, journaled on `f-tutor-knowledge`).
  The ruling prefers the provider's own web search, which Sunrise can't send: its provider layer
  sends only function tools. That is asked of Sunrise in
  [sunrise#1037](https://github.com/human-centric-engineering/sunrise/issues/1037). An admin switch
  between the two routes waits until it lands.
- **Through Sunrise's outbound HTTP module** (`executeHttpRequest`), so the host allowlist
  (`ORCHESTRATION_ALLOWED_HOSTS`) and the per-host rate limit apply as they do to
  `call_external_api`. It is not a binding of that tool: there the model writes the URL and reads
  Brave's raw JSON; here it writes a query and reads five trimmed results.
- **What reaches the model**: the title, the URL (http or https only) and the snippet of each, with
  Brave's markup gone and its entities decoded once by a real parse (core's `dom-text`), cut to 150
  and 300 characters. Nothing else of Brave's reply. When nothing matched, a note says so and has
  the tutor answer from its own knowledge, not search again.
- **The tutor's alone.** The allowance counts only tutor conversations, so a search from any other
  agent would be a paid request nobody counts. It checks the calling agent is the platform's tutor
  and refuses otherwise (`web_search_wrong_agent`), sending nothing.
- **Off without a key.** A platform agent's bindings are the code's, so the tool stays bound when
  search isn't set up. It refuses instead (`web_search_not_configured`), and the instructions have
  the tutor say search isn't set up and answer from its own knowledge, saying so. A host missing
  from the allowlist reads the same. Brave failing, timing out (8 seconds) or replying in a shape
  it can't read is `web_search_failed`, and so is the database failing while the allowance is
  read. Brave's own message and HTTP status are logged, not passed on; the status tells a bad key
  (401/403) from an outage.
- **To turn it on**: set `BRAVE_SEARCH_API_KEY` and add `api.search.brave.com` to
  `ORCHESTRATION_ALLOWED_HOSTS`, then restart (the key is read at boot, with the other env vars). After the merge that brought
  the tool in, `db:seed` writes its capability row and binds it (`sunrise.mcp-reseed`).

## The meaning-based layer

`search_databank`'s second layer (`f-tutor-knowledge` t-58, `lib/app/bank/knowledge.ts`) finds
rows by what a question means, for one that names nothing in the databank ("who pioneered
modular synthesis?", "which bands used string machines?"). It sits on top of the lexical search
and never replaces it.

- **The projection.** Each bank row is one document in the install org's default knowledge base,
  tagged `kys-databank`, named `Databank: <name>` with the file name
  `kys-databank-<kind>-<id>.md`. It holds the row's name, the line that places it, its own text,
  and the names of the rows it links to, so a rename also re-projects every row that names it.
  It is written only through Sunrise's document manager (upload and delete).
- **The reconcile** is a pure code projection. A row is written only when its text's hash differs
  from its document's `fileHash`; only tagged documents are removed; a bank that reads empty
  deletes nothing and logs a warning. A failed upload keeps the old document (except under
  `--force`, which deletes it first), and the run counts it in `failed`.
- **An admin's edit to one of these documents on the Knowledge page is overwritten**, when its row
  next changes, or at once by `npm run bank:reindex -- --force`. Edit the databank, not the
  document.
- **When it runs**: on the maintenance tick, every 15 minutes (`app:project-databank` in
  `lib/app/jobs.ts`, the install org only), and from `npm run bank:reindex`. Never on an admin's
  save, which would then wait on an embedding call per row. With no usable embedding provider
  (`resolveEmbeddingAvailability()`) it skips and logs.
- **The merge.** The tool runs both layers at once, twelve candidates each: the lexical search,
  and Sunrise's vector search (`searchKnowledgeWithEmbedding`) restricted to the tagged
  documents' ids. It fuses them by reciprocal rank (`1 / (60 + rank)` summed over the layers that
  found a row), one entry per row, so a row both found comes first; ties keep the lexical order.
  Each result says `matchedBy` (`lexical`, `meaning`, or both), and the result says `search`:
  `lexical+meaning`, or `lexical` when the layer is not set up, its provider is gone, or the
  search failed (a stored vector of another dimension is refused before the query is embedded).
  It does not turn on Sunrise's global hybrid switch, which would change the Pattern Advisor's
  search too; if an admin turns it on, the vector search here follows it.
- **The public `GET /api/v1/bank/search` stays lexical**, so it costs nothing per query.

**Turning it on:**

1. Add an OpenAI provider (Admin → Orchestration → Providers) with `OPENAI_API_KEY` in the
   environment. Anthropic has no embedding model.
2. Choose its embedding model as the active embedding model (orchestration settings). Changing it
   later means `npm run embeddings:reset`, which empties the knowledge base, then step 3 again.
3. Run `npm run bank:reindex`, or wait for the next tick. The first run makes one embedding call
   per row, about 1,420; later runs write only rows that changed. It exits non-zero if any row
   failed.

The run with real embeddings is the owner's end-of-feature check (the feature's done-when).

## The lookup decision

Old t1, measured at planning on 2026-10-18 and again when this was built. `describeSynth(def,
def.init, [])` counted with `gpt-tokenizer` (o200k):

| Synth                   | Controls | Characters  | Tokens    |
| ----------------------- | -------- | ----------- | --------- |
| DeepMind 12             | 1,568    | 96,811      | ≈40,600   |
| System 55               | 183      | 23,848      | ≈9,900    |
| System 35               | 98       | 14,489      | ≈6,000    |
| System 15               | 63       | 9,505       | ≈4,000    |
| The other 21            | —        | under 7,000 | 700–2,900 |
| Model D (one of the 21) | 48       | 3,398       | 1,256     |

The tool loop sends the system prompt again on every iteration. Inline, the DeepMind would cost
about $0.08 a call on gpt-4.1, and three iterations would pass the $0.20 per-turn cap. So
`describe_synth` is a lookup for **every** synth: one code path, and one behaviour to evaluate.

How it answers (`DESCRIBE_MAX_CHARS`, 8,000 characters, in `sections.ts`):

- **No arguments.** The whole synth when it describes in 8,000 characters or fewer, measured with
  the panel's values and cables: the 21 small synths, in one call, unless the panel is heavily
  patched. Otherwise the section index (190 tokens for the DeepMind), which counts each section's
  controls and jacks, so a section of only jacks (a modular's outputs) does not read as empty.
- **A section** (an area id) returns what is in it. **A prefix** returns the controls whose ids are
  it or continue it after a dot. Both together narrow both ways. A narrowed answer lists only the
  cables to and from the jacks in it, and says so: with the whole cable list in every answer, a
  heavily patched panel left some controls unreachable.
- **Too big to list**, it returns the ids one dot-segment deeper, each with a count and example
  labels, and describes in full any that are single controls. The DeepMind's `display` section
  holds 1,514 of its 1,568 controls, almost all the four FX slots' 373 parameters each. So
  `section: 'display'` gives the groups (329 tokens), `prefix: 'fx1'` gives `fx1.type` in full
  with every effect it can hold and one group per effect (1,700 tokens), and
  `prefix: 'fx1.tc-deepvrb'` gives that effect's parameters (220 tokens). The context lists the
  `display` section's prefixes, so the model can start at `fx1`. A single control or jack
  is always described, however long: an index of one would point back at itself.
- Only the jacks the sound engine models are listed, counted or matched, as `describeSynth` lists
  no others.

A section id is looked up with `find`, not through `areaMap`: the id comes from the model, and a
plain object would answer `constructor`.

## Seeding

`app-knowyoursynth/003-tutor-tools` writes one capability row per tool from its class (code-owned
fields re-applied, the admin's left alone), then reconciles the install org. Core's
`021-platform-agents` runs before any app unit, so on a fresh database it creates the tutor with no
tools bound (a capability with no row is skipped with a warning). The app unit's reconcile binds
them on the same seed rather than at the next maintenance tick. Its hash takes in
`lib/app/tutor/`, so a change to a tool or to the agent re-runs it.

**After a merge that changes a tool's schema** (`sunrise.mcp-reseed`): run `npm run db:seed` on
every database so the rows match the classes, and reconnect any MCP client that cached the tool
list. MCP clients see a capability only once an admin exposes it on the MCP Tools page (an
`McpExposedTool` row); the tutor's tools are not exposed, and would only read and propose if they
were. Without `entityContext` every one of them refuses with `no_panel`.

## Smoke run

`npm run smoke:tutor` runs real turns through `POST /api/v1/tutor/stream` on a running server
(`npm run dev`, or `SMOKE_BASE_URL`), against the dev database with the configured provider: "Make
this sound darker" on Model D, and one change on the DeepMind. It mints the first user a `chat` API
key, which `withAuth` takes in place of a session, and deletes it at the end. Each turn's SSE must
carry a proposal that passes `validateSound` on the panel it was made against, and the turn must
log a cost above zero. The allowance must then read two more turns used. It goes over HTTP because
the route reads `next/headers`, which exist only inside a request. Unlike the other smoke scripts it calls the real provider: the logged cost is the
check, and it is also the check that Sunrise 0.14's fix to #813 (the agent resolver loads the
model registry) leaves BeatBuddy's `hydrateFromDb()` workaround unneeded.

It needs a server, `npm run db:seed` (the tool rows and the tutor, bound), an active provider whose
key is in `.env.local`, and a default chat model. **Not run yet:** when t-53 was built the dev database
had no provider configured, and the run was deferred (2026-10-18). At t-54 it was rewritten to go
through the route, and deferred again by the owner (2026-10-18). Record each run here.

| Date | Provider and model | Turn | Tools called | Cost |
| ---- | ------------------ | ---- | ------------ | ---- |

## The panel

`components/app/tutor/`, in the synth page's aside under the Inspector, where the prototype's sat.
Signed out, it says what the tutor does and links to sign-in, back to this synth: the allowance is
per person and `streamChat()` needs a user. Borrowed from BeatBuddy's drawer
(`~/code/beatbreaker/.context/app/beatbuddy.md`, _The drawer and the apply loop_), with two
differences that follow from the tools: a proposal waits for the learner's Apply rather than landing
as it arrives, and a designed sound opens as it arrives, as the prototype's did.

- **One composer.** The prototype had Ask and Design a sound because each sent its own prompt. Here
  the tutor picks its tool from the question, so the suggested questions carry both kinds. Its
  Claude-account and permission copy is gone.
- **The meter** reads the allowance when the panel opens and after every turn. At zero, or on a 429
  `TUTOR_ALLOWANCE_SPENT` (whose `details` it takes), the composer closes.
- **The library's empty search** offers "ask the tutor to design one", which scrolls to the panel and
  puts "Design a sound: _the search_" in the composer, cut to the 4,000 characters the route takes.
  It does not send it: each question counts. With a category chosen and the search matching sounds
  in another, it says to pick another category too.

### Which conversation

**The panel carries on the synth's latest conversation** (`GET /api/v1/tutor/conversation`), showing
what was said, and the composer waits for that read. One a learner keeps coming back to stays one
conversation, so the admin's `maxConversationsPerUser` counts about one per synth rather than one
per visit. Each synth keeps its own: the route refuses a conversation from another synth, and its
history would talk about controls this one does not have. So changing synth changes conversation, as
the prototype's did, and coming back to a synth picks its own up again.

A conversation that cannot take the turn is replaced, once: the route's 404
`TUTOR_CONVERSATION_NOT_FOUND` (archived, pruned, or the agent made again) and Sunrise's
`conversation_length_cap_reached` (the admin's `maxMessagesPerConversation`). Both refuse before the
message is saved, so nothing has been counted, and the same question goes again on a new
conversation with a line saying so.

Rejected: a new conversation on every page load, BeatBuddy's, which locks a learner out at the cap.
Also rejected: keeping the conversation id in browser storage, which loses the history on another
device and still needs a read to show it. **Cost accepted:** an admin who sets
`maxConversationsPerUser` below the number of synths a learner uses the tutor on locks them out of
the rest (`conversation_cap_reached`, which the panel words for the learner). Leave it unset, or
above the number of synths.

### Apply and Undo

`apply.ts` is pure and holds the rules; `use-tutor-chat.ts` runs them.

- **Checked again on the client.** A `propose_panel_change` result counts only if it parses, names
  this synth at this definition version, and passes `checkSettings` and `checkCables`; Apply checks
  it once more. A `design_sound` result counts only if its lesson passes `SoundLessonSchema` and
  `checkLesson`, so a design the panel opens is one Save can keep. A refused call carries no data.
- **One proposal a turn: the last step's.** The calls the model makes together in one step (one
  `capability_result(s)` frame) were all worked out against the panel the turn sent, so they
  combine, a later call winning a control both set and overriding what an earlier one did with a
  cable. A proposal from a later step replaces the earlier: the model made it after seeing the
  first, and the instructions ask for one, so a second is a correction. Rejected: combining every
  proposal of the turn, which would keep a control a correction meant to drop; and offering each as
  its own chip, where applying one makes the others stale.
- **The chip** lists the change one line per control and cable, as the panel reads them
  ("CUTOFF FREQUENCY: 1 · 1.3 kHz → −3 · 80 Hz"), and offers "Apply 3 changes + 1 cable". Apply
  waits for the turn to end, since a later step may still replace the proposal, and is then offered
  only while the panel is still the one the turn sent. Otherwise the proposal is dropped and the chip
  says the panel changed since, and to ask again.
- **Apply** snapshots the panel, then sets the controls, takes the cables out and plugs the new ones
  in, as turning the controls would: the sound and the lesson step stay. **Undo** puts the snapshot
  back, and is enabled only while the panel still shows the change: BeatBuddy's chip rule. After
  Undo the panel is the one the proposal was made for again, so Apply is offered again.
- **A designed sound opens as it arrives**, as choosing a library sound does: the panel is its whole
  sound, the Lesson panel shows its lesson (_Designed by the AI tutor_, _AI designed · check by ear_),
  "Loaded:" names it _from the tutor_, and no library sound is current. Stepping through its lesson
  keeps it open, and Restore builds it again. The chip's Undo puts back everything that was on the
  panel before: the sound, the step, one of the user's sounds or a shared one. It is enabled once
  the turn has ended, while that design is open and the panel still shows it. A turn that designs
  two opens each in turn, and one Undo goes back to before the first. Undoing a later turn's design
  opens the earlier one again, so its Undo comes back: designs undo in the order they opened.
- **Save keeps the lesson and the mark.** With a designed sound open, Save… makes a new sound named
  after it and sends its lesson with `fromTutor: true`; once saved, it is one of the user's, with its
  lesson ([`sounds.md`](./sounds.md#a-sounds-lesson-t-55)).

### Sources

Under each answer, what the turn's searches found (t-60), read by `lib/app/tutor/sources.ts` from
each `search_databank` and `web_search` result as it arrives, a turn's searches added together, each
source once.

- **A databank row** links to its `/bank` page, with its tab ("databank, artists"). It counts only
  with an href that is its own row's page (`/bank/<kind>/<id>`).
- **A web result** links out, in a new tab, with `rel="noopener noreferrer nofollow"`, and names its
  site. It counts only with an http or https URL, checked again here though `web_search` checks it
  too, so no other scheme reaches an `<a>`.
- **A turn with none** is labelled _From the tutor's own knowledge._: one that searched nothing, one
  whose search found nothing, and one whose search refused. A refusal is read by its `success` flag.
  The label waits for the answer to finish. It is left off a turn that ended in a failure, an
  answer about a proposal or a designed sound (the chip is what it is about), and a carried-on
  line the tutor wrote before it searched, which is saved as an answer of its own.
- **They are what the searches found**, not which of them the answer used: the instructions keep
  each claim to its source, and the learner can follow any of them to check.
- **A conversation carried on shows them too.** The conversation read takes the conversation's
  stored `search_databank` and `web_search` tool messages from the turn of its oldest shown
  message (from its question, when the transcript opens on an answer), newest first up to 200, in
  a second query so they do not use up the transcript's forty, and gives each answer the sources of
  the searches before it in its turn as `sources`. A line written before the search ("Let me look
  that up") gets none; the answer written after it does.

### When a turn fails

Every failure ends the turn with a line in the panel, and nothing else on the page waits on a turn.
Sunrise's own copy is written for an admin ("Go to Admin → Providers"), so the panel words each one
for the learner (`TUTOR_ERRORS`):

| What happened                                                                                     | The line                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A provider error, or any other `error` frame                                                      | The tutor could not answer just now. The synth and everything else on the page still work. |
| A stream that closes with no `done`, breaks, or stops at the token cap (`finishReason: 'length'`) | The tutor's answer was cut off. …                                                          |
| 429 `RATE_LIMIT_EXCEEDED`                                                                         | Too many questions in a short time. Wait a moment, then ask again. (The prototype's.)      |
| 429 `TUTOR_ALLOWANCE_SPENT`, 503 `TUTOR_UNAVAILABLE`, 413                                         | The route's own sentence, written for the learner                                          |
| 400 (a panel the current definition refuses)                                                      | The tutor could not read the panel as it is. Reload the page, then ask again.              |
| 401                                                                                               | Your session has ended. Sign in again to ask the tutor.                                    |
| `output_blocked`, `input_blocked`, or `done` with `finishReason: 'error'` (a refusal or a filter) | The tutor declined that one. Try asking it a different way. (The prototype's.)             |
| `tool_loop_cap`, `budget_exceeded`, `budget_exceeded_per_turn`                                    | Too many steps; the month's budget; an answer that cost more than a question is allowed    |
| `conversation_cap_reached`                                                                        | The tutor can't start another conversation for your account. …                             |

A turn gets one line, the first: a cost stop followed by a `done` at the token cap, a Stop or a
broken stream keeps the cost line. None is retried (the anti-patterns above): the learner asks again if they want to. Stop aborts the
stream.

## Not yet

- **A designed sound lasts the visit.** The panel keeps its values in browser storage like any
  other, but the sound and its lesson are held in the page: a reload, or another synth, leaves the
  panel with the library's lesson. Saving it is what keeps it. Keeping designs across a reload
  would mean reading them back from the conversation's tool messages.
- **The eval set** is the rest of `f-tutor-knowledge` (t-61).
- **The provider's own web search**, in place of Brave or beside it, waits on
  [sunrise#1037](https://github.com/human-centric-engineering/sunrise/issues/1037).
