import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Vec2 } from "../sim/state";
import type { FamilyVisual } from "./visuals";

/**
 * Sculpted, multi-part enemy models — one build per family so each silhouette
 * reads distinctly at top-down gameplay zoom. Everything shares one material
 * (so the renderer's target-glow lifts the whole model) and is animated
 * render-side each frame from the sim tick + a per-id phase; no per-frame
 * allocation. `animate` receives the enemy velocity so directional families
 * (darter, charger) orient along their heading.
 */

export type EnemyModel = {
	/** Parent of all parts; the renderer positions + scales this. */
	node: TransformNode;
	/** Every mesh part, for cloak visibility toggling. */
	parts: Mesh[];
	/** Idle animation: bob / spin / orient / orbit sub-parts. */
	animate(tick: number, phase: number, vel: Vec2): void;
};

type AnimateFn = (
	tick: number,
	phase: number,
	vel: Vec2,
	node: TransformNode,
) => void;

const TAU = Math.PI * 2;

function bob(
	node: TransformNode,
	tick: number,
	phase: number,
	amp = 0.12,
): void {
	node.position.y = 0.15 + Math.sin(tick * 0.06 + phase) * amp;
}

function orientToVel(node: TransformNode, vel: Vec2): void {
	if (vel.x * vel.x + vel.y * vel.y > 1e-6) {
		node.rotation.y = Math.atan2(vel.x, vel.y);
	}
}

export function buildEnemyModel(
	scene: Scene,
	recipe: FamilyVisual,
	mat: StandardMaterial,
): EnemyModel {
	const node = new TransformNode("enemy-model", scene);
	const parts: Mesh[] = [];
	const add = (m: Mesh, parent: TransformNode = node): Mesh => {
		m.parent = parent;
		m.material = mat;
		m.isPickable = false;
		parts.push(m);
		return m;
	};

	let animate: AnimateFn;
	switch (recipe.family) {
		case "husk":
			animate = buildHusk(scene, add);
			break;
		case "darter":
			animate = buildDarter(scene, add);
			break;
		case "wraith":
			animate = buildWraith(scene, add);
			break;
		case "charger":
			animate = buildCharger(scene, add);
			break;
		case "weaver":
			animate = buildWeaver(scene, add);
			break;
		case "brood":
			animate = buildBrood(scene, add);
			break;
		case "boss":
			animate = buildBoss(scene, add, node);
			break;
		default:
			animate = buildFallback(scene, add);
	}

	return {
		node,
		parts,
		animate: (tick, phase, vel) => animate(tick, phase, vel, node),
	};
}

type AddFn = (m: Mesh, parent?: TransformNode) => Mesh;

// husk — faceted core studded with radial spikes; slow spin + bob
function buildHusk(scene: Scene, add: AddFn): AnimateFn {
	add(CreateIcoSphere("husk-core", { radius: 0.5, subdivisions: 1 }, scene));
	const dirs: [number, number, number][] = [
		[1, 0, 0],
		[-1, 0, 0],
		[0, 0, 1],
		[0, 0, -1],
		[0, 1, 0],
		[0, -1, 0],
	];
	for (const [x, y, z] of dirs) {
		const spike = add(
			CreateCylinder(
				"husk-spike",
				{ height: 0.5, diameterTop: 0, diameterBottom: 0.28, tessellation: 6 },
				scene,
			),
		);
		spike.position.set(x * 0.6, y * 0.6, z * 0.6);
		// point the cone's +Y axis outward along the spike direction
		if (x !== 0) spike.rotation.z = -Math.sign(x) * (Math.PI / 2);
		else if (z !== 0) spike.rotation.x = Math.sign(z) * (Math.PI / 2);
		else if (y < 0) spike.rotation.x = Math.PI;
	}
	return (tick, phase, _vel, node) => {
		node.rotation.y = tick * 0.01 + phase;
		bob(node, tick, phase);
	};
}

// darter — flattened arrowhead with twin swept fins; orients along heading
function buildDarter(scene: Scene, add: AddFn): AnimateFn {
	const head = add(
		CreateCylinder(
			"darter-head",
			{ height: 1.1, diameterTop: 0, diameterBottom: 0.55, tessellation: 4 },
			scene,
		),
	);
	head.rotation.x = Math.PI / 2; // lay the point along +Z
	head.scaling.y = 0.5; // flatten vertically
	for (const sx of [-1, 1]) {
		const fin = add(
			CreateBox("darter-fin", { width: 0.06, height: 0.3, depth: 0.5 }, scene),
		);
		fin.position.set(sx * 0.28, 0, -0.35);
		fin.rotation.y = sx * 0.5;
	}
	return (tick, phase, vel, node) => {
		orientToVel(node, vel);
		bob(node, tick, phase, 0.07);
	};
}

