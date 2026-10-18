/**
 * App capability (agent tool) registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `registerBuiltInCapabilities()` calls this once before the first
 * agent dispatch (server route-handler runtime). Add
 * `registerAppCapability(new YourTool())` calls (your tools extend
 * `BaseCapability`).
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/orchestration/capabilities.md
 */
import { TUTOR_TOOLS } from '@/lib/app/tutor/tools';
import { registerAppCapability } from '@/lib/orchestration/capabilities/registry';

/**
 * Know Your Synth: the tutor's tools (`f-tutor` t-53). Each needs its capability row and a binding to the tutor
 * before a model sees it: the rows are seeded by `prisma/seeds/app-knowyoursynth/003-tutor-tools.ts` from these same
 * classes, and the binding is the platform-agent reconcile's (`lib/app/tutor/agent.ts`).
 */
export function initAppCapabilities(): void {
  for (const tool of TUTOR_TOOLS) registerAppCapability(tool);
}
