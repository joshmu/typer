import { createSignal } from "solid-js";

/** Module-level signal for immersive typing focus mode */
export const [isTypingActive, setTypingActive] = createSignal(false);
