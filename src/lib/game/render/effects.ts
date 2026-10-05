import { Constants } from "@babylonjs/core/Engines/constants";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4, Vector3 } from "@babylonjs/core/Maths/math";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
// GLSL particle shaders (WebGL engine) — required so the pooled ParticleSystem
// has its render program registered without pulling the whole Babylon bundle.
import "@babylonjs/core/Shaders/particles.fragment";
import "@babylonjs/core/Shaders/particles.vertex";
import type { ShotKind } from "./frame-effects";
import { LABEL_FONT } from "./label";
import { FIELD_GROUP, FLOOR_GROUP, LABEL_GROUP, type SceneView } from "./scene";

// Every lifetime is wall-clock ms, so 120Hz plays the same as 60Hz.
const TRACER_POOL = 16;
const FLASH_POOL = 12;
const SPARK_POOL = 8;
const WAVE_POOL = 6;
const SCORCH_POOL = 10;
const SCORE_POOL = 8;
const BURST_POOL = 6;

// a shot's bright head runs muzzle to target in HEAD_MS, then the beam fades
const HEAD_MS = 40;
const TRACER_MS = { light: 70, clang: 100, heavy: 130 } as const;
const TRACER_W = { light: 0.18, clang: 0.24, heavy: 0.35 } as const;
const HEAD_SIZE = { light: 0.45, clang: 0.55, heavy: 0.8 } as const;
const MUZZLE_MS = { light: 50, clang: 70, heavy: 90 } as const;
const MUZZLE_SIZE = { light: 0.7, clang: 0.85, heavy: 1.2 } as const;
const KILL_FLASH_MS = 90;
const SPARK_MS = 110;
const WAVE_MS = 150;
const WAVE_RADIUS = 3;
const BOSS_WAVE_MS = 320;
const BOSS_WAVE_RADIUS = 8;
const SCORCH_MS = 900;
const SCORE_MS = 750;
// score labels: on-screen glyph height in CSS px
const SCORE_PX = 22;
const SCORE_TEX_W = 256;
const SCORE_TEX_H = 96;
// the main glyphs fill this share of the label's height
const SCORE_GLYPH = 0.62;

// heights above the floor: sprites sit at 1.2 and word labels at 2.4, so
// effects draw over creatures and under the words
const FX_Y = 1.7;
const SCORE_Y = 3;
const SCORCH_Y = 0.03;
const LIGHT_Y = 0.04;
// the deck is dark: a warm pool at this level reads without flattening it
const LIGHT_LEVEL = 0.42;

export type EffectsTheme = {
	primary: Color3;
	error: Color3;
	/** CSS colours for the canvas-drawn score labels. */
	primaryCss: string;
	inkCss: string;
	plateCss: string;
};

export type KillCreditLabel = { points: number; mult: number };

export type Effects = {
	/** A typed shot from the muzzle to a world point. */
	shot(
		from: Vector3,
		to: Vector3,
		kind: ShotKind,
		now: number,
		overdrive: number,
	): void;
	/** Kill impact at (x, y): flash, sparks, gibs, shockwave, scorch and an
	 * optional "+points xmult" label. */
	kill(
		x: number,
		y: number,
		color: readonly [number, number, number],
		boss: boolean,
		now: number,
		credit: KillCreditLabel | null,
	): void;
	/** An enemy broke through at (x, y): a red burst against the core. */
	breach(x: number, y: number, now: number): void;
	/** A dull spark where non-typed damage clanged off an enemy. */
	spark(x: number, y: number, now: number): void;
	/** The light pool around the core: radius in world units, gain 0..1. */
	setLight(radius: number, gain: number): void;
	update(now: number): void;
	dispose(): void;
};

