import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tailwindcss(), tsconfigPaths(), solidPlugin()],
	server: {
		port: 3000,
	},
	build: {
		target: "esnext",
	},
});
