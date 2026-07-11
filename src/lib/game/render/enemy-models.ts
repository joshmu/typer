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
 * reads distinctly at top-down gameplay zoom. Everything shares one material (so
 * the renderer's target-glow lifts the whole model) and is animated render-side
 * each frame with a per-family LOCOMOTION GAIT driven read-only by the sim state
 * (tick, velocity magnitude, and dash phase from spawnTick). Gait amplitude
 * scales with |vel| so a stopped enemy idles subtly instead of gliding statically.
 * No per-frame allocation — every animated node/part is captured once at build.
 *
 * Gait transforms live on an inner `body` node so they never fight the outer
 * `node` scale the renderer sets for archetype size.
 */

export type EnemyModel = {
	/** Outer node the renderer positions + scales for archetype size. */
	node: TransformNode;
	/** Every mesh part, for cloak visibility toggling. */
	parts: Mesh[];
	/** Per-family gait. `spawnTick` lets phase-based gaits (charger) sync to the
	 * sim's dash-pause cycle. Read-only w.r.t. the sim. */
	animate(tick: number, phase: number, vel: Vec2, spawnTick: number): void;
};

type AnimateFn = (
	tick: number,
	phase: number,
	vel: Vec2,
	spawnTick: number,
	body: TransformNode,
) => void;

const TAU = Math.PI * 2;
const DASH_TICKS = 40; // mirrors movement.ts dash-pause cadence (render-side)
const PAUSE_TICKS = 40;

/** Gait amplitude factor in ~[0,1] from velocity magnitude. */
function moveAmp(vel: Vec2): number {
	return Math.min(1, Math.hypot(vel.x, vel.y) * 22);
}

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
	// inner body carries all gait transforms; the renderer scales `node` for size
	const body = new TransformNode("enemy-body", scene);
	body.parent = node;
	const parts: Mesh[] = [];
	const add = (m: Mesh, parent: TransformNode = body): Mesh => {
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
			animate = buildBoss(scene, add, body);
			break;
		default:
			animate = buildFallback(scene, add);
	}

	return {
		node,
		parts,
		animate: (tick, phase, vel, spawnTick) =>
			animate(tick, phase, vel, spawnTick, body),
	};
}

type AddFn = (m: Mesh, parent?: TransformNode) => Mesh;

// husk — faceted core studded with radial spikes. Gait: spikes ripple outward,
// body rolls along travel; slow spin + bob.
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
	const spikes: Mesh[] = [];
	for (const [x, y, z] of dirs) {
		const spike = add(
			CreateCylinder(
				"husk-spike",
				{ height: 0.5, diameterTop: 0, diameterBottom: 0.28, tessellation: 6 },
				scene,
			),
		);
		spike.position.set(x * 0.6, y * 0.6, z * 0.6);
		if (x !== 0) spike.rotation.z = -Math.sign(x) * (Math.PI / 2);
		else if (z !== 0) spike.rotation.x = Math.sign(z) * (Math.PI / 2);
		else if (y < 0) spike.rotation.x = Math.PI;
		spikes.push(spike);
	}
	return (tick, phase, vel, _spawnTick, node) => {
		const amp = 0.25 + moveAmp(vel);
		node.rotation.y = tick * 0.01 + phase;
		node.rotation.z = Math.sin(tick * 0.09 + phase) * 0.14 * amp; // body roll
		for (let i = 0; i < spikes.length; i++) {
			spikes[i].scaling.setAll(
				1 + Math.sin(tick * 0.16 + i * 0.9 + phase) * 0.2 * amp,
			);
		}
		bob(node, tick, phase);
	};
}

// darter — flattened arrowhead with twin swept fins. Gait: squash-stretch thrust
// pulses along the heading.
function buildDarter(scene: Scene, add: AddFn): AnimateFn {
	const head = add(
		CreateCylinder(
			"darter-head",
			{ height: 1.1, diameterTop: 0, diameterBottom: 0.55, tessellation: 4 },
			scene,
		),
	);
	head.rotation.x = Math.PI / 2;
	head.scaling.y = 0.5;
	for (const sx of [-1, 1]) {
		const fin = add(
			CreateBox("darter-fin", { width: 0.06, height: 0.3, depth: 0.5 }, scene),
		);
		fin.position.set(sx * 0.28, 0, -0.35);
		fin.rotation.y = sx * 0.5;
	}
	return (tick, phase, vel, spawnTick, node) => {
		orientToVel(node, vel);
		const k = 0.15 + 0.85 * moveAmp(vel);
		const pulse = Math.sin((tick - spawnTick) * 0.35 + phase);
		node.scaling.z = 1 + pulse * 0.28 * k; // thrust forward
		node.scaling.x = 1 - pulse * 0.14 * k; // squash laterally
		node.scaling.y = 1 - pulse * 0.1 * k;
		bob(node, tick, phase, 0.07);
	};
}

// wraith — flat ring haloing a bobbing inner core. Gait: ring counter-spins the
// body, core leads/lags.
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
	return (tick, phase, vel, _spawnTick, node) => {
		const amp = 0.3 + moveAmp(vel);
		node.rotation.y = tick * 0.02 + phase; // body slow spin
		ring.rotation.y = -tick * 0.07 - phase; // ring counter-spin (local)
		core.position.y = Math.sin(tick * 0.09 + phase) * 0.22;
		core.position.x = Math.sin(tick * 0.06 + phase) * 0.13 * amp; // lead
		core.position.z = Math.cos(tick * 0.055 + phase) * 0.13 * amp; // lag
		bob(node, tick, phase, 0.08);
	};
}

