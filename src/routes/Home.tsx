import { createSignal, Show } from "solid-js";
import TextInputModal from "@/components/typing/TextInputModal";
import TypingTest from "@/components/typing/TypingTest";

export default function Home() {
	const [text, setText] = createSignal<string | null>(null);

	return (
		<main class="flex flex-col items-center justify-center flex-1 px-8 py-12">
			<Show
				when={text()}
				fallback={<TextInputModal onSubmit={(t) => setText(t)} />}
			>
				{(t) => <TypingTest text={t()} onRestart={() => setText(null)} />}
			</Show>
		</main>
	);
}