// wraith — flat ring haloing a bobbing inner core
function buildWraith(scene: Scene, add: AddFn): AnimateFn {
	const ring = add(
		CreateTorus(
			"wraith-ring",
			{ diameter: 1.1, thickness: 0.16, tessellation: 24 },
			scene,
		),
	);
	ring.rotation.x = Math.PI / 2;
	const core = add(
		CreateSphere("wraith-core", { diameter: 0.5, segments: 12 }, scene),
	);
	return (tick, phase, _vel, node) => {
		node.rotation.y = tick * 0.02 + phase;
		core.position.y = Math.sin(tick * 0.09 + phase) * 0.22;
		bob(node, tick, phase, 0.08);
	};
}

// charger — broad low wedge with a dorsal ridge; orients along heading
function buildCharger(scene: Scene, add: AddFn): AnimateFn {
	const wedge = add(
		CreateBox("charger-wedge", { width: 1, height: 0.5, depth: 0.9 }, scene),
	);
	wedge.scaling.set(1, 1, 1);
	// taper the front by shearing a smaller nose box forward
	const nose = add(
		CreateBox("charger-nose", { width: 0.55, height: 0.32, depth: 0.5 }, scene),
	);
	nose.position.set(0, 0.02, 0.6);
	for (let i = 0; i < 3; i++) {
		const ridge = add(
			CreateBox(
				"charger-ridge",
				{ width: 0.16, height: 0.3, depth: 0.18 },
				scene,
			),
		);
		ridge.position.set(0, 0.36, -0.25 + i * 0.25);
	}
	return (tick, phase, vel, node) => {
		orientToVel(node, vel);
		bob(node, tick, phase, 0.05);
	};
}

// weaver — twin orbs bridged by a strut, the pair slowly orbiting
function buildWeaver(scene: Scene, add: AddFn): AnimateFn {
	for (const sx of [-1, 1]) {
		const orb = add(
			CreateSphere("weaver-orb", { diameter: 0.55, segments: 12 }, scene),
		);
		orb.position.set(sx * 0.42, 0, 0);
	}
	const strut = add(
		CreateCylinder(
			"weaver-strut",
			{ height: 0.84, diameter: 0.13, tessellation: 8 },
			scene,
		),
	);
	strut.rotation.z = Math.PI / 2; // bridge horizontally along X
	return (tick, phase, _vel, node) => {
		node.rotation.y = tick * 0.03 + phase;
		bob(node, tick, phase, 0.09);
	};
}

// brood — central orb ringed by four child bumps
function buildBrood(scene: Scene, add: AddFn): AnimateFn {
	add(CreateSphere("brood-core", { diameter: 0.72, segments: 12 }, scene));
	const around: [number, number][] = [
		[0.45, 0],
		[-0.45, 0],
		[0, 0.45],
		[0, -0.45],
	];
	for (const [x, z] of around) {
		const bump = add(
			CreateSphere("brood-bump", { diameter: 0.32, segments: 8 }, scene),
		);
		bump.position.set(x, 0, z);
	}
	return (tick, phase, _vel, node) => {
		node.rotation.y = tick * 0.015 + phase;
		bob(node, tick, phase);
	};
}

// boss — imposing faceted flagship, spiked, with an orbiting shard ring
function buildBoss(scene: Scene, add: AddFn, node: TransformNode): AnimateFn {
	add(CreateIcoSphere("boss-core", { radius: 0.85, subdivisions: 2 }, scene));
	const dirs: [number, number, number][] = [
		[1, 0, 0],
		[-1, 0, 0],
		[0, 0, 1],
		[0, 0, -1],
	];
	for (const [x, , z] of dirs) {
		const spike = add(
			CreateCylinder(
				"boss-spike",
				{ height: 0.7, diameterTop: 0, diameterBottom: 0.4, tessellation: 6 },
				scene,
			),
		);
		spike.position.set(x * 0.95, 0, z * 0.95);
		if (x !== 0) spike.rotation.z = -Math.sign(x) * (Math.PI / 2);
		else spike.rotation.x = Math.sign(z) * (Math.PI / 2);
	}
	// orbiting shard ring — a holder we spin render-side
	const shards = new TransformNode("boss-shards", scene);
	shards.parent = node;
	shards.position.y = 0.1;
	for (let i = 0; i < 3; i++) {
		const shard = add(
			CreatePolyhedron("boss-shard", { type: 0, size: 0.28 }, scene),
			shards,
		);
		const a = (i / 3) * TAU;
		shard.position.set(Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5);
	}
	return (tick, phase, _vel, n) => {
		n.rotation.y = tick * 0.008 + phase;
		shards.rotation.y = -tick * 0.03;
		bob(n, tick, phase, 0.1);
	};
}

function buildFallback(scene: Scene, add: AddFn): AnimateFn {
	add(CreateSphere("enemy-fallback", { diameter: 1, segments: 12 }, scene));
	return (tick, phase, _vel, node) => {
		node.rotation.y = tick * 0.01 + phase;
		bob(node, tick, phase);
	};
}
