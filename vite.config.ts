import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, type Plugin } from "vitest/config";
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

export default defineConfig({
	plugins: [themeBoot(), tailwindcss(), tsconfigPaths(), solidPlugin()],
	server: {
		port: 3000,
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
