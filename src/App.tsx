import type { RouteSectionProps } from "@solidjs/router";
import RootLayout from "./components/layout/RootLayout";
import { PreferencesProvider } from "./lib/preferences-context";

export default function App(props: RouteSectionProps) {
	return (
		<PreferencesProvider>
			<RootLayout>{props.children}</RootLayout>
		</PreferencesProvider>
	);
}
