# The tutor

`f-tutor`. An AI tutor on the synth page that explains the sound on the panel, proposes changes
the learner applies, and designs new sounds with their lesson (D6, plan §8). The prototype's tutor
(`prototype/src/ui/Tutor.jsx`) called Claude through `window.claude` and asked for JSON in the
reply. Here it runs through Sunrise's orchestration. **The model proposes, the server validates,
and the learner applies. The model never writes to the panel.**

t-53 built the agent, its tools and its context. The stream route and the allowance (t-54), a
designed sound kept with its lesson (t-55) and the tutor panel (t-56) build on it.

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
- **Don't edit the instructions in the admin and expect them to stay.** The tutor is a platform
  agent: its instructions, tools and visibility are the code's and are written back after every
  deploy, and the admin's API refuses an edit to them. Provider, model and spend are the admin's.

## Where things are

| Piece                     | Location                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| The agent's definition    | `lib/app/tutor/agent.ts` (`TUTOR_AGENT`, slug `synth-tutor`)                                          |
| The tools                 | `lib/app/tutor/{get-panel,describe-synth,propose-panel-change,design-sound}.ts`, listed in `tools.ts` |
| The panel they read       | `lib/app/tutor/panel.ts` (`TutorEntityContextSchema`, `readPanel()`)                                  |
| The synth context         | `lib/app/tutor/context.ts` (`synthContext()`, `contextType: 'synth'`)                                 |
| Sections and the size cap | `lib/app/tutor/sections.ts`                                                                           |
| Registration              | `lib/app/platform-agents.ts`, `lib/app/capabilities.ts`, `lib/app/context-contributors.ts`            |
| The capability rows       | `prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`                                                   |
| Tests                     | `tests/unit/lib/app/tutor/`                                                                           |
| Smoke run                 | `npm run smoke:tutor` (`scripts/smoke/tutor.ts`)                                                      |

## One turn

1. The tutor panel sends the learner's message and the panel to the app's stream route (t-54).
2. The route validates the panel, checks the allowance, and calls `streamChat()` with
   `agentSlug: 'synth-tutor'`, `contextType: 'synth'`, `contextId` the synth id, and
   `entityContext` `{ synthId, version, panel: { values, cables } }` (`TutorEntityContext`).
3. The system prompt is the tutor's instructions, then the `LOCKED CONTEXT` the contributor builds
   for the synth: its name, what it is, how many controls it has, and its section index. About
   180 tokens for Model D, 260 for the DeepMind, 800 for System 55.
4. The model calls tools. Each reads the panel from `entityContext`; each result goes back to the
   model and out to the page as a `capability_result` event.
5. A proposal or a designed sound reaches the page only as a successful tool result, so only after
   it has passed validation. The page decides how to apply it (t-56).

## The agent

A platform agent (owner ruling, 2026-10-18, journaled on `f-tutor`): registered from
`lib/app/platform-agents.ts`, created by the reconcile in the install org only
(`audience: 'install-only'`), and brought back in line with the definition after every deploy.

| Field              | Value                                                                     | Whose                           |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------- |
| Visibility         | `internal` (the baseline)                                                 | the code's                      |
| Temperature        | 0.4                                                                       | the code's                      |
| Max tokens         | 8,192 (the largest designed sound is over 4,096 tokens of tool arguments) | the code's                      |
| Tools              | the four below                                                            | the code's                      |
| Provider and model | none: inherits the org's default at run time                              | the admin's                     |
| Per-turn cap       | **$0.20** to start (BeatBuddy's)                                          | the admin's, set once on create |
| Monthly budget     | **$50** to start                                                          | the admin's, set once on create |

The starting caps are placeholders for the admin to tune. The production provider, model and the
learner's daily allowance are decided at `x4` and recorded against D6. Changing the instructions
takes a deploy: the cost the owner accepted for keeping them in step with the tools.

## The tools

| Tool                   | Arguments                                                         | Returns                                                                                                     | Refuses with                                                |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `get_panel`            | none                                                              | the controls that differ from init (id, label, value, value as shown), at most 100; the cables; the version | `no_panel`, `unknown_synth`, `stale_panel`, `invalid_panel` |
| `describe_synth`       | `section?`, `prefix?`                                             | `describeSynth` text for the whole synth, a section or a prefix, or an index to narrow by                   | the above, `unknown_section`, `unknown_prefix`              |
| `propose_panel_change` | `set`, `addCables`, `removeCables`                                | the controls that change, the cables, and a row per change (label, from, to, as shown)                      | the above, `invalid_proposal`, `no_change`                  |
| `design_sound`         | name, blurb, level, category, how, steps, context, tweaks, phrase | the whole sound as a `Preset`, credited to the tutor, `ai: true`                                            | the above, `invalid_design`                                 |

- **`propose_panel_change`** runs `checkSettings` on `set` and `checkCables` on `addCables`, then
  checks against the panel: a cable to remove must be in, a cable to add must not be (nor listed
  twice, nor also removed), and something must change. A control already at the proposed value is
  left out of the result. At most 64 controls and 16 cables each way.
- **`design_sound`** builds the sound the way `sanitizePreset` did (id `tutor-…`, ref, artist
  `AI tutor`, tags `[category, 'ai']`, a looping phrase) and runs `validatePreset`. The prototype's
  limits refuse rather than clamp: 1–9 steps, each setting a control or plugging a cable; up to 5
  tweaks; 1–32 riff notes of `[beat 0–16, MIDI 24–96, length 0.05–16]` at 40–180 bpm; the string
  lengths `sanitizePreset` cut to.
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

- **No arguments.** The whole synth when it describes in 8,000 characters or fewer: the 21 small
  synths, in one call. Otherwise the section index (155 tokens for the DeepMind). The context
  already tells the model which of the two it will get.
- **A section** (an area id) returns what is in it. **A prefix** returns the controls whose ids are
  it or continue it after a dot. Both together narrow both ways.
- **Too big to list**, it returns the ids one dot-segment deeper, each with a count and example
  labels, and describes in full any that are single controls. The DeepMind's `display` section
  holds 1,514 of its 1,568 controls, almost all the four FX slots' 373 parameters each. So
  `section: 'display'` gives the groups (329 tokens), `prefix: 'fx1'` gives `fx1.type` in full
  with every effect it can hold and one group per effect (1,670 tokens), and
  `prefix: 'fx1.tc-deepvrb'` gives that effect's parameters (192 tokens).

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

`npm run smoke:tutor` runs real turns through `streamChat()` against the dev database with the
configured provider: "Make this sound darker" on Model D, and one change on the DeepMind. Each must
end in a proposal that passes `validateSound` on the panel it was made against, and log a cost
above zero. Unlike the other smoke scripts it calls the real provider: the logged cost is the
check, and it is also the check that Sunrise 0.14's fix to #813 (the agent resolver loads the
model registry) leaves BeatBuddy's `hydrateFromDb()` workaround unneeded.

It needs `npm run db:seed` (the tool rows and the tutor, bound), an active provider whose key is
in `.env.local`, and a default chat model. **Not run yet:** when t-53 was built the dev database
had no provider configured, and the run was deferred (2026-10-18). Record each run here.

| Date | Provider and model | Turn | Tools called | Cost |
| ---- | ------------------ | ---- | ------------ | ---- |

## Not yet

- **The route, the allowance and the panel** are t-54 and t-56. Until t-54 lands nothing calls
  the tutor.
- **Grounding** in the databank and the web, the sourcing rules and the topic boundary are
  `f-tutor-knowledge`. Until then the instructions let the tutor answer general questions about
  synths from its own knowledge, and decline others in one line.
