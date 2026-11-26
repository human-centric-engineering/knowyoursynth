/** Where the synth family admin pages are (`f-synth-families` t-323): the list, or one family. */
export const familyAdminPath = (id?: string): string =>
  id
    ? `/admin/synths/catalogue/families/${encodeURIComponent(id)}`
    : '/admin/synths/catalogue/families';
