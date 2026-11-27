import { DARK_QUERY, THEME_STORAGE_KEY } from './theme';

/**
 * Sets `data-theme` on `<html>` before the first paint, so a dark page never
 * flashes light. It runs as a blocking inline script in `<head>`, before React
 * hydrates, with the same rules as `theme.ts`: a stored `light` or `dark` wins,
 * anything else follows `prefers-color-scheme`. Every failure falls back to light.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,c=null;try{c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var t=c==='light'||c==='dark'?c:'light';if(t!==c)try{if(matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches)t='dark'}catch(e){}d.setAttribute('data-theme',t)})();`;

/** Render first in `<head>` of the root layout. */
export function ThemeScript() {
  return <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
