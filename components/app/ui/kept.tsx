'use client';

/**
 * Keep a piece of the page alive while it moves in and out of view (`f-phone-and-tablet` t-66).
 *
 * A bottom sheet unmounts what is inside it when it closes. Some of what goes in one must not stop when it does: the
 * tutor aborts an answer it is streaming when it unmounts, and the lesson's highlight on the panel goes with it. So the
 * piece renders once, through a portal, into a node of its own (`useKeptNode`), and the sheet holds a slot that node is
 * put into while it is open (`KeptSlot`). Closed, the node is out of the document and what is in it keeps its state.
 */

import { useCallback, useEffect, useState } from 'react';

/** A node to portal into, made after mount: `null` on the server and on the first render. */
export function useKeptNode(): HTMLDivElement | null {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const div = document.createElement('div');
    // Laid out as if what is in it were in the slot itself, so it can fill the slot.
    div.style.display = 'contents';
    setNode(div);
    return () => div.remove();
  }, []);
  return node;
}

/** Where a kept node shows while this is mounted. */
export function KeptSlot({ node, className }: { node: HTMLDivElement | null; className?: string }) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !node) return undefined;
      el.appendChild(node);
      return () => node.remove();
    },
    [node]
  );
  return <div ref={ref} className={className} />;
}
