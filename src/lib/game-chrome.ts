import { createSignal } from "solid-js";

/** True while a Horde run is live; the site header steps out of the way. */
export const [isRunLive, setRunLive] = createSignal(false);
