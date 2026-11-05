/**
 * The app's maintenance jobs (`lib/app/jobs.ts`): what each one's `run` does, inside the tenant scope the tick gives it.
 * Which jobs are registered is pinned by `defaults.test.ts` (HB2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  deleteMany: vi.fn(),
  refreshStats: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { heldUsername: { deleteMany: mocks.deleteMany } },
}));
vi.mock('@/lib/app/bank/knowledge', () => ({ reconcileBankKnowledge: mocks.reconcile }));
vi.mock('@/lib/app/links/stats', () => ({ refreshYouTubeStats: mocks.refreshStats }));

import { getAppJobs, __resetAppJobsForTests } from '@/lib/orchestration/maintenance/app-jobs';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { runAsOrg } from '@/lib/tenancy/context';

const job = (name: string) => {
  const found = getAppJobs().find((j) => j.name === name);
  if (!found) throw new Error(`no job ${name}`);
  return found;
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetAppJobsForTests();
});

describe('app:refresh-link-stats', () => {
  it('refreshes the links’ YouTube counts in the install org, daily', async () => {
    mocks.refreshStats.mockResolvedValue({ videos: 3, updated: 1 });
    const result = await runAsOrg(INSTALL_ORG_ID, () => job('app:refresh-link-stats').run());
    expect(mocks.refreshStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ videos: 3, updated: 1 });
    expect(job('app:refresh-link-stats').intervalMs).toBe(24 * 60 * 60 * 1000);
  });

  it('does nothing in any other org: links are shared, so one run covers everyone', async () => {
    const result = await runAsOrg('org-other', () => job('app:refresh-link-stats').run());
    expect(mocks.refreshStats).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', reason: 'not the install org' });
  });
});

describe('app:project-databank', () => {
  it("reconciles the databank's knowledge documents in the install org", async () => {
    mocks.reconcile.mockResolvedValue({ status: 'done', written: 0 });
    const result = await runAsOrg(INSTALL_ORG_ID, () => job('app:project-databank').run());
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'done', written: 0 });
  });

  it('does nothing in any other org: the databank and the tutor are the install’s', async () => {
    const result = await runAsOrg('org-other', () => job('app:project-databank').run());
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'skipped', reason: 'not the install org' });
  });

  it('runs per org, the default scope, so it has an org to ask about', () => {
    expect(job('app:project-databank').scope).toBeUndefined();
  });
});

describe('app:prune-held-usernames', () => {
  it('deletes the holds that have lapsed and reports the count', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    expect(await job('app:prune-held-usernames').run()).toEqual({ pruned: 3 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { heldUntil: { lte: expect.any(Date) } },
    });
  });
});
