export default {
	"*.{ts,tsx,js,mjs,json,css}": [
		"biome check --write --no-errors-on-unmatched",
	],
	"*.md": ["markdownlint-cli2"],
};
