export interface Theme {
	name: string;
	label: string;
	bg: string;
	bgSecondary: string;
	text: string;
	textSub: string;
	primary: string;
	error: string;
	errorExtra: string;
	caret: string;
	correct: string;
}

const serikaDark: Theme = {
	name: "serika-dark",
	label: "Serika Dark",
	bg: "#323437",
	bgSecondary: "#2c2e31",
	text: "#d1d0c5",
	textSub: "#646669",
	primary: "#e2b714",
	error: "#ca4754",
	errorExtra: "#7e2a33",
	caret: "#e2b714",
	correct: "#d1d0c5",
};

const serikaLight: Theme = {
	name: "serika-light",
	label: "Serika Light",
	bg: "#e1e1e3",
	bgSecondary: "#d1d1d3",
	text: "#323437",
	textSub: "#aaaeb3",
	primary: "#e2b714",
	error: "#ca4754",
	errorExtra: "#7e2a33",
	caret: "#e2b714",
	correct: "#323437",
};

const dracula: Theme = {
	name: "dracula",
	label: "Dracula",
	bg: "#282a36",
	bgSecondary: "#21222c",
	text: "#f8f8f2",
	textSub: "#6272a4",
	primary: "#bd93f9",
	error: "#ff5555",
	errorExtra: "#8b0000",
	caret: "#bd93f9",
	correct: "#f8f8f2",
};

const monokai: Theme = {
	name: "monokai",
	label: "Monokai",
	bg: "#272822",
	bgSecondary: "#1e1f1c",
	text: "#f8f8f2",
	textSub: "#75715e",
	primary: "#a6e22e",
	error: "#f92672",
	errorExtra: "#8b0045",
	caret: "#a6e22e",
	correct: "#f8f8f2",
};

const nord: Theme = {
	name: "nord",
	label: "Nord",
	bg: "#2e3440",
	bgSecondary: "#272c36",
	text: "#d8dee9",
	textSub: "#4c566a",
	primary: "#88c0d0",
	error: "#bf616a",
	errorExtra: "#8b3a42",
	caret: "#88c0d0",
	correct: "#d8dee9",
};

const solarizedDark: Theme = {
	name: "solarized-dark",
	label: "Solarized Dark",
	bg: "#002b36",
	bgSecondary: "#073642",
	text: "#839496",
	textSub: "#586e75",
	primary: "#b58900",
	error: "#dc322f",
	errorExtra: "#8b1a18",
	caret: "#b58900",
	correct: "#839496",
};

const tokyoNight: Theme = {
	name: "tokyo-night",
	label: "Tokyo Night",
	bg: "#1a1b26",
	bgSecondary: "#16161e",
	text: "#a9b1d6",
	textSub: "#565f89",
	primary: "#7aa2f7",
	error: "#f7768e",
	errorExtra: "#8b3a4a",
	caret: "#7aa2f7",
	correct: "#a9b1d6",
};

const catppuccinMocha: Theme = {
	name: "catppuccin-mocha",
	label: "Catppuccin Mocha",
	bg: "#1e1e2e",
	bgSecondary: "#181825",
	text: "#cdd6f4",
	textSub: "#585b70",
	primary: "#cba6f7",
	error: "#f38ba8",
	errorExtra: "#8b4560",
	caret: "#cba6f7",
	correct: "#cdd6f4",
};

const gruvboxDark: Theme = {
	name: "gruvbox-dark",
	label: "Gruvbox Dark",
	bg: "#282828",
	bgSecondary: "#1d2021",
	text: "#ebdbb2",
	textSub: "#665c54",
	primary: "#fabd2f",
	error: "#fb4934",
	errorExtra: "#8b2820",
	caret: "#fabd2f",
	correct: "#ebdbb2",
};

const oneDark: Theme = {
	name: "one-dark",
	label: "One Dark",
	bg: "#282c34",
	bgSecondary: "#21252b",
	text: "#abb2bf",
	textSub: "#5c6370",
	primary: "#61afef",
	error: "#e06c75",
	errorExtra: "#8b4046",
	caret: "#61afef",
	correct: "#abb2bf",
};

const rosePine: Theme = {
	name: "rose-pine",
	label: "Rose Pine",
	bg: "#191724",
	bgSecondary: "#1f1d2e",
	text: "#e0def4",
	textSub: "#6e6a86",
	primary: "#c4a7e7",
	error: "#eb6f92",
	errorExtra: "#8b4058",
	caret: "#c4a7e7",
	correct: "#e0def4",
};

const carbonDark: Theme = {
	name: "carbon-dark",
	label: "Carbon Dark",
	bg: "#161616",
	bgSecondary: "#1e1e1e",
	text: "#f4f4f4",
	textSub: "#525252",
	primary: "#0f62fe",
	error: "#da1e28",
	errorExtra: "#8b1218",
	caret: "#0f62fe",
	correct: "#f4f4f4",
};

export const themes: Record<string, Theme> = {
	"serika-dark": serikaDark,
	"serika-light": serikaLight,
	dracula,
	monokai,
	nord,
	"solarized-dark": solarizedDark,
	"tokyo-night": tokyoNight,
	"catppuccin-mocha": catppuccinMocha,
	"gruvbox-dark": gruvboxDark,
	"one-dark": oneDark,
	"rose-pine": rosePine,
	"carbon-dark": carbonDark,
};

export const themeNames = Object.keys(themes);

export function getTheme(name: string): Theme {
	return themes[name] ?? themes["serika-dark"];
}

export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	root.setAttribute("data-theme", theme.name);
	root.style.setProperty("--bg", theme.bg);
	root.style.setProperty("--bg-secondary", theme.bgSecondary);
	root.style.setProperty("--text", theme.text);
	root.style.setProperty("--text-sub", theme.textSub);
	root.style.setProperty("--primary", theme.primary);
	root.style.setProperty("--error", theme.error);
	root.style.setProperty("--error-extra", theme.errorExtra);
	root.style.setProperty("--caret", theme.caret);
	root.style.setProperty("--correct", theme.correct);
}
