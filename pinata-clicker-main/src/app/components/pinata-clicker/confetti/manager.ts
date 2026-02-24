import { Bodies, Body, Composite, Engine, Events, type IBodyDefinition, type IEvent } from 'matter-js';

import { CATEGORY } from '../matter/collision.ts';
import { getRandomInt } from '../utils/random-int.ts';
import { getRandomNumber } from '../utils/random-number.ts';


export class ConfettiManager {
  private engine?: Engine;
  private composite?: Composite;
  private afterUpdateHandler?: (event: IEvent<Engine>) => void;
  private readonly sceneWidth: number = 0;
  private readonly sceneHeight: number = 0;
  private loadedSprites: Array<{ texture: string; width: number; height: number }> = [];


  constructor(init?: { width?: number; height?: number }) {
    if (init?.width != null) this.sceneWidth = init.width;
    if (init?.height != null) this.sceneHeight = init.height;
  }


  init(engine: Engine): Composite {
    this.engine = engine;
    const confetti = Composite.create({ label: 'confetti' });
    this.composite = confetti;

    const margin = 40;
    this.afterUpdateHandler = () => {
      const sw = this.sceneWidth;
      const sh = this.sceneHeight;
      const bodies = [...(this.composite?.bodies ?? [])];
      for (const b of bodies) {
        const x = b.position.x;
        const y = b.position.y;
        if (x < -margin || x > sw + margin || y < -margin || y > sh + margin) {
          Composite.remove(confetti, b, true);
        }
      }
    };
    Events.on(engine, 'afterUpdate', this.afterUpdateHandler);

    return confetti;
  }


  destroy(): void {
    try {
      if (this.engine && this.afterUpdateHandler) {
        Events.off(this.engine, 'afterUpdate', this.afterUpdateHandler);
      }
      if (this.engine && this.composite) {
        Composite.remove(this.engine.world, this.composite, true);
      }
    } catch {}
    this.afterUpdateHandler = undefined;
    this.composite = undefined;
    this.engine = undefined;
    this.loadedSprites = [];
  }


  spawn(x: number, y: number, parentImpulse?: { x: number, y: number }): void {
    if (!this.composite) return;

    const count = getRandomNumber(2, 5);
    const colors = ['#ff3b3b', '#ffb800', '#00c853', '#2979ff', '#7c4dff', '#ff6d00', '#00bfa5'];
    const refH = 720;
    // Size scale: used for piece size only (keeps visual size proportional to scene height)
    const sizeScale = (this.sceneHeight || refH) / refH;
    // Velocity scale: drive perceived speed relative to scene width to keep behavior consistent
    const refW = 800;
    const velScale = Math.max(0.25, (this.sceneWidth || refW) / refW);
    const pieces = Array.from({ length: count }, () => {
      const hasSprites = this.loadedSprites.length > 0;
      const size = getRandomNumber(70 * sizeScale, 120 * sizeScale);
      const radius = size * 0.5;

      const circleOptions: IBodyDefinition = {
        collisionFilter: { category: CATEGORY.Confetti, mask: 0x0000 },
        frictionAir: getRandomNumber(0.02, 0.03),
        restitution: 0.4,
        density: 0.0005,
        angle: getRandomNumber(0, Math.PI),
        render: hasSprites
          ? { sprite: this.pickConfettiSprite(size) }
          : { fillStyle: colors[getRandomInt(0, colors.length - 1)] },
      };

      const piece = Bodies.circle(
        x + getRandomNumber(-25, 25) * sizeScale,
        y + getRandomNumber(-18, 18) * sizeScale,
        radius,
        circleOptions,
      );

      Body.setVelocity(piece, {
        x: getRandomNumber(-10, 10) * velScale + (parentImpulse?.x || 0),
        y: (-10 - getRandomNumber(0, 5)) * velScale + (parentImpulse?.y || 0),
      });

      Body.setAngularVelocity(piece, getRandomNumber(-0.15, 0.15));

      return piece;
    });
    Composite.add(this.composite, pieces);
  }


  /**
   * Spawns confetti at a body's current position, carrying some of its current
   * motion as initial impulse. Optional jitter multiplicative noise.
   */
  spawnAtBody(body: Body, opts: { jitter?: number } = {}): void {
    // Use width-scaled factor for consistent perceived impulse across sizes
    const refW = 800;
    const widthScale = Math.max(0.25, (this.sceneWidth || refW) / refW);
    const k = 0.35 * widthScale;
    const j = Math.max(0, opts.jitter ?? 0);
    const jitter = (1 - j * 0.5) + getRandomNumber(0, j);

    const impulse = {
      x: body.velocity.x * k * jitter,
      y: body.velocity.y * k * jitter,
    };

    this.spawn(body.position.x, body.position.y, impulse);
  }


  burstFromCenter(forceScale = 1): void {
    if (!this.engine || !this.composite) return;
    const g = this.engine.gravity;
    const cx = this.sceneWidth * 0.5;
    const cy = this.sceneHeight * 0.5;
    const bodies = [...(this.composite.bodies ?? [])];

    for (const b of bodies) {
      const dx = b.position.x - cx;
      const dy = b.position.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const weightPerStep = b.mass * Math.abs(g.y || 1) * (g.scale || 0.001);
      const baseK = 80 * forceScale;
      const sizeScale = (this.sceneWidth || 800) / 800;
      const k = baseK * sizeScale;
      const jitter = getRandomNumber(0.75, 1.25);

      Body.applyForce(b, b.position, {
        x: nx * k * weightPerStep * jitter,
        y: ny * k * weightPerStep * jitter,
      });
      Body.setAngularVelocity(b, (b.angularVelocity ?? 0) + getRandomNumber(-0.1, 0.1));
    }
  }


  async setImages(urls: string[]): Promise<void> {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    if (!unique.length) {
      this.loadedSprites = [];
      return;
    }

    const loaders = unique.map((src) =>
      new Promise<{ texture: string; width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ texture: src, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = reject;
        img.src = src;
      }),
    );

    try {
      const loaded = await Promise.all(loaders);
      this.loadedSprites = loaded.filter((i) => i.width > 0 && i.height > 0);
    } catch {
      const settled = await Promise.allSettled(loaders);
      this.loadedSprites = settled
        .filter((r): r is PromiseFulfilledResult<{ texture: string; width: number; height: number }> => r.status === 'fulfilled')
        .map((r) => r.value);
    }
  }


  private pickConfettiSprite(targetSize: number): { texture: string; xScale: number; yScale: number } {
    if (!this.loadedSprites.length) {
      return { texture: '', xScale: 1, yScale: 1 };
    }

    const index = getRandomInt(0, this.loadedSprites.length - 1);
    const item = this.loadedSprites[index];

    const xScale = targetSize / item.width;
    const yScale = targetSize / item.height;

    return { texture: item.texture, xScale, yScale };
  }
}