/** An additive, unlit material: its emissive colour is added to the frame. */
function additive(scene: Scene, name: string, color: Color3): StandardMaterial {
	const m = new StandardMaterial(name, scene);
	m.disableLighting = true;
	m.diffuseColor = Color3.Black();
	m.specularColor = Color3.Black();
	m.emissiveColor = color.clone();
	m.alphaMode = Constants.ALPHA_ADD;
	m.transparencyMode = Material.MATERIAL_ALPHABLEND;
	m.backFaceCulling = false;
	return m;
}

/** A square radial gradient texture: `stops` are [offset, rgba] pairs. */
function radialTexture(
	scene: Scene,
	name: string,
	size: number,
	stops: readonly [number, string][],
): DynamicTexture {
	const tex = new DynamicTexture(
		name,
		{ width: size, height: size },
		scene,
		false,
		Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
	);
	tex.hasAlpha = true;
	tex.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
	tex.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
	// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
	const c = tex.getContext() as any;
	const r = size / 2;
	const g = c.createRadialGradient(r, r, 0, r, r, r);
	for (const [at, rgba] of stops) g.addColorStop(at, rgba);
	c.clearRect(0, 0, size, size);
	c.fillStyle = g;
	c.fillRect(0, 0, size, size);
	tex.update();
	return tex;
}

function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t) * (1 - t);
}

type Timed = { start: number; dur: number; live: boolean };

/** The free slot, or the one furthest through its life. */
function acquire<T extends Timed>(pool: T[], now: number): T {
	let pick = pool[0];
	let best = Number.NEGATIVE_INFINITY;
	for (const p of pool) {
		if (!p.live) return p;
		const age = (now - p.start) / p.dur;
		if (age > best) {
			best = age;
			pick = p;
		}
	}
	return pick;
}

function hide(m: Mesh): Mesh {
	m.isPickable = false;
	m.setEnabled(false);
	return m;
}

