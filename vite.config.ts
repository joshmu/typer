import { Agent } from "node:https";
import tailwindcss from "@tailwindcss/vite";
import type { ProxyOptions } from "vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, type Plugin } from "vitest/config";
import { SE_ORIGIN, SE_PROXY_PATH } from "./src/lib/core/text/se-source.ts";
import { themeBootScript } from "./src/lib/theme-boot";

/** Paints the stored theme from an inline head script, before first paint. */
function themeBoot(): Plugin {
	return {
		name: "typer-theme-boot",
		transformIndexHtml: () => [
			{ tag: "script", children: themeBootScript(), injectTo: "head" },
		],
	};
}

// Mirrors the /se rewrite in vercel.json. The trailing slash keeps /settings out.
const seProxy: Record<string, ProxyOptions> = {
	[`${SE_PROXY_PATH}/`]: {
		target: SE_ORIGIN,
		changeOrigin: true,
		// Node's 250ms default per address is too short for a slow IPv4
		// connect when IPv6 is unreachable; every request would 502.
		agent: new Agent({ keepAlive: true, autoSelectFamilyAttemptTimeout: 1000 }),
		rewrite: (path) => path.slice(SE_PROXY_PATH.length),
	},
};

export default defineConfig({
	plugins: [themeBoot(), tailwindcss(), tsconfigPaths(), solidPlugin()],
	server: {
		port: 3000,
		proxy: seProxy,
	},
	preview: {
		proxy: seProxy,
	},
	build: {
		target: "esnext",
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test-setup.ts"],
		exclude: ["e2e/**", "node_modules/**"],
	},
});
