import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			grepInvert: /@sound/,
		},
		{
			// key sound on: let the AudioContext run without a user gesture
			name: "chromium-sound",
			use: {
				...devices["Desktop Chrome"],
				launchOptions: {
					args: ["--autoplay-policy=no-user-gesture-required"],
				},
			},
			grep: /@sound/,
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
	},
});
