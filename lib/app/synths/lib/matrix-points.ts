import type {
  Control,
  ControlOption,
  ControlValue,
  ControlValues,
  SelectControl,
} from '@/lib/app/synths/contract';

/** One value a click on a matrix point sets: the chosen point (the select) or a point's amount. */
export interface MatrixSet {
  id: string;
  value: ControlValue;
}

/**
 * The matrix point to pick so a pointed-at control can be seen: the first of `ids` that is hidden only because a
 * modulation matrix (`SelectControl.matrix`) has another point picked. Search, the tour or a lesson pointing at the
 * MicroFreak's LFO > Pitch amount picks LFO > Pitch, so its knob is the one on the Matrix encoder. Null when none is.
 */
export function pointToShow(
  controls: readonly Control[],
  ids: readonly string[],
  values: ControlValues
): MatrixSet | null {
  for (const id of ids) {
    const c = controls.find((x) => x.id === id);
    const show = c?.show;
    if (!show || Array.isArray(show) || !('eq' in show) || values[show.id] === show.eq) continue;
    const mode = controls.find((x) => x.id === show.id);
    if (mode?.type === 'select' && mode.matrix) return { id: mode.id, value: show.eq };
  }
  return null;
}

/** `values` with `pick` applied, for drawing: the same object when there is nothing to change. */
export function withPick(values: ControlValues, pick: MatrixSet | null): ControlValues {
  return pick && values[pick.id] !== pick.value ? { ...values, [pick.id]: pick.value } : values;
}

/**
 * What a click on one point of a modulation matrix (`SelectControl.matrix`, the MicroFreak) sets, in order. A point at 0
 * is switched on at `matrix.on` and chosen; a point that is on is chosen, so the Matrix encoder sets its amount; the
 * chosen point, when on, is switched off. A point is "on" while its amount is not 0, which is when its lamp lights.
 */
export function matrixClick(
  c: SelectControl,
  o: ControlOption,
  values: ControlValues
): MatrixSet[] {
  const choose: MatrixSet = { id: c.id, value: o.v };
  if (!c.matrix || !o.point) return [choose];
  const amount = values[o.point];
  const on = typeof amount === 'number' && amount !== 0;
  if (!on) return [{ id: o.point, value: c.matrix.on }, choose];
  if (values[c.id] === o.v) return [{ id: o.point, value: 0 }];
  return [choose];
}
