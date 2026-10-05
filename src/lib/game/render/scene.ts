import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Layer } from "@babylonjs/core/Layers/layer";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { type Frame, frameFor, plateFontPx, REF_PPU } from "../view";
import {
	DECK_CELL_H,
	DECK_CELL_W,
	deckLayout,
	TERRAIN_COLS,
	TERRAIN_ROWS,
} from "./deck";
import { createGroundDecals, type GroundDecals } from "./ground-decals";
import { isSlowRenderer } from "./quality";

/** Rendering groups, drawn in order: the floor and its decals; the field
 * (sprites, turret rings, shots and kill effects); then word plates and
 * score labels, so no effect ever covers a word. */
export const FLOOR_GROUP = 0;
export const FIELD_GROUP = 1;
export const LABEL_GROUP = 2;

/** The live camera frame plus the on-screen plate size, refreshed each frame. */
export type SceneView = Frame & { fontPx: number };

export type GameScene = {
	engine: Engine;
	scene: Scene;
	glow: GlowLayer;
	/** Crimsonland-style battlefield persistence: stamp corpse/breach decals
	 * baked straight into the ground texture (no live entities). */
	ground: GroundDecals;
	/** Mutated in place every frame from the live canvas size. */
	view: SceneView;
	camera: ArcRotateCamera;
	/** Camera feel for the next render: `zoom` scales the ortho frame (below
	 * 1 zooms in) and the shake pans it in screen space, world units. */
	setCameraFeel(zoom: number, shakeX: number, shakeY: number): void;
	dispose(): void;
};

