/* @refresh reload */

import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import "./styles/app.css";
import App from "./App";

const Home = lazy(() => import("./routes/Home"));
const About = lazy(() => import("./routes/About"));

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		"Root element not found. Did you forget to add it to your index.html?",
	);
}

render(
	() => (
		<Router root={App}>
			<Route path="/" component={Home} />
			<Route path="/about" component={About} />
		</Router>
	),
	root!,
);
