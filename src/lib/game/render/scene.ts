import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Layer } from "@babylonjs/core/Layers/layer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Scene } from "@babylonjs/core/scene";

export type GameScene = {
	engine: Engine;
	scene: Scene;
	glow: GlowLayer;
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

	// near-vertical top-down: beta 0.12 rad off the +Y axis reads as a flat field,
	// keeping just enough tilt for enemy models to show silhouette depth. radius is
	// sized so the ~34-unit spawn ring sits near the frame edge (enemies enter from
	// off-screen with distance to cover) while the core stays centered — verified
	// by the visual probe, not derived from fov alone.
	const camera = new ArcRotateCamera(
		"cam",
		-Math.PI / 2,
		0.12,
		55,
		Vector3.Zero(),
		scene,
	);
	camera.inputs.clear(); // fixed camera — typing is the only input
	camera.maxZ = 1000;

	new HemisphericLight("light", new Vector3(0, 1, 0), scene);

	// nebula backdrop: a fullscreen background layer so the corners beyond the
	// floor disc read as deep space rather than flat black. A 2D background is the
	// right tool for a fixed top-down camera (no parallax needed) and avoids the
	// minification washout a giant textured skydome suffers at this scale.
	const nebula = new Layer("nebula", "/game/nebula.png", scene, true);
	nebula.color = new Color4(0.85, 0.85, 0.9, 1); // gently dim the backdrop

	const ground = CreateDisc("ground", { radius: 38, tessellation: 96 }, scene);
	ground.rotation.x = Math.PI / 2;
	const groundMat = new StandardMaterial("groundMat", scene);
	// white diffuse so the (already dark) AI texture shows at its authored
	// brightness rather than being multiplied down toward black
	groundMat.diffuseColor = Color3.White();
	groundMat.specularColor = Color3.Black();
	// AI-generated tileable sci-fi floor (scripts/gen-ai-assets.mjs)
	const groundTex = new Texture("/game/terrain.png", scene);
	groundTex.uScale = 4;
	groundTex.vScale = 4;
	groundMat.diffuseTexture = groundTex;
	// faint self-illumination of the same map so the circuitry traces read even
	// in the dark, without needing the glow layer to bloom the whole floor
	groundMat.emissiveTexture = groundTex;
	groundMat.emissiveColor = new Color3(0.14, 0.14, 0.16);
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
		dispose() {
			glow.dispose();
			nebula.dispose();
			scene.dispose();
			engine.dispose();
		},
	};
}
