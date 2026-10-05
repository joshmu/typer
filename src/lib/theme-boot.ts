import { THEME_CSS_VARS, themes } from "./themes";

/** The localStorage key the preferences store persists under. */
export const PREFERENCES_KEY = "typer-preferences";

/**
 * A tiny inline script for index.html that paints the stored theme before
 * first paint, so a saved theme never flashes the default. The app applies the
 * same theme again once it mounts. No stored or unknown theme leaves the CSS
 * default in place.
 */
export function themeBootScript(): string {
	const vars: Record<string, Record<string, string>> = {};
	for (const [name, theme] of Object.entries(themes)) {
		vars[name] = Object.fromEntries(
			THEME_CSS_VARS.map(([key, cssVar]) => [cssVar, theme[key]]),
		);
	}
	return `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_KEY)})||"{}").theme;var m=${JSON.stringify(vars)};if(!Object.prototype.hasOwnProperty.call(m,t))return;var v=m[t];var r=document.documentElement;r.setAttribute("data-theme",t);for(var k in v)r.style.setProperty(k,v[k]);}catch(e){}})();`;
}
