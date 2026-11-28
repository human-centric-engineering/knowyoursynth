import type {
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
