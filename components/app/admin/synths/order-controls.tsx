/**
 * Moving rows up and down in the catalogue editor (`f-catalogue-admin`): the catalogue, a synth's library, a sound's
 * steps, a lineage's timeline. Buttons rather than drag and drop, so the order can be set from the keyboard and read
 * by a screen reader.
 */
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Move one item of a list up (-1) or down (+1). The list unchanged if that would take it off either end. */
export function move<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

let lastRowKey = 0;
/** A React key for a row the admin can add, move and remove, unique for the page's life. */
export const nextRowKey = () => ++lastRowKey;

interface MoveButtonsProps {
  /** What is moving, for the buttons' names: `Move ${label} up`. */
  label: string;
  index: number;
  length: number;
  disabled?: boolean;
  onMove: (by: -1 | 1) => void;
}

export function MoveButtons({ label, index, length, disabled, onMove }: MoveButtonsProps) {
  return (
    <span className="inline-flex gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === length - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </span>
  );
}