// charger — broad low wedge with a dorsal ridge. Gait: crouch during the pause,
// lunge during the dash, synced to the sim's dash-pause phase.
function buildCharger(scene: Scene, add: AddFn): AnimateFn {
	const wedge = add(
		CreateBox("charger-wedge", { width: 1, height: 0.5, depth: 0.9 }, scene),
	);
	wedge.scaling.set(1, 1, 1);
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
	return (tick, phase, vel, spawnTick, node) => {
		orientToVel(node, vel);
		const ph = (tick - spawnTick) % (DASH_TICKS + PAUSE_TICKS);
		let lunge = 0;
		let crouch = 0;
		if (ph < DASH_TICKS) {
			lunge = Math.sin((ph / DASH_TICKS) * Math.PI); // peaks mid-dash
		} else {
			crouch = Math.sin(((ph - DASH_TICKS) / PAUSE_TICKS) * Math.PI) * 0.5;
		}
		node.scaling.z = 1 + lunge * 0.3 - crouch * 0.15;
		node.scaling.y = 1 - crouch * 0.28 + lunge * 0.05;
		node.position.z = lunge * 0.16; // slight forward lurch
		bob(node, tick, phase, 0.05);
	};
}

// weaver — twin orbs bridged by a strut. Gait: orbs counter-bob and the pair
// tightens laterally as it speeds up.
function buildWeaver(scene: Scene, add: AddFn): AnimateFn {
	const orbs: Mesh[] = [];
	for (const sx of [-1, 1]) {
		const orb = add(
			CreateSphere("weaver-orb", { diameter: 0.55, segments: 12 }, scene),
		);
		orb.position.set(sx * 0.42, 0, 0);
		orbs.push(orb);
	}
	const strut = add(
		CreateCylinder(
			"weaver-strut",
			{ height: 0.84, diameter: 0.13, tessellation: 8 },
			scene,
		),
	);
	strut.rotation.z = Math.PI / 2;
	return (tick, phase, vel, _spawnTick, node) => {
		const move = moveAmp(vel);
		node.rotation.y = tick * 0.05 + phase;
		node.scaling.x = 1 - 0.25 * move; // tighten the pair with speed
		const wob = Math.sin(tick * 0.1 + phase) * 0.15 * (0.3 + move);
		orbs[0].position.y = wob; // counter-bob
		orbs[1].position.y = -wob;
		bob(node, tick, phase, 0.09);
	};
}

// brood — central orb ringed by four child bumps. Gait: children wobble in/out.
function buildBrood(scene: Scene, add: AddFn): AnimateFn {
	add(CreateSphere("brood-core", { diameter: 0.72, segments: 12 }, scene));
	const around: [number, number][] = [
		[0.45, 0],
		[-0.45, 0],
		[0, 0.45],
		[0, -0.45],
	];
	const bumps: Mesh[] = [];
	for (const [x, z] of around) {
		const bump = add(
			CreateSphere("brood-bump", { diameter: 0.32, segments: 8 }, scene),
		);
		bump.position.set(x, 0, z);
		bumps.push(bump);
	}
	return (tick, phase, vel, _spawnTick, node) => {
		const amp = 0.3 + moveAmp(vel);
		node.rotation.y = tick * 0.015 + phase;
		for (let i = 0; i < bumps.length; i++) {
			const [bx, bz] = around[i];
			const w = Math.sin(tick * 0.14 + i * 1.6 + phase);
			const s = 1 + w * 0.14 * amp;
			bumps[i].position.set(bx * s, w * 0.1 * amp, bz * s);
		}
		bob(node, tick, phase);
	};
}

// boss — imposing faceted flagship with an orbiting shard ring. Gait: a slow
// menacing sway on top of the shard spin.
function buildBoss(scene: Scene, add: AddFn, body: TransformNode): AnimateFn {
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
	const shards = new TransformNode("boss-shards", scene);
	shards.parent = body;
	shards.position.y = 0.1;
	for (let i = 0; i < 3; i++) {
		const shard = add(
			CreatePolyhedron("boss-shard", { type: 0, size: 0.28 }, scene),
			shards,
		);
		const a = (i / 3) * TAU;
		shard.position.set(Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5);
	}
	return (tick, phase, _vel, _spawnTick, node) => {
		node.rotation.y = tick * 0.008 + phase;
		node.rotation.z = Math.sin(tick * 0.03 + phase) * 0.06; // slow menace sway
		node.rotation.x = Math.cos(tick * 0.025 + phase) * 0.04;
		shards.rotation.y = -tick * 0.03;
		bob(node, tick, phase, 0.1);
	};
}

function buildFallback(scene: Scene, add: AddFn): AnimateFn {
	add(CreateSphere("enemy-fallback", { diameter: 1, segments: 12 }, scene));
	return (tick, phase, _vel, _spawnTick, node) => {
		node.rotation.y = tick * 0.01 + phase;
		bob(node, tick, phase);
	};
}
