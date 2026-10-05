import tailwindcss from "@tailwindcss/vite";
import type { ProxyOptions } from "vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { SE_ORIGIN, SE_PROXY_PATH } from "./src/lib/core/text/se-source.ts";

// Mirrors the /se rewrite in vercel.json. The trailing slash keeps /settings out.
const seProxy: Record<string, ProxyOptions> = {
	[`${SE_PROXY_PATH}/`]: {
		target: SE_ORIGIN,
		changeOrigin: true,
		rewrite: (path) => path.slice(SE_PROXY_PATH.length),
	},
};

export default defineConfig({
	plugins: [tailwindcss(), tsconfigPaths(), solidPlugin()],
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
