import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Layer } from "@babylonjs/core/Layers/layer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Scene } from "@babylonjs/core/scene";
import { createGroundDecals, type GroundDecals } from "./ground-decals";

export type GameScene = {
	engine: Engine;
	scene: Scene;
	glow: GlowLayer;
	/** Crimsonland-style battlefield persistence: stamp corpse/breach decals
	 * baked straight into the ground texture (no live entities). */
	ground: GroundDecals;
	dispose(): void;
};

export function createGameScene(
	canvas: HTMLCanvasElement,
	opts: { preserveDrawingBuffer: boolean },
): GameScene {
	const engine = new Engine(canvas, true, {
		preserveDrawingBuffer: opts.preserveDrawingBuffer,
	});
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.02, 0.02, 0.04, 1);

	// TRUE overhead orthographic top-down (Crimsonland is flat 2D, not perspective):
	// beta ~0 looks straight down the +Y axis, and ORTHOGRAPHIC mode removes all
	// foreshortening so ground tiles stay uniform edge-to-edge and sprites read as a
	// flat plane. alpha is held at -π/2 (unchanged from the old camera) so the
	// on-screen orientation the ground decals were verified against is preserved.
	const camera = new ArcRotateCamera(
		"cam",
		-Math.PI / 2,
		0.0001, // effectively straight down; a hair off-axis avoids gimbal degeneracy
		55,
		Vector3.Zero(),
		scene,
	);
	camera.inputs.clear(); // fixed camera — typing is the only input
	camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
	camera.minZ = -200; // ortho: keep the whole flat field within the clip range
	camera.maxZ = 400;
	// ORTHO_HALF is the world half-height the frame shows; the ~34-unit spawn ring
	// then sits ~90% toward the top/bottom edge. Left/right follow the viewport
	// aspect so world cells stay SQUARE on screen (no stretch) at any window size.
	const ORTHO_HALF = 38;
	function applyOrtho(): void {
		// guard the aspect against a degenerate render size: a zero height yields
		// width/0 = Infinity (truthy, so `|| 1` would NOT catch it), and a zero
		// width or NaN dim yields NaN — any non-finite or non-positive dimension
		// falls back to a square (aspect 1) rather than corrupting the frustum.
		const w = engine.getRenderWidth();
		const h = engine.getRenderHeight();
		const aspect =
			w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) ? w / h : 1;
		camera.orthoTop = ORTHO_HALF;
		camera.orthoBottom = -ORTHO_HALF;
		camera.orthoLeft = -ORTHO_HALF * aspect;
		camera.orthoRight = ORTHO_HALF * aspect;
	}
	applyOrtho();
	// recompute the ortho frustum every frame from the LIVE render size: the canvas
	// may not have settled to its final CSS size at creation, and in testMode no
	// window resize ever fires to correct a stale aspect — so an edge-to-edge floor
	// (and square cells) is only guaranteed by re-deriving the bounds each frame.
	// Cheap (four assignments) and keeps the view correct through any resize.
	scene.onBeforeRenderObservable.add(applyOrtho);
	// also resize the drawing buffer on a real window resize so it tracks the canvas
	const onResize = () => engine.resize();
	window.addEventListener("resize", onResize);

	new HemisphericLight("light", new Vector3(0, 1, 0), scene);

	// nebula backdrop: a fullscreen background layer so the corners beyond the
	// floor disc read as deep space rather than flat black. A 2D background is the
	// right tool for a fixed top-down camera (no parallax needed) and avoids the
	// minification washout a giant textured skydome suffers at this scale.
	const nebula = new Layer("nebula", "/game/nebula.png", scene, true);
	nebula.color = new Color4(0.85, 0.85, 0.9, 1); // gently dim the backdrop

	// large enough to fill the frame edge-to-edge under the ortho frustum (vertical
	// ±38, horizontal ±38·aspect) so the floor reads as a full-bleed Crimsonland
	// battlefield rather than an arena disc floating in space. The disc must reach
	// the frustum CORNER, at distance sqrt(38² + (38·aspect)²) = 38·√(1+aspect²)
	// from centre; radius 145 covers aspect ≈ √((145/38)² − 1) ≈ 3.6:1 canvases
	// (145 = 38·√(1+3.6²)), up from the old 100 which only reached ~2.4:1.
	const GROUND_RADIUS = 145;
	const ground = CreateDisc(
		"ground",
		{ radius: GROUND_RADIUS, tessellation: 96 },
		scene,
	);
	ground.rotation.x = Math.PI / 2;
	const groundMat = new StandardMaterial("groundMat", scene);
	// split the floor brightness ~half lit / half self-emissive so the pixel
	// terrain shows at roughly its authored value without the two contributions
	// stacking and clipping the bright metal plates toward white
	groundMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
	groundMat.specularColor = Color3.Black();
	groundMat.backFaceCulling = false; // never a blank floor if the disc faces away
	// diffuse is a DynamicTexture: the pixel terrain is baked into it once loaded
	// and corpse/breach decals are stamped straight in — persistent battlefield
	// scarring with zero live entities and no per-frame cost (Crimsonland technique)
	const groundDecals = createGroundDecals(scene, GROUND_RADIUS);
	groundMat.diffuseTexture = groundDecals.texture;
	// same map drives the emissive so the flat floor reads at an even, consistent
	// brightness regardless of lighting angle (and the chunky pixels stay crisp);
	// the decals are dark so they still read as scars, not glowing marks.
	groundMat.emissiveTexture = groundDecals.texture;
	groundMat.emissiveColor = new Color3(0.5, 0.5, 0.5);
	ground.material = groundMat;

	// bloom for gameplay emissives (turret core, tracers, enemy tints, powerups).
	// A modest blur kernel keeps it affordable on the swiftshader CI runner.
	const glow = new GlowLayer("glow", scene, { blurKernelSize: 16 });
	glow.intensity = 0.6;
	// the floor is already lit by its own emissive texture — excluding it keeps
	// the bloom on the things that should pop and off the big surface
	glow.addExcludedMesh(ground);

	// the player is a layered turret (render/turret.ts) built by the loop, not a
	// static cone — so nothing more is added here.

	return {
		engine,
		scene,
		glow,
		ground: groundDecals,
		dispose() {
			window.removeEventListener("resize", onResize);
			glow.dispose();
			nebula.dispose();
			groundDecals.dispose();
			scene.dispose();
			engine.dispose();
		},
	};
}
