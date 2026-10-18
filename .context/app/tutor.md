# The tutor

`f-tutor`. An AI tutor on the synth page that explains the sound on the panel, proposes changes
the learner applies, and designs new sounds with their lesson (D6, plan §8). The prototype's tutor
(`prototype/src/ui/Tutor.jsx`) called Claude through `window.claude` and asked for JSON in the
reply. Here it runs through Sunrise's orchestration. **The model proposes, the server validates,
and the learner applies. The model never writes to the panel.**

t-53 built the agent, its tools and its context; t-54 the stream route and the daily allowance. A
designed sound kept with its lesson (t-55) and the tutor panel (t-56) build on them.

## Anti-patterns first

- **Don't make the tutor `public` or `invite_only`.** Sunrise's generic `POST /api/v1/chat/stream`
  serves both to any signed-in user, with no daily allowance, so it would be a way round the app's
  route and its limit (BeatBreaker found this in Phase 8). The definition leaves visibility to the
  platform baseline, `internal`, and `tests/unit/lib/app/tutor/chat-route.test.ts` runs that route
  against the tutor's row.
- **Don't give a tool a user.** No tool takes a user id in its arguments (every schema is
  `.strict()`, so an extra `userId` is refused), and none reads `CapabilityContext.userId`. A
  panel is the same whoever sent it. `tools.test.ts` holds every registered tutor tool to both.
- **Don't let a tool write.** The four tools read and propose. A tool that changed stored state
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
- **Don't edit the instructions in the admin and expect them to stay.** The tutor is a platform
  agent: its instructions, tools and visibility are the code's and are written back after every
  deploy, and the admin's API refuses an edit to them. Provider, model and spend are the admin's.

## Where things are

| Piece                     | Location                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The stream route          | `app/api/v1/tutor/stream/route.ts`, its body `lib/app/tutor/request.ts`                                              |
| The allowance             | `lib/app/tutor/allowance.ts`, read by `app/api/v1/tutor/allowance/route.ts`; `TUTOR_DAILY_TURNS` in `lib/app/env.ts` |
| The agent's definition    | `lib/app/tutor/agent.ts` (`TUTOR_AGENT`, slug `synth-tutor`)                                                         |
| The tools                 | `lib/app/tutor/{get-panel,describe-synth,propose-panel-change,design-sound}.ts`, listed in `tools.ts`                |
| The panel they read       | `lib/app/tutor/panel.ts` (`TutorEntityContextSchema`, `readPanel()`)                                                 |
| The synth context         | `lib/app/tutor/context.ts` (`synthContext()`, `contextType: 'synth'`)                                                |
| Sections and the size cap | `lib/app/tutor/sections.ts`                                                                                          |
| Registration              | `lib/app/platform-agents.ts`, `lib/app/capabilities.ts`, `lib/app/context-contributors.ts`                           |
| The capability rows       | `prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`                                                                  |
| Tests                     | `tests/unit/lib/app/tutor/`, `tests/unit/app/api/v1/tutor/`                                                          |
| Smoke run                 | `npm run smoke:tutor` (`scripts/smoke/tutor.ts`)                                                                     |

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
   it has passed validation. The page decides how to apply it (t-56).

## The routes

