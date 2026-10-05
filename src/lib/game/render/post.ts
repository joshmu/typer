import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";
import type { JuiceOutput } from "./juice";
import { isSlowRenderer } from "./quality";

export type Post = {
	/** False when the pipeline couldn't be built; updates are then no-ops. */
	readonly active: boolean;
	update(juice: JuiceOutput): void;
	/** Drop MSAA and bloom for good (the frame-time watchdog's first step). */
	shed(): void;
	dispose(): void;
};

// bloom: only the brightest pixels (tracer cores, kill flashes, typed
// ember glyphs) cross the threshold, so the deck and the word ink stay crisp
const BLOOM_THRESHOLD = 0.72;
const BLOOM_KERNEL = 48;
const BLOOM_SCALE = 0.5;

/**
 * Bloom and chromatic aberration, built once with every stage it will use
 * already on, so nothing recompiles mid-run; per frame only uniforms change.
 * Image processing stays with the materials: sprites and the nebula layer
 * never convert to linear, so a post-process grade would wash them out.
 * Reduced motion leaves aberration out entirely. Without WebGL2, or on a
 * software or fallback rasteriser, the scene renders with no post.
 */
export function createPost(
	scene: Scene,
	camera: Camera,
	{ reducedMotion }: { reducedMotion: boolean },
): Post {
	let pipeline: DefaultRenderingPipeline | null = null;
	try {
		const engine = scene.getEngine();
		if (!engine.isWebGPU && engine.version < 2) throw new Error("webgl1");
		const gl = (engine as Engine).getGlInfo?.();
		if (gl && isSlowRenderer(gl.renderer)) throw new Error("slow renderer");
		const hdr = engine.getCaps().textureHalfFloatRender;
		pipeline = new DefaultRenderingPipeline("horde-post", hdr, scene, [camera]);
		pipeline.imageProcessingEnabled = false;
		// the canvas drew with MSAA before the pipeline; keep edges smooth
		pipeline.samples = Math.min(4, engine.getCaps().maxMSAASamples || 1);
		pipeline.bloomEnabled = true;
		pipeline.bloomThreshold = BLOOM_THRESHOLD;
		pipeline.bloomKernel = BLOOM_KERNEL;
		pipeline.bloomScale = BLOOM_SCALE;
		pipeline.bloomWeight = 0.3;
		pipeline.chromaticAberrationEnabled = !reducedMotion;
		if (pipeline.chromaticAberrationEnabled) {
			pipeline.chromaticAberration.aberrationAmount = 0;
			pipeline.chromaticAberration.radialIntensity = 0.6;
		}
	} catch {
		pipeline?.dispose();
		pipeline = null;
	}

	return {
		get active() {
			return pipeline !== null;
		},
		update(juice) {
			if (!pipeline) return;
			if (pipeline.bloomEnabled) {
				pipeline.bloomWeight = juice.bloom;
				pipeline.bloomThreshold = juice.bloomThreshold;
			}
			if (pipeline.chromaticAberrationEnabled) {
				pipeline.chromaticAberration.aberrationAmount = juice.aberration;
			}
		},
		shed() {
			if (!pipeline) return;
			pipeline.samples = 1;
			pipeline.bloomEnabled = false;
		},
		dispose() {
			pipeline?.dispose();
		},
	};
}
