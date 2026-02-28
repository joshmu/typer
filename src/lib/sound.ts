let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

function playTone(frequency: number, duration: number, volume: number) {
	const ctx = getContext();
	const oscillator = ctx.createOscillator();
	const gainNode = ctx.createGain();

	oscillator.type = "sine";
	oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
	gainNode.gain.setValueAtTime(volume, ctx.currentTime);
	gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

	oscillator.connect(gainNode);
	gainNode.connect(ctx.destination);

	oscillator.start(ctx.currentTime);
	oscillator.stop(ctx.currentTime + duration);
}

export function playKeySound() {
	playTone(800, 0.05, 0.03);
}

export function playErrorSound() {
	playTone(300, 0.08, 0.04);
}
