import type { RouteSectionProps } from "@solidjs/router";
import RootLayout from "./components/layout/RootLayout";

export default function App(props: RouteSectionProps) {
	return <RootLayout>{props.children}</RootLayout>;
}
