export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-empty": [2, "never"],
		"scope-enum": [
			2,
			"always",
			[
				"scaffold",
				"engine",
				"calc",
				"text",
				"types",
				"typing",
				"results",
				"settings",
				"layout",
				"theme",
				"db",
				"prefs",
				"ci",
				"deploy",
				"e2e",
				"deps",
			],
		],
	},
};