export function createEffects(
	scene: Scene,
	glow: GlowLayer,
	view: SceneView,
	theme: EffectsTheme,
): Effects {
	const white = new Color3(1, 1, 1);
	const hot = Color3.Lerp(theme.primary, white, 0.55);

	// ---- tracers: a beam that grows behind a bright head, then fades
	const beamMat: Record<ShotKind, StandardMaterial> = {
		light: additive(scene, "fx-beam-light", theme.primary.scale(0.95)),
		clang: additive(scene, "fx-beam-clang", new Color3(0.75, 0.8, 0.9)),
		heavy: additive(scene, "fx-beam-heavy", hot),
	};
	const headMat = additive(scene, "fx-head", white);
	type Tracer = Timed & {
		beam: Mesh;
		head: Mesh;
		from: Vector3;
		to: Vector3;
		width: number;
	};
	const tracers: Tracer[] = [];
	for (let i = 0; i < TRACER_POOL; i++) {
		const beam = hide(CreateBox(`fx-beam-${i}`, { size: 1 }, scene));
		const head = hide(
			CreateSphere(`fx-head-${i}`, { diameter: 1, segments: 6 }, scene),
		);
		beam.renderingGroupId = FIELD_GROUP;
		head.renderingGroupId = FIELD_GROUP;
		head.material = headMat;
		tracers.push({
			beam,
			head,
			from: new Vector3(),
			to: new Vector3(),
			width: 0,
			start: 0,
			dur: 1,
			live: false,
		});
	}

	// ---- flashes: muzzle bursts and the white pop of a kill
	type Flash = Timed & { mesh: Mesh; mat: StandardMaterial; size: number };
	const flashes: Flash[] = [];
	for (let i = 0; i < FLASH_POOL; i++) {
		const mesh = hide(
			CreateSphere(`fx-flash-${i}`, { diameter: 1, segments: 8 }, scene),
		);
		const mat = additive(scene, `fx-flash-mat-${i}`, white);
		mesh.material = mat;
		mesh.renderingGroupId = FIELD_GROUP;
		flashes.push({ mesh, mat, size: 1, start: 0, dur: 1, live: false });
	}
	function flash(
		x: number,
		z: number,
		size: number,
		ms: number,
		color: Color3,
		now: number,
	): void {
		const f = acquire(flashes, now);
		f.mesh.position.set(x, FX_Y, z);
		f.mat.emissiveColor.copyFrom(color);
		f.size = size;
		f.start = now;
		f.dur = ms;
		f.live = true;
		f.mesh.scaling.setAll(size * 0.6);
		f.mesh.visibility = 1;
		f.mesh.setEnabled(true);
	}

	// ---- clang sparks for non-typed absorbs
	const sparkMat = additive(scene, "fx-spark-mat", new Color3(1, 0.6, 0.2));
	type Spark = Timed & { mesh: Mesh };
	const sparks: Spark[] = [];
	for (let i = 0; i < SPARK_POOL; i++) {
		const mesh = hide(
			CreateSphere(`fx-spark-${i}`, { diameter: 1, segments: 4 }, scene),
		);
		mesh.material = sparkMat;
		mesh.renderingGroupId = FIELD_GROUP;
		sparks.push({ mesh, start: 0, dur: SPARK_MS, live: false });
	}

	// ---- shockwave rings, flat on the field
	type Wave = Timed & {
		mesh: Mesh;
		mat: StandardMaterial;
		radius: number;
		color: Color3;
	};
	const waves: Wave[] = [];
	for (let i = 0; i < WAVE_POOL; i++) {
		const mesh = hide(
			CreateTorus(
				`fx-wave-${i}`,
				{ diameter: 2, thickness: 0.12, tessellation: 48 },
				scene,
			),
		);
		const mat = additive(scene, `fx-wave-mat-${i}`, white);
		mesh.material = mat;
		mesh.renderingGroupId = FIELD_GROUP;
		mesh.position.y = FX_Y;
		waves.push({
			mesh,
			mat,
			radius: 1,
			color: new Color3(),
			start: 0,
			dur: 1,
			live: false,
		});
	}

	// ---- scorch: a dark burn under the kill that cools away
	const scorchTex = radialTexture(scene, "fx-scorch-tex", 64, [
		[0, "rgba(10,6,4,0.8)"],
		[0.45, "rgba(18,10,6,0.6)"],
		[0.8, "rgba(20,12,8,0.2)"],
		[1, "rgba(20,12,8,0)"],
	]);
	type Scorch = Timed & { mesh: Mesh };
	const scorches: Scorch[] = [];
	for (let i = 0; i < SCORCH_POOL; i++) {
		const mesh = hide(
			CreateDisc(`fx-scorch-${i}`, { radius: 1, tessellation: 24 }, scene),
		);
		mesh.rotation.x = Math.PI / 2;
		mesh.position.y = SCORCH_Y;
		mesh.renderingGroupId = FLOOR_GROUP;
		mesh.alphaIndex = 2;
		const mat = new StandardMaterial(`fx-scorch-mat-${i}`, scene);
		mat.disableLighting = true;
		mat.emissiveTexture = scorchTex;
		mat.opacityTexture = scorchTex;
		mat.diffuseColor = Color3.Black();
		mat.specularColor = Color3.Black();
		mat.emissiveColor = Color3.Black();
		mat.backFaceCulling = false;
		mesh.material = mat;
		glow.addExcludedMesh(mesh);
		scorches.push({ mesh, start: 0, dur: SCORCH_MS, live: false });
	}

	// ---- the light pool: the core's light on the deck, under everything
	const lightTex = radialTexture(scene, "fx-light-tex", 128, [
		[0, "rgba(255,255,255,1)"],
		[0.35, "rgba(255,255,255,0.55)"],
		[0.7, "rgba(255,255,255,0.16)"],
		[1, "rgba(255,255,255,0)"],
	]);
	const light = CreateDisc("fx-light", { radius: 1, tessellation: 48 }, scene);
	light.rotation.x = Math.PI / 2;
	light.position.y = LIGHT_Y;
	light.renderingGroupId = FLOOR_GROUP;
	light.alphaIndex = 3;
	light.isPickable = false;
	const lightMat = additive(scene, "fx-light-mat", Color3.Black());
	lightMat.opacityTexture = lightTex;
	light.material = lightMat;
	glow.addExcludedMesh(light);

	// ---- kill bursts: additive spark streaks plus a few pixel gibs. One
	// pair per kill, pooled, so two kills in a frame burst at their own spots
	const streakTex = radialTexture(scene, "fx-streak-tex", 32, [
		[0, "rgba(255,255,255,1)"],
		[0.4, "rgba(255,255,255,0.8)"],
		[1, "rgba(255,255,255,0)"],
	]);
	const gibTex = new DynamicTexture(
		"fx-gib",
		{ width: 8, height: 8 },
		scene,
		false,
	);
	// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
	const gctx = gibTex.getContext() as any;
	gctx.fillStyle = "#ffffff";
	gctx.fillRect(0, 0, 8, 8);
	gibTex.update();
	gibTex.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);

	type Burst = Timed & {
		sparks: ParticleSystem;
		gibs: ParticleSystem;
		at: Vector3;
	};
	const bursts: Burst[] = [];
	for (let i = 0; i < BURST_POOL; i++) {
		const at = new Vector3();
		const s = new ParticleSystem(`fx-streaks-${i}`, 40, scene);
		s.particleTexture = streakTex;
		s.emitter = at;
		s.renderingGroupId = FIELD_GROUP;
		s.blendMode = ParticleSystem.BLENDMODE_ADD;
		// streaks lie along their velocity, flat on the field
		s.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
		s.minSize = 0.32;
		s.maxSize = 0.46;
		s.minScaleX = 0.55;
		s.maxScaleX = 0.7;
		s.minScaleY = 3.5;
		s.maxScaleY = 5.5;
		s.minLifeTime = 0.18;
		s.maxLifeTime = 0.3;
		s.minEmitPower = 14;
		s.maxEmitPower = 24;
		s.direction1 = new Vector3(-1, 0, -1);
		s.direction2 = new Vector3(1, 0, 1);
		s.gravity = Vector3.Zero();
		s.emitRate = 0;
		s.updateSpeed = 1 / 60;
		s.preventAutoStart = true;
		s.manualEmitCount = 0;
		s.addSizeGradient(0, 1);
		s.addSizeGradient(1, 0.3);
		s.start();

		const g = new ParticleSystem(`fx-gibs-${i}`, 24, scene);
		g.particleTexture = gibTex;
		g.emitter = at;
		g.renderingGroupId = FIELD_GROUP;
		g.blendMode = ParticleSystem.BLENDMODE_STANDARD;
		g.minSize = 0.28;
		g.maxSize = 0.55;
		g.minLifeTime = 0.3;
		g.maxLifeTime = 0.55;
		g.minEmitPower = 3;
		g.maxEmitPower = 7;
		g.direction1 = new Vector3(-1, 0, -1);
		g.direction2 = new Vector3(1, 0, 1);
		g.gravity = Vector3.Zero();
		g.emitRate = 0;
		g.updateSpeed = 1 / 60;
		g.preventAutoStart = true;
		g.manualEmitCount = 0;
		g.start();
		bursts.push({ sparks: s, gibs: g, at, start: 0, dur: 600, live: false });
	}

	// ---- floating "+points xmult" labels
	type Score = Timed & {
		root: TransformNode;
		mat: StandardMaterial;
		tex: DynamicTexture;
		x: number;
		z: number;
		big: boolean;
	};
	const scores: Score[] = [];
	for (let i = 0; i < SCORE_POOL; i++) {
		const root = new TransformNode(`fx-score-root-${i}`, scene);
		const mesh = CreatePlane(
			`fx-score-${i}`,
			{ width: SCORE_TEX_W / SCORE_TEX_H, height: 1 },
			scene,
		);
		mesh.parent = root;
		mesh.billboardMode = TransformNode.BILLBOARDMODE_ALL;
		mesh.renderingGroupId = LABEL_GROUP;
		mesh.isPickable = false;
		const tex = new DynamicTexture(
			`fx-score-tex-${i}`,
			{ width: SCORE_TEX_W, height: SCORE_TEX_H },
			scene,
			true,
		);
		tex.hasAlpha = true;
		// upload once (blank) so the scene counts the label ready before its
		// first kill
		tex.update();
		const mat = new StandardMaterial(`fx-score-mat-${i}`, scene);
		mat.disableLighting = true;
		mat.emissiveTexture = tex;
		mat.opacityTexture = tex;
		mat.backFaceCulling = false;
		mesh.material = mat;
		glow.addExcludedMesh(mesh);
		root.setEnabled(false);
		scores.push({
			root,
			mat,
			tex,
			x: 0,
			z: 0,
			big: false,
			start: 0,
			dur: SCORE_MS,
			live: false,
		});
	}
	function drawScore(s: Score, points: number, mult: number): void {
		// biome-ignore lint/suspicious/noExplicitAny: 2d canvas context, untyped here
		const c = s.tex.getContext() as any;
		c.clearRect(0, 0, SCORE_TEX_W, SCORE_TEX_H);
		const main = `+${points}`;
		const tail = mult > 1 ? ` ×${mult}` : "";
		c.font = `bold 60px ${LABEL_FONT}`;
		const wMain = c.measureText(main).width;
		c.font = `bold 44px ${LABEL_FONT}`;
		const wTail = tail ? c.measureText(tail).width : 0;
		const k = Math.min(1, (SCORE_TEX_W - 16) / (wMain + wTail));
		let x = (SCORE_TEX_W - (wMain + wTail) * k) / 2;
		const y = 68;
		c.lineJoin = "round";
		c.lineWidth = 10 * k;
		c.strokeStyle = theme.plateCss;
		c.font = `bold ${60 * k}px ${LABEL_FONT}`;
		c.strokeText(main, x, y);
		c.shadowColor = theme.primaryCss;
		c.shadowBlur = 14;
		c.fillStyle = theme.inkCss;
		c.fillText(main, x, y);
		x += wMain * k;
		if (tail) {
			c.shadowBlur = 0;
			c.font = `bold ${44 * k}px ${LABEL_FONT}`;
			c.strokeText(tail, x, y);
			c.shadowBlur = 12;
			c.fillStyle = theme.primaryCss;
			c.fillText(tail, x, y);
		}
		c.shadowBlur = 0;
		s.tex.update();
	}

	const waveColor = new Color3();

	return {
		shot(from, to, kind, now, overdrive) {
			const t = acquire(tracers, now);
			t.from.set(from.x, FX_Y, from.z);
			t.to.set(to.x, FX_Y, to.z);
			// overdrive: heavy shots thicken into beams
			t.width = TRACER_W[kind] * (kind === "heavy" ? 1 + 0.8 * overdrive : 1);
			t.start = now;
			t.dur = TRACER_MS[kind] + HEAD_MS;
			t.live = true;
			t.beam.material = beamMat[kind];
			t.beam.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
			t.beam.scaling.set(t.width, t.width, 0.001);
			t.beam.position.copyFrom(t.from);
			t.head.position.copyFrom(t.from);
			t.beam.visibility = 1;
			t.head.visibility = 1;
			t.head.scaling.setAll(HEAD_SIZE[kind]);
			t.beam.setEnabled(true);
			t.head.setEnabled(true);
			const color = kind === "light" ? theme.primary : hot;
			flash(from.x, from.z, MUZZLE_SIZE[kind], MUZZLE_MS[kind], color, now);
		},
		kill(x, y, color, boss, now, credit) {
			flash(x, y, boss ? 6 : 2.4, KILL_FLASH_MS * (boss ? 2 : 1), white, now);

			const b = acquire(bursts, now);
			b.start = now;
			b.live = true;
			b.at.set(x, FX_Y, y);
			// white-hot streaks cooling to the family colour
			b.sparks.color1 = new Color4(1, 1, 1, 1);
			b.sparks.color2 = new Color4(
				0.5 + color[0] * 0.5,
				0.5 + color[1] * 0.5,
				0.5 + color[2] * 0.5,
				1,
			);
			b.sparks.colorDead = new Color4(color[0], color[1], color[2], 0);
			b.sparks.manualEmitCount = boss ? 36 : 13;
			b.sparks.minEmitPower = boss ? 20 : 14;
			b.sparks.maxEmitPower = boss ? 34 : 24;
			b.gibs.color1 = new Color4(color[0], color[1], color[2], 1);
			b.gibs.color2 = new Color4(
				color[0] * 0.55,
				color[1] * 0.55,
				color[2] * 0.55,
				1,
			);
			b.gibs.colorDead = new Color4(
				color[0] * 0.2,
				color[1] * 0.2,
				color[2] * 0.2,
				0,
			);
			b.gibs.manualEmitCount = boss ? 24 : 10;

			const w = acquire(waves, now);
			w.start = now;
			w.dur = boss ? BOSS_WAVE_MS : WAVE_MS;
			w.radius = boss ? BOSS_WAVE_RADIUS : WAVE_RADIUS;
			waveColor.set(color[0], color[1], color[2]);
			Color3.LerpToRef(white, waveColor, 0.35, w.color);
			w.mat.emissiveColor.copyFrom(w.color);
			w.live = true;
			w.mesh.position.x = x;
			w.mesh.position.z = y;
			w.mesh.scaling.setAll(0.05);
			w.mesh.visibility = 1;
			w.mesh.setEnabled(true);

			const s = acquire(scorches, now);
			s.start = now;
			s.dur = SCORCH_MS * (boss ? 2 : 1);
			s.live = true;
			s.mesh.position.x = x;
			s.mesh.position.z = y;
			s.mesh.scaling.setAll(boss ? 4.5 : 1.8);
			s.mesh.visibility = 1;
			s.mesh.setEnabled(true);

			if (credit && credit.points > 0) {
				const l = acquire(scores, now);
				drawScore(l, credit.points, credit.mult);
				l.start = now;
				l.live = true;
				l.x = x;
				l.z = y;
				l.big = boss || credit.mult >= 3;
				l.mat.alpha = 1;
				l.root.setEnabled(true);
			}
		},
		breach(x, y, now) {
			flash(x, y, 3, 140, theme.error, now);
			const w = acquire(waves, now);
			w.start = now;
			w.dur = 260;
			w.radius = 6;
			w.color.copyFrom(theme.error);
			w.mat.emissiveColor.copyFrom(w.color);
			w.live = true;
			w.mesh.position.x = x;
			w.mesh.position.z = y;
			w.mesh.scaling.setAll(0.05);
			w.mesh.visibility = 1;
			w.mesh.setEnabled(true);
		},
		spark(x, y, now) {
			const p = acquire(sparks, now);
			p.mesh.position.set(x, FX_Y, y);
			p.mesh.scaling.setAll(0.45);
			p.start = now;
			p.live = true;
			p.mesh.visibility = 1;
			p.mesh.setEnabled(true);
		},
		setLight(radius, gain) {
			light.scaling.setAll(radius);
			theme.primary.scaleToRef(gain * LIGHT_LEVEL, lightMat.emissiveColor);
		},
		update(now) {
			for (const t of tracers) {
				if (!t.live) continue;
				const age = now - t.start;
				if (age >= t.dur) {
					t.live = false;
					t.beam.setEnabled(false);
					t.head.setEnabled(false);
					continue;
				}
				// the head leads; the beam stretches from the muzzle behind it
				const reach = Math.min(1, age / HEAD_MS);
				const hx = t.from.x + (t.to.x - t.from.x) * reach;
				const hz = t.from.z + (t.to.z - t.from.z) * reach;
				const len = Math.hypot(hx - t.from.x, hz - t.from.z) || 0.001;
				const fade =
					age <= HEAD_MS ? 1 : 1 - (age - HEAD_MS) / (t.dur - HEAD_MS);
				t.beam.position.set((t.from.x + hx) / 2, FX_Y, (t.from.z + hz) / 2);
				t.beam.scaling.set(t.width * (0.5 + 0.5 * fade), t.width, len);
				t.beam.visibility = fade * fade;
				t.head.position.set(hx, FX_Y + 0.05, hz);
				t.head.visibility = fade * fade;
			}
			for (const f of flashes) {
				if (!f.live) continue;
				const k = (now - f.start) / f.dur;
				if (k >= 1) {
					f.live = false;
					f.mesh.setEnabled(false);
					continue;
				}
				f.mesh.scaling.setAll(f.size * (0.6 + 0.4 * easeOut(k)));
				f.mesh.visibility = 1 - k;
			}
			for (const p of sparks) {
				if (!p.live) continue;
				const k = (now - p.start) / p.dur;
				if (k >= 1) {
					p.live = false;
					p.mesh.setEnabled(false);
					continue;
				}
				p.mesh.visibility = 1 - k;
			}
			for (const w of waves) {
				if (!w.live) continue;
				const k = (now - w.start) / w.dur;
				if (k >= 1) {
					w.live = false;
					w.mesh.setEnabled(false);
					continue;
				}
				const r = Math.max(0.05, w.radius * easeOut(k));
				// the ring thins as it spreads
				w.mesh.scaling.set(r, 1, r);
				w.mesh.visibility = 1 - k * k;
			}
			for (const s of scorches) {
				if (!s.live) continue;
				const k = (now - s.start) / s.dur;
				if (k >= 1) {
					s.live = false;
					s.mesh.setEnabled(false);
					continue;
				}
				s.mesh.visibility = 1 - k;
			}
			for (const b of bursts) {
				if (b.live && now - b.start > b.dur) b.live = false;
			}
			// score labels pop in, rise and fade, at a fixed on-screen size
			const unit = SCORE_PX / view.ppu / SCORE_GLYPH;
			for (const s of scores) {
				if (!s.live) continue;
				const k = (now - s.start) / s.dur;
				if (k >= 1) {
					s.live = false;
					s.root.setEnabled(false);
					continue;
				}
				const pop =
					k < 0.15
						? 0.5 + 0.7 * easeOut(k / 0.15)
						: 1.2 - 0.2 * Math.min(1, (k - 0.15) / 0.2);
				s.root.scaling.setAll(unit * pop * (s.big ? 1.35 : 1));
				s.root.position.set(s.x, SCORE_Y, s.z + 1.5 + 2.5 * easeOut(k));
				s.mat.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
			}
		},
		dispose() {
			for (const t of tracers) {
				t.beam.dispose();
				t.head.dispose();
			}
			for (const m of Object.values(beamMat)) m.dispose();
			headMat.dispose();
			for (const f of flashes) f.mesh.dispose(false, true);
			for (const p of sparks) p.mesh.dispose();
			sparkMat.dispose();
			for (const w of waves) w.mesh.dispose(false, true);
			for (const s of scorches) s.mesh.dispose(false, true);
			scorchTex.dispose();
			light.dispose(false, true);
			lightTex.dispose();
			for (const b of bursts) {
				b.sparks.dispose(false);
				b.gibs.dispose(false);
			}
			streakTex.dispose();
			gibTex.dispose();
			for (const s of scores) s.root.dispose(false, true);
		},
	};
}
