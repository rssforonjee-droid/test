import type Matter from 'matter-js';
import { Bodies, Body, Composite, Engine, Events } from 'matter-js';

import { CATEGORY } from '../matter/collision.ts';
import type { LoadedSprite } from '../matter/sprites.ts';
import { getRandomNumber } from '../utils/random-number.ts';


interface SpawnOptions {
  spread?: number;
}


export class BonusManager {
  private readonly lifetimeMs: number = 6000;
  private readonly fadeDurationMs: number = 1200;

  private engine?: Engine;
  private composite?: Composite;
  private beforeUpdateHandler?: (event: Matter.IEvent<Engine>) => void;
  private afterUpdateHandler?: (event: Matter.IEvent<Engine>) => void;
  private sprite?: LoadedSprite;
  private readonly sceneWidth: number;
  private readonly sceneHeight: number;
  private readonly bonusSpawnTimes = new WeakMap<Body, number>();


  constructor(init: { width?: number; height?: number } = {}) {
    this.sceneWidth = init.width ?? 0;
    this.sceneHeight = init.height ?? 0;
  }


  init(engine: Engine): Composite {
    this.engine = engine;
    const composite = Composite.create({ label: 'bonus-items' });
    this.composite = composite;

    this.beforeUpdateHandler = () => {
      if (!this.engine || !this.composite) return;
      const g = this.engine.gravity;
      const weightFactor = Math.abs(g.y || 1) * (g.scale || 0.001);
      for (const body of [...this.composite.bodies]) {
        const weightPerStep = body.mass * weightFactor;
        Body.applyForce(body, body.position, { x: 0, y: -weightPerStep * 2.4 });
      }
    };

    this.afterUpdateHandler = () => {
      if (!this.composite) return;
      const margin = 80;
      const now = Date.now();
      for (const body of [...this.composite.bodies]) {
        const spawnAt = this.bonusSpawnTimes.get(body);
        if (spawnAt != null) {
          const age = now - spawnAt;
          const fadeProgress = Math.min(age / this.fadeDurationMs, 1);
          body.render.opacity = 1 - fadeProgress;

          if (age >= this.fadeDurationMs || age > this.lifetimeMs) {
            Composite.remove(this.composite, body, true);
            this.bonusSpawnTimes.delete(body);
            continue;
          }
        }

        const { x, y } = body.position;
        if (x < -margin || x > this.sceneWidth + margin || y < -margin || y > this.sceneHeight + margin) {
          Composite.remove(this.composite, body, true);
          this.bonusSpawnTimes.delete(body);
        }
      }
    };

    Events.on(engine, 'beforeUpdate', this.beforeUpdateHandler);
    Events.on(engine, 'afterUpdate', this.afterUpdateHandler);

    return composite;
  }


  destroy(): void {
    try {
      if (this.engine && this.beforeUpdateHandler) {
        Events.off(this.engine, 'beforeUpdate', this.beforeUpdateHandler);
      }
      if (this.engine && this.afterUpdateHandler) {
        Events.off(this.engine, 'afterUpdate', this.afterUpdateHandler);
      }
      if (this.engine && this.composite) {
        Composite.remove(this.engine.world, this.composite, true);
      }
    } catch {}
    this.beforeUpdateHandler = undefined;
    this.afterUpdateHandler = undefined;
    this.composite = undefined;
    this.engine = undefined;
  }


  setSprite(sprite?: LoadedSprite): void {
    this.sprite = sprite;
  }


  spawnAtBody(body: Body, opts: SpawnOptions = {}): void {
    if (!body) return;
    this.spawn(body.position.x, body.position.y, body.velocity, opts);
  }


  spawn(x: number, y: number, parentVelocity?: { x: number; y: number }, opts: SpawnOptions = {}): void {
    if (!this.composite || !this.sprite) return;

    const spread = Math.max(0, opts.spread ?? 32);
    const offsetX = getRandomNumber(-spread * 0.5, spread * 0.5);
    const offsetY = getRandomNumber(-spread * 0.25, spread * 0.25);

    const scale = this.computeSpriteScale();
    const width = Math.max(8, this.sprite.width * scale);
    const height = Math.max(8, this.sprite.height * scale);

    const bonus = Bodies.rectangle(
      x + offsetX,
      y + offsetY,
      width,
      height,
      {
        collisionFilter: { category: CATEGORY.Confetti, mask: 0x0000 },
        frictionAir: 0.012,
        restitution: 0.25,
        density: 0.0006,
        render: {
          opacity: 1,
          sprite: {
            texture: this.sprite.texture,
            xScale: scale,
            yScale: scale,
          },
        },
      },
    );

    Body.setInertia(bonus, Infinity);
    Body.setAngle(bonus, 0);
    Body.setAngularVelocity(bonus, 0);

    const vx = (parentVelocity?.x ?? 0) * 0.1 + getRandomNumber(-0.2, 0.2);
    const vy = Math.min(parentVelocity?.y ?? 0, 0) / 15 - 11 / 3 + getRandomNumber(-1, 0);
    Body.setVelocity(bonus, { x: vx, y: vy });

    this.bonusSpawnTimes.set(bonus, Date.now());
    Composite.add(this.composite, bonus);
  }


  accelerate(multiplier: number): void {
    if (!this.composite) return;
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    for (const body of this.composite.bodies) {
      Body.setVelocity(body, {
        x: body.velocity.x * multiplier,
        y: body.velocity.y * multiplier,
      });
    }
  }


  private computeSpriteScale(): number {
    if (!this.sprite || !this.sprite.height) return 1;
    const refHeight = 720;
    const sceneH = Math.max(1, this.sceneHeight || refHeight);
    const baseHeight = sceneH * (140 / refHeight);
    const minHeight = Math.max(24, sceneH * 0.05);
    const desiredHeight = Math.max(minHeight, baseHeight);
    const finalHeight = desiredHeight * 0.5;
    return finalHeight / Math.max(1, this.sprite.height);
  }
}
