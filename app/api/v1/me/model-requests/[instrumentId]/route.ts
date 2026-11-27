/**
 * The signed-in user's request for one databank instrument to be modelled (`f-synth-picker` t-330).
 *
 * GET    /api/v1/me/model-requests/:instrumentId — `{ instrumentId, asked, count }`: whether they have asked, and how
 *        many have in all.
 * PUT    /api/v1/me/model-requests/:instrumentId — ask. Asking again changes nothing. An instrument the databank does
 *        not have is a 404.
 * DELETE /api/v1/me/model-requests/:instrumentId — withdraw. Withdrawing one never made changes nothing.
 *
 * The section rate limit applies (`proxy.ts`). See `lib/app/picker/model-requests.ts`.
 */
import { withAuth } from '@/lib/auth/guards';
import { errorResponse, successResponse } from '@/lib/api/responses';
import { InstrumentIdSchema } from '@/lib/app/profile/instruments-data';
import { askToModel, getModelRequest, withdrawModelRequest } from '@/lib/app/picker/model-requests';

type Params = { instrumentId: string };

const OWNERSHIP = {
  ownership: {
    decidedBy: 'self',
    because: "Reads and writes only the caller's own request, keyed on `session.user.id`.",
  },
} as const;

const noSuchInstrument = () =>
  errorResponse('The databank has no such instrument', { code: 'NOT_FOUND', status: 404 });

export const GET = withAuth<Params>(async (_request, session, { params }) => {
  const id = InstrumentIdSchema.safeParse((await params).instrumentId);
  if (!id.success) return noSuchInstrument();
  return successResponse(await getModelRequest(session.user.id, id.data));
}, OWNERSHIP);

export const PUT = withAuth<Params>(async (_request, session, { params }) => {
  const id = InstrumentIdSchema.safeParse((await params).instrumentId);
  if (!id.success) return noSuchInstrument();
  return successResponse(await askToModel(session.user.id, id.data));
}, OWNERSHIP);

export const DELETE = withAuth<Params>(async (_request, session, { params }) => {
  const id = InstrumentIdSchema.safeParse((await params).instrumentId);
  if (!id.success) return noSuchInstrument();
  return successResponse(await withdrawModelRequest(session.user.id, id.data));
}, OWNERSHIP);
