import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color3, Color4 } from "@babylonjs/core/Maths/math";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";
import type { JuiceOutput } from "./juice";

/** A status grade washing in from the screen edges, 0..1 each. */
export type StatusTint = { freeze: number; slow: number };

export type Post = {
	/** False when the pipeline couldn't be built; updates are then no-ops. */
	readonly active: boolean;
	update(juice: JuiceOutput, tint: StatusTint): void;
	dispose(): void;
};

// bloom: only the brightest pixels (tracer cores, kill flashes, typed
// ember glyphs) cross the threshold, so the deck and the word ink stay crisp
const BLOOM_THRESHOLD = 0.72;
const BLOOM_KERNEL = 48;
const BLOOM_SCALE = 0.5;
// status grade: a multiply vignette that is invisible at weight 0
const TINT_FOV = 1.1;
const TINT_WEIGHT = 2.6;
const FREEZE = new Color3(0.45, 0.8, 1.35);
const SLOW = new Color3(1.3, 0.85, 0.35);
// renderer strings of software GL (e.g. headless CI): no post there
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software/i;

/**
 * Bloom, chromatic aberration and the freeze/slow grade. Built once with every
 * stage it will ever use already on, so nothing recompiles mid-run; per frame
 * only uniforms change. Reduced motion leaves aberration out entirely. Without
 * WebGL2, or on a software rasteriser, the scene renders with no post.
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
		// a software rasteriser can't afford full-screen passes every frame
		const gl = (engine as Engine).getGlInfo?.();
		if (gl && SOFTWARE_GL.test(gl.renderer)) {
			throw new Error("software renderer");
		}
		const hdr = engine.getCaps().textureHalfFloatRender;
		pipeline = new DefaultRenderingPipeline("horde-post", hdr, scene, [camera]);
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
		pipeline.imageProcessingEnabled = true;
		const ip = pipeline.imageProcessing;
		ip.toneMappingEnabled = false;
		ip.vignetteEnabled = true;
		ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
		ip.vignetteCameraFov = TINT_FOV;
		ip.vignetteWeight = 0;
		ip.vignetteColor = new Color4(1, 1, 1, 0);
	} catch {
		pipeline?.dispose();
		pipeline = null;
	}

	const tint = new Color3();
	return {
		get active() {
			return pipeline !== null;
		},
		update(juice, status) {
			if (!pipeline) return;
			pipeline.bloomWeight = juice.bloom;
			if (pipeline.chromaticAberrationEnabled) {
				pipeline.chromaticAberration.aberrationAmount = juice.aberration;
			}
			const amount = Math.max(status.freeze, status.slow);
			const ip = pipeline.imageProcessing;
			ip.vignetteWeight = TINT_WEIGHT * amount;
			if (amount > 0) {
				// freeze wins over slow
				tint.copyFrom(status.freeze >= status.slow ? FREEZE : SLOW);
				ip.vignetteColor.set(tint.r, tint.g, tint.b, 0);
			}
		},
		dispose() {
			pipeline?.dispose();
		},
	};
}
