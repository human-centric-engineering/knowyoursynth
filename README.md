# Know Your Synth

**Know Your Synth** teaches sound design on real hardware synths. Each synth's
panel is drawn control for control and played through a sound engine modelled on
it. You can patch it, follow a lesson that builds a sound step by step, see which
knobs matter to the sound you are hearing, and find out which records it was
played on.

It is a companion to [BeatBreaker](https://github.com/human-centric-engineering/beatbreaker),
the break generator and drum practice rig.

> **Built on Sunrise.** Know Your Synth is a leaf app on the
> [Sunrise](https://github.com/human-centric-engineering/sunrise) starter
> template, forked from Sunrise `main` just after **v0.13.0**. Later Sunrise
> releases come in through the `upstream` remote. The platform is extended
> through Sunrise's designed seams (`lib/app/*`, `components/app/*`,
> `prisma/schema/app.prisma`) rather than edited in place, so upgrades stay
> clean merges. Start with [`CUSTOMIZATION.md`](./CUSTOMIZATION.md) if you're
> working in this repo.

## Status

The app is being planned. What exists today is the prototype: a single-page
artefact in [`prototype/`](./prototype/) covering 25 synths, 1,061 sounds with
lessons, and a databank of 184 artists and 248 songs. It is kept as the reference
the app is built from.

- [`prototype/BRIEF.md`](./prototype/BRIEF.md): what we are building, what the
  prototype does, and the questions the plan has to answer.
- [`prototype/CONTRACT.md`](./prototype/CONTRACT.md): the data contract every synth
  definition follows.
- [`prototype/README.md`](./prototype/README.md): a map of the prototype's modules.

## Tech Stack

| Layer          | Technology                           |
| -------------- | ------------------------------------ |
| Framework      | Next.js 16 (App Router) + TypeScript |
| Database       | PostgreSQL + Prisma 7                |
| Authentication | better-auth                          |
| Styling        | Tailwind CSS 4 + shadcn/ui           |
| Audio          | Web Audio API with an AudioWorklet   |
| Validation     | Zod throughout                       |
| Deployment     | Docker-ready                         |

## Quick Start

### Prerequisites

- Node.js 24+ (see `.nvmrc`)
- PostgreSQL 15+ (local, Docker, or hosted)

### Setup

```bash
git clone git@github.com:human-centric-engineering/knowyoursynth.git
cd knowyoursynth

cp .env.example .env.local

# Generate BETTER_AUTH_SECRET
openssl rand -base64 32

# Edit .env.local with your DATABASE_URL and BETTER_AUTH_SECRET

npm install
npm run db:migrate:dev
npm run dev
```

Open http://localhost:3024. The port is set by `PORT` in the committed
`.env.development`, which `npm run dev` reads. Know Your Synth uses **3024**;
Sunrise itself is on 3010 and BeatBreaker on 3022.

### The prototype

```bash
node prototype/build.mjs prototype/dist   # build the single-file page
node prototype/check.mjs model-d          # validate and render one synth's sounds
```

### First admin account

There are **no default credentials**. On a fresh database, the first account you
create at [`/signup`](http://localhost:3024/signup) is promoted to `ADMIN`;
every account after that is a regular `USER`.

## Essential Commands

```bash
npm run dev              # Start dev server (port 3024)
npm run validate         # CHANGELOG + Node version + type-check + lint + format
npm run db:studio        # Open Prisma Studio
npm test                 # Run tests
```

Full command reference: [`.context/commands.md`](./.context/commands.md)

## Staying in sync with Sunrise

```bash
git fetch upstream --tags
git checkout -b chore/sync-sunrise-0.14.0
git merge v0.14.0
```

**Merge the sync PR with a merge commit — never squash it.** Squashing discards
the second parent, so git stops knowing the release tag is in your history and
the next sync replays the entire preceding range. See
[`CUSTOMIZATION.md` §9](./CUSTOMIZATION.md); the `Fork Sync Integrity` workflow
catches it on the next push to `main` and prints the repair.

Know Your Synth's own releases are tagged `knowyoursynth-vX.Y.Z`. Sunrise's `v*`
tags are fetched from `upstream` and are not pushed to this repo's origin.

## License

MIT. See [LICENSE](./LICENSE).
