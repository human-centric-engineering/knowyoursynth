/**
 * The faceplate's static renderer, from the bundle `npm run build:panel-renderer` writes before `dev` and `build`
 * (`panel-render-entry.tsx` says why it is a bundle). Tests mock this module with the entry itself.
 */
export { renderPanel } from '@/components/app/sharing/generated/panel-render.mjs';
