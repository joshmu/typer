import { createSignal } from "solid-js";

interface TextInputModalProps {
	onSubmit: (text: string) => void;
}

export default function TextInputModal(props: TextInputModalProps) {
	const [text, setText] = createSignal("");

	function handleSubmit(e: Event) {
		e.preventDefault();
		const trimmed = text().trim();
		if (trimmed.length > 0) {
			props.onSubmit(trimmed);
		}
	}

	return (
		<div class="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto">
			<h2 class="font-display text-xl text-text-sub">Paste your text to begin</h2>
			<form onSubmit={handleSubmit} class="w-full flex flex-col gap-4">
				<textarea
					class="w-full h-40 bg-bg-secondary text-text border border-text-sub/20 rounded-lg p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
					placeholder="Paste or type your text here..."
					value={text()}
					onInput={(e) => setText(e.currentTarget.value)}
					autofocus
					data-testid="text-input"
				/>
				<button
					type="submit"
					class="self-center px-8 py-3 bg-primary text-bg rounded-lg font-bold text-lg hover:opacity-80 disabled:opacity-40 btn-glow"
					disabled={text().trim().length === 0}
					data-testid="start-button"
				>
					Start
				</button>
			</form>
		</div>
	);
}
