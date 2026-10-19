/**
 * A fact only the owner can supply (the contact address, the origin story, and on the legal pages the entity and the
 * region), shown as `[OWNER: …]` until it is filled in. Visible on purpose: a page that went live with one of these
 * unfilled should look unfinished, not plausible. The f-launch legal review replaces every one of them.
 *
 * `grep -rn "OwnerField" components/app` lists what is left.
 */
export function OwnerField({ children }: { children: string }) {
  return (
    <mark className="bg-amber-100 px-1 text-amber-950 dark:bg-amber-900 dark:text-amber-50">
      [OWNER: {children}]
    </mark>
  );
}