**`POST /api/v1/tutor/stream`**, signed in (`withAuth`; a user's `chat` API key works too). The body
is `{ synthId, panel: { values, cables }, message, conversationId? }`: the message up to 4,000
characters, the conversation one the caller started with the tutor (another person's, or another
agent's, ends the stream with `conversation_not_found`). The answer is Sunrise's chat SSE stream
(`sseResponse`): `start`, `content`, `capability_result(s)`, `done`, or an `error` event.

Everything that can refuse a turn runs before the model is called, in this order:

| Check                                                                                    | Refused with                                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Signed in                                                                                | 401                                                                    |
| The per-user chat cap, `consumerChatLimiter`: 10 a minute (`RATE_LIMIT_CONSUMER_CHAT`)   | 429 `RATE_LIMIT_EXCEEDED`, before the body is read                     |
| `Content-Length` at most 256 KB (the DeepMind's whole panel is about 40 KB)              | 413 `TUTOR_REQUEST_TOO_LARGE`, before the body is read                 |
| The body's shape                                                                         | 400 `VALIDATION_ERROR`                                                 |
| A synth the catalogue lists (`playableSynth`, as a saved sound)                          | 400 `VALIDATION_ERROR`, path `synthId`                                 |
| The panel fits its current definition (`checkPanel`, `validateSound`)                    | 400 `VALIDATION_ERROR`, each problem's path under `panel`              |
| The tutor is there and active                                                            | 503 `TUTOR_UNAVAILABLE`, a sentence the panel shows as it is           |
| The tutor's own per-minute limit, `agentChatLimiter` (the admin's `rateLimitRpm`, or 10) | 429 `RATE_LIMIT_EXCEEDED`                                              |
| The daily allowance                                                                      | 429 `TUTOR_ALLOWANCE_SPENT`, a sentence and the allowance in `details` |

The two per-minute caps are the consumer chat route's, keyed the same way, so a learner gets no
extra turns by switching surfaces. The prototype's copy for a 429 `RATE_LIMIT_EXCEEDED` was "Too
many questions in a short time. Wait a moment, then ask again."; the panel (t-56) can carry it.

The panel goes to the tools as checked, with the synth's current definition version. Like a saved
sound, a page loaded before a deploy that changed a definition sends a panel that is checked against
the new one.

**`GET /api/v1/tutor/allowance`**, signed in: `{ limit, used, remaining, resetsAt }` for the caller,
for the panel's meter.

Signed out, both are a 401, and the panel shows a sign-in prompt: the allowance is per person (D6)
and `streamChat()` needs a user.

## The allowance

Borrowed from BeatBuddy's (`~/code/beatbreaker/lib/app/breaks/buddy/allowance.ts`), and its reasons
hold: it is a cost cap, and the cost is per turn.

- **A turn is a message the learner sent**: an `AiMessage` with `role: 'user'` in one of their
  conversations with the tutor. The tutor's replies and tool messages are not turns.
- **Over the UTC day.** One boundary for everybody, "back at midnight UTC", and nothing from the
  browser. `resetsAt` is the next UTC midnight.
- **Counted from the transcript, not stored.** So deleting a conversation gives its turns back. That
  is fine for a cost cap, and not worth a table.
- **A soft cap.** Two turns sent at the same instant can both read 29 and both go ahead. That
  overshoots by a turn or two, never by a day's worth, and the per-minute caps keep it to a few.
- **`TUTOR_DAILY_TURNS`**, through `lib/app/env.ts`: 1 to 1,000, **30** when unset, as BeatBuddy's.
  An env setting so it can be tuned from the cost dashboard without a release. The production
  number is set at f-launch x4 and recorded against D6.

## The agent

A platform agent (owner ruling, 2026-10-18, journaled on `f-tutor`): registered from
`lib/app/platform-agents.ts`, created by the reconcile in the install org only
(`audience: 'install-only'`), and brought back in line with the definition after every deploy.

| Field              | Value                                                                | Whose                           |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- |
| Visibility         | `internal` (the baseline)                                            | the code's                      |
| Temperature        | 0.4                                                                  | the code's                      |
| Max tokens         | 8,192 (room for a designed sound, the longest reply; see `agent.ts`) | the code's                      |
| Tools              | the four below                                                       | the code's                      |
| Provider and model | none: inherits the org's default at run time                         | the admin's                     |
| Per-turn cap       | **$0.20** to start (BeatBuddy's)                                     | the admin's, set once on create |
| Monthly budget     | **$50** to start                                                     | the admin's, set once on create |

Max tokens is the code's, so an admin cannot lower it, and nothing clamps it to the model's own
output limit: a model that stops at 4,096 output tokens would refuse every tutor call. Choose one
that allows at least 8,192, as Sunrise's provider auditors already need (they ask for 16,384).

The starting caps are placeholders for the admin to tune. The production provider, model and the
learner's daily allowance are decided at `x4` and recorded against D6. Changing the instructions
takes a deploy: the cost the owner accepted for keeping them in step with the tools.

## The tools

| Tool                   | Arguments                                                         | Returns                                                                                                                  | Refuses with                                                 |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `get_panel`            | none                                                              | the controls that differ from init (id, label, value, value as shown), at most 100; the cables, at most 100; the version | `no_panel`, `unknown_synth`, `stale_panel`, `invalid_panel`  |
| `describe_synth`       | `section?`, `prefix?`                                             | `describeSynth` text for the whole synth, a section or a prefix, or an index to narrow by                                | the above, `unknown_section`, `unknown_prefix`               |
| `propose_panel_change` | `set`, `addCables`, `removeCables`                                | the controls that change, the cables, and a row per change (label, from, to, as shown)                                   | the above, `empty_proposal`, `invalid_proposal`, `no_change` |
| `design_sound`         | name, blurb, level, category, how, steps, context, tweaks, phrase | the whole sound as a `Preset`, credited to the tutor, `ai: true`                                                         | the above, `invalid_design`                                  |

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
  context for at most 16. The id is random (`tutor-` and twelve hex digits).
- Every tool's JSON schema says `additionalProperties: false`, as its Zod schema refuses any other
  key, so the model is told rather than refused.
- A refusal lists up to twelve problems, each with its path (`steps.1.set.filter.drive`), then
  how many more there are.
- **No per-tool rate limit.** The dispatcher counts a capability's `rateLimit` per agent, and one
  tutor serves every learner, so any limit there would be a cap for the whole app. The rows leave
  it `null` (unlimited); the tools are pure computation, and a learner's limit is the stream
  route's daily allowance.

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
had no provider configured, and the run was deferred (2026-10-18). Record each run here.

| Date | Provider and model | Turn | Tools called | Cost |
| ---- | ------------------ | ---- | ------------ | ---- |

## Not yet

- **The panel** is t-56. Until it lands only the smoke run calls the routes.
- **Grounding** in the databank and the web, the sourcing rules and the topic boundary are
  `f-tutor-knowledge`. Until then the instructions let the tutor answer general questions about
  synths from its own knowledge, and decline others in one line.
