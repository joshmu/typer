import type { ShareCardData } from "./share-card";

export type CopyOutcome = "copied" | "downloaded";

function download(blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `typer-result-${Date.now()}.png`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copy the share card to the clipboard, or download it where images can't be
 * copied. The renderer loads lazily inside the clipboard promise, so the
 * write still counts as part of the click.
 */
export async function copyResultImage(
	data: ShareCardData,
): Promise<CopyOutcome> {
	const blob = import("./share-card").then((m) => m.renderShareCard(data));
	try {
		if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
			throw new Error("Image clipboard unavailable");
		}
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		return "copied";
	} catch {
		download(await blob);
		return "downloaded";
	}
}
