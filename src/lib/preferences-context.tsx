import {
	createContext,
	createEffect,
	type ParentProps,
	useContext,
} from "solid-js";
import type { SetStoreFunction, Store } from "solid-js/store";
import {
	createPreferences,
	typingFontSize,
	type UserPreferences,
} from "@/lib/preferences";
import { applyTheme, getTheme } from "@/lib/themes";

type PreferencesContextValue = [
	Store<UserPreferences>,
	SetStoreFunction<UserPreferences>,
];

const PreferencesContext = createContext<PreferencesContextValue>();

export function PreferencesProvider(props: ParentProps) {
	const [prefs, setPrefs] = createPreferences();

	createEffect(() => {
		applyTheme(getTheme(prefs.theme));
		document.documentElement.style.setProperty(
			"--typing-font-size",
			`${typingFontSize(prefs.fontSize)}px`,
		);
	});

	return (
		<PreferencesContext.Provider value={[prefs, setPrefs]}>
			{props.children}
		</PreferencesContext.Provider>
	);
}

export function usePreferences(): PreferencesContextValue {
	const ctx = useContext(PreferencesContext);
	if (!ctx)
		throw new Error("usePreferences must be used within PreferencesProvider");
	return ctx;
}
