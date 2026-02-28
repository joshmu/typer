import { lazy } from "solid-js";
import { Route } from "@solidjs/router";
import RootLayout from "./components/layout/RootLayout";

const Home = lazy(() => import("./routes/Home"));
const About = lazy(() => import("./routes/About"));

export default function App() {
	return (
		<RootLayout>
			<Route path="/" component={Home} />
			<Route path="/about" component={About} />
		</RootLayout>
	);
}