export function createGameScene(
	canvas: HTMLCanvasElement,
	opts: { preserveDrawingBuffer: boolean },
): GameScene {
	// adaptToDeviceRatio: render at the display's native pixel density. Without
	// it the canvas backing store stays at CSS size and the browser upscales it
	// (2× blur on retina) — sprites smeared fat and label text mushy while the
	// DOM HUD text right next to it renders pin-sharp.
	const engine = new Engine(
		canvas,
		true,
		{ preserveDrawingBuffer: opts.preserveDrawingBuffer },
		true,
	);
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
	// The frame (shared via ../view so the shell's vignette and the label
	// sizing agree with it) keeps world cells SQUARE on screen at any size.
	const view: SceneView = { ...frameFor(0, 0), fontPx: plateFontPx(0, 0) };
	let zoom = 1;
	function applyOrtho(): void {
		// the live canvas size in CSS px (render px × hardware scaling level);
		// frameFor guards zero / NaN sizes with a square fallback
		const k = engine.getHardwareScalingLevel();
		const cssW = engine.getRenderWidth() * k;
		const cssH = engine.getRenderHeight() * k;
		const f = frameFor(cssW, cssH);
		view.halfW = f.halfW;
		view.halfH = f.halfH;
		view.ppu = f.ppu;
		view.fontPx = plateFontPx(cssW, cssH);
		// pin the orientation every frame: nothing may ever rotate this camera —
		// sprite angles, ground decals and the DOM vignette are all calibrated to
		// this exact pose, and the beta≈0 gimbal makes any drift catastrophic
		camera.alpha = -Math.PI / 2;
		camera.beta = 0.0001;
		camera.orthoTop = view.halfH * zoom;
		camera.orthoBottom = -view.halfH * zoom;
		camera.orthoLeft = -view.halfW * zoom;
		camera.orthoRight = view.halfW * zoom;
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

	// deep-space backdrop behind the arena: it shows where the floor fades out
	// toward the frame corners, so the edges read as space, not a black mask
	const nebula = new Layer("nebula", "/game/nebula.png", scene, true);
	nebula.color = new Color4(0.8, 0.8, 0.9, 1);

	// one radial fade shared by the floor and its decals: solid out to
	// FLOOR_SOLID, then feathering into the nebula by the disc edge
	const fade = createFloorFade(scene);

	const ground = CreateDisc(
		"ground",
		{ radius: FLOOR_RADIUS, tessellation: 96 },
		scene,
	);
	ground.rotation.x = Math.PI / 2;
	ground.renderingGroupId = FLOOR_GROUP;
	ground.alphaIndex = 0;
	setTerrainUVs(ground);
	const groundMat = new StandardMaterial("groundMat", scene);
	groundMat.disableLighting = true;
	groundMat.backFaceCulling = false; // never a blank floor if the disc faces away
	// the deck tile repeats on the GPU with no seam (cells meet on grid lines,
	// see deck.ts) and samples NEAREST at 1 source px per device px on the
	// reference canvas, on the same pixel grain as the sprites
	const terrain = createDeckTexture(scene);
	terrain.coordinatesIndex = 1;
	// unlit: the emissive texture is ADDED to emissiveColor and the diffuse
	// term counts at full strength with lighting off, so both colours stay
	// black and the texture level sets the deck's brightness
	terrain.level = 0.62;
	groundMat.emissiveTexture = terrain;
	groundMat.emissiveColor = Color3.Black();
	groundMat.diffuseColor = Color3.Black();
	groundMat.specularColor = Color3.Black();
	groundMat.opacityTexture = fade;
	ground.material = groundMat;

	// corpse/breach decals: a transparent layer just above the floor. Stamps
	// are faded with the floor as they are drawn, so a kill near the edge
	// never stains open space
	const groundDecals = createGroundDecals(scene, FLOOR_RADIUS, FLOOR_SOLID);
	const decals = CreateDisc(
		"ground-decals",
		{ radius: FLOOR_RADIUS, tessellation: 96 },
		scene,
	);
	decals.rotation.x = Math.PI / 2;
	decals.position.y = 0.02;
	decals.renderingGroupId = FLOOR_GROUP;
	decals.alphaIndex = 1;
	const decalMat = new StandardMaterial("decalMat", scene);
	decalMat.disableLighting = true;
	decalMat.backFaceCulling = false;
	// unlit and colour from the emissive texture alone (see the floor above)
	decalMat.emissiveTexture = groundDecals.texture;
	decalMat.opacityTexture = groundDecals.texture;
	decalMat.emissiveColor = Color3.Black();
	decalMat.diffuseColor = Color3.Black();
	decalMat.specularColor = Color3.Black();
	decals.material = decalMat;

	// bloom for gameplay emissives (turret core, tracers, enemy tints, powerups).
	// A modest blur kernel keeps it affordable on the swiftshader CI runner.
	const glow = new GlowLayer("glow", scene, { blurKernelSize: 16 });
	glow.intensity = 0.6;
	// the floor is already lit by its own emissive texture — excluding it keeps
	// the bloom on the things that should pop and off the big surface
	glow.addExcludedMesh(ground);
	glow.addExcludedMesh(decals);
	// a software or fallback rasteriser skips the glow, as it skips post: the
	// blur passes cost more there than the whole rest of a frame
	const glInfo = engine.getGlInfo();
	if (glInfo && isSlowRenderer(glInfo.renderer)) glow.isEnabled = false;

	// the player is a layered turret (render/turret.ts) built by the loop, not a
	// static cone — so nothing more is added here.

	return {
		engine,
		scene,
		glow,
		ground: groundDecals,
		view,
		camera,
		setCameraFeel(z, shakeX, shakeY) {
			zoom = z;
			// pan the projection only: moving the target would re-derive alpha
			// and beta, and at the beta≈0 pose that spins the whole view
			camera.targetScreenOffset.set(shakeX, shakeY);
		},
		dispose() {
			window.removeEventListener("resize", onResize);
			glow.dispose();
			nebula.dispose();
			terrain.dispose();
			fade.dispose();
			groundDecals.dispose();
			scene.dispose();
			engine.dispose();
		},
	};
}

// Floor disc radius in world units: on the reference canvas the deck spans
// the frame top to bottom and fades into space toward the sides and corners.
const FLOOR_RADIUS = 52;
// fully opaque floor out to here, then a smooth fade to the disc edge
const FLOOR_SOLID = 38;
// terrain source px per world unit: 1 source px per device px on the
// reference canvas at 2x
const TERRAIN_PX_PER_UNIT = 2 * REF_PPU;
// deck tile in cells: 12x8 cells of 172x192 px, ~69x51 world units per repeat
const DECK_COLS = 12;
const DECK_ROWS = 8;
const DECK_W = DECK_COLS * DECK_CELL_W;
const DECK_H = DECK_ROWS * DECK_CELL_H;
const DECK_SEED = 7;

/** UV set 2 on the floor maps world space to the deck tile, one tile centred
 * on the core. UV set 1 (the disc's own) still drives the fade. */
function setTerrainUVs(disc: Mesh): void {
	const pos = disc.getVerticesData(VertexBuffer.PositionKind);
	if (!pos) return;
	const tileW = DECK_W / TERRAIN_PX_PER_UNIT;
	const tileH = DECK_H / TERRAIN_PX_PER_UNIT;
	const uv2: number[] = [];
	for (let i = 0; i < pos.length; i += 3) {
		uv2.push(pos[i] / tileW + 0.5, pos[i + 1] / tileH + 0.5);
	}
	disc.setVerticesData(VertexBuffer.UV2Kind, uv2);
}

/** A small radial alpha ramp, sampled bilinear across the floor disc. */
function createFloorFade(scene: Scene): DynamicTexture {
	const SIZE = 256;
	const tex = new DynamicTexture(
		"floor-fade",
		{ width: SIZE, height: SIZE },
		scene,
		false,
		// no mips, so no mip filter: a mip-sampling filter on a mip-less texture
		// leaves it incomplete and every sample reads opaque
		Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
	);
	tex.hasAlpha = true;
	tex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
	tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
	// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
	const c = tex.getContext() as any;
	const r = SIZE / 2;
	const g = c.createRadialGradient(r, r, 0, r, r, r);
	const solid = FLOOR_SOLID / FLOOR_RADIUS;
	g.addColorStop(0, "rgba(255,255,255,1)");
	g.addColorStop(solid, "rgba(255,255,255,1)");
	// ease out: most of the fall-off happens late so the floor reads as a deck
	g.addColorStop(solid + (1 - solid) * 0.5, "rgba(255,255,255,0.72)");
	g.addColorStop(1, "rgba(255,255,255,0)");
	c.clearRect(0, 0, SIZE, SIZE);
	c.fillStyle = g;
	c.fillRect(0, 0, SIZE, SIZE);
	tex.update();
	return tex;
}

/** The repeating deck tile, assembled from terrain.png cells once it loads
 * (a dark fill until then, so the floor is never a hole). */
function createDeckTexture(scene: Scene): DynamicTexture {
	const tex = new DynamicTexture(
		"deck",
		{ width: DECK_W, height: DECK_H },
		scene,
		true,
		Constants.TEXTURE_NEAREST_NEAREST_MIPNEAREST,
	);
	tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
	tex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
	// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
	const c = tex.getContext() as any;
	c.fillStyle = "#1b2426";
	c.fillRect(0, 0, DECK_W, DECK_H);
	tex.update();
	const img = new Image();
	img.onload = () => {
		c.imageSmoothingEnabled = false;
		for (const cell of deckLayout(DECK_SEED, DECK_COLS, DECK_ROWS)) {
			const [row, col] = cell.src;
			// cut the cell centred between its grid lines
			const sx = Math.round(
				(TERRAIN_COLS[col] + TERRAIN_COLS[col + 1]) / 2 - DECK_CELL_W / 2,
			);
			const sy = Math.round(
				(TERRAIN_ROWS[row] + TERRAIN_ROWS[row + 1]) / 2 - DECK_CELL_H / 2,
			);
			c.save();
			c.translate(
				cell.x + (cell.flipX ? DECK_CELL_W : 0),
				cell.y + (cell.flipY ? DECK_CELL_H : 0),
			);
			c.scale(cell.flipX ? -1 : 1, cell.flipY ? -1 : 1);
			c.drawImage(
				img,
				sx,
				sy,
				DECK_CELL_W,
				DECK_CELL_H,
				0,
				0,
				DECK_CELL_W,
				DECK_CELL_H,
			);
			c.restore();
		}
		tex.update();
	};
	img.src = "/game/terrain.png";
	return tex;
}
