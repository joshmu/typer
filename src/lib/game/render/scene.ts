import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Scene } from "@babylonjs/core/scene";

export type GameScene = { engine: Engine; scene: Scene; dispose(): void };

export function createGameScene(canvas: HTMLCanvasElement): GameScene {
	const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);

	const camera = new ArcRotateCamera(
		"cam",
		-Math.PI / 2,
		0.9,
		34,
		Vector3.Zero(),
		scene,
	);
	camera.inputs.clear(); // fixed camera — typing is the only input

	new HemisphericLight("light", new Vector3(0, 1, 0), scene);

	const ground = CreateDisc("ground", { radius: 22, tessellation: 64 }, scene);
	ground.rotation.x = Math.PI / 2;
	const groundMat = new StandardMaterial("groundMat", scene);
	groundMat.diffuseColor = new Color3(0.09, 0.09, 0.13);
	groundMat.specularColor = Color3.Black();
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
