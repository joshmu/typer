import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), tsconfigPaths(), solidPlugin()],
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
