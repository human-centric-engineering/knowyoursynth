/**
 * The faces and type classes the marketing pages use (`site-copy.md` §6, "Type from the frame"): Instrument Sans for
 * text (`kys-frame`), Michroma for display headings (`kys-display`), Barlow Semi Condensed for the faceplate-legend
 * labels (`kys-label`) and JetBrains Mono for years. The `(public)` layout is Sunrise's, so each page imports these
 * itself, as Explore does, rather than through a layout. The home page's panel names the same faces in its SVG.
 */

import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/archivo-narrow/latin-500.css';
import '@fontsource/archivo-narrow/latin-700.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/instrument-sans/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/shell/panel-frame.css';
import '@/components/app/synth/synth.css';
