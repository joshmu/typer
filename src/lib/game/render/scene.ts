import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Scene } from "@babylonjs/core/scene";

export type GameScene = { engine: Engine; scene: Scene; dispose(): void };

export function createGameScene(
	canvas: HTMLCanvasElement,
	opts: { preserveDrawingBuffer: boolean },
): GameScene {
	const engine = new Engine(canvas, true, {
		preserveDrawingBuffer: opts.preserveDrawingBuffer,
	});
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);

	// near-vertical top-down: beta 0.12 rad off the +Y axis reads as a flat field,
	// keeping just enough tilt for enemy models to show silhouette depth. radius is
	// sized so the ~34-unit spawn ring sits near the frame edge (enemies enter from
	// off-screen with distance to cover) while the core stays centered — verified
	// by the visual probe, not derived from fov alone.
	const camera = new ArcRotateCamera(
		"cam",
		-Math.PI / 2,
		0.12,
		60,
		Vector3.Zero(),
		scene,
	);
	camera.inputs.clear(); // fixed camera — typing is the only input

	new HemisphericLight("light", new Vector3(0, 1, 0), scene);

	const ground = CreateDisc("ground", { radius: 38, tessellation: 96 }, scene);
	ground.rotation.x = Math.PI / 2;
	const groundMat = new StandardMaterial("groundMat", scene);
	// white diffuse so the (already dark) procedural texture shows at its authored
	// brightness rather than being multiplied down toward black
	groundMat.diffuseColor = Color3.White();
	groundMat.specularColor = Color3.Black();
	// seeded procedural floor (scripts/gen-assets.ts); tiled several times
	const groundTex = new Texture("/game/ground.png", scene);
	groundTex.uScale = 6;
	groundTex.vScale = 6;
	groundMat.diffuseTexture = groundTex;
	ground.material = groundMat;

	const player = CreateCylinder(
		"player",
		{ height: 1.2, diameterTop: 0, diameterBottom: 1 },
		scene,
	);
	player.position.y = 0.6;
	const playerMat = new StandardMaterial("playerMat", scene);
	playerMat.emissiveColor = new Color3(0.3, 0.8, 1);
	player.material = playerMat;

	return {
		engine,
		scene,
		dispose() {
			scene.dispose();
			engine.dispose();
		},
	};
}
