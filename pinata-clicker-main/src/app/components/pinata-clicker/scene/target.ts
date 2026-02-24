import { Bodies, Body, type Composite, Constraint, type Render } from 'matter-js';

import { applySprite } from '../matter/sprites.ts';


export interface TargetSpriteInfo {
  texture: string;
  width: number;
  height: number;
}


export interface TargetPhysicsOptions {
  friction: number;
  restitution: number;
  frictionAir: number;
  density: number;
  chamferRadius: number;
  constraintStiffness: number;
  constraintDamping: number;
}


const DEFAULT_PHYSICS: TargetPhysicsOptions = {
  friction: 0.8,
  restitution: 0.01,
  frictionAir: 0.03,
  density: 0.002,
  chamferRadius: 8,
  constraintStiffness: 0.85,
  constraintDamping: 0.25,
};


export class TargetManager {
  private readonly params: {
    anchorX: number;
    anchorY: number;
    segmentCount: number;
    segmentWidth: number;
    H: number;
    W: number;
    ropeGroup: number;
  };

  private spriteInfo: TargetSpriteInfo;
  private readonly physics: TargetPhysicsOptions;
  private target?: Body;
  private isPressed: boolean = false;


  constructor(init: {
    anchorX: number;
    anchorY: number;
    segmentCount: number;
    segmentWidth: number;
    H: number;
    W: number;
    ropeGroup: number;
    sprite: TargetSpriteInfo;
    physics?: Partial<TargetPhysicsOptions>;
    label?: string;
  }) {
    this.params = {
      anchorX: init.anchorX,
      anchorY: init.anchorY,
      segmentCount: init.segmentCount,
      segmentWidth: init.segmentWidth,
      H: init.H,
      W: init.W,
      ropeGroup: init.ropeGroup,
    };
    this.spriteInfo = init.sprite;
    this.physics = { ...DEFAULT_PHYSICS, ...(init.physics ?? {}) };
  }


  public create(rope: Composite, segmentHeight: number): { target: Body; bottomConstraint: Constraint } {
    const target = this.buildTarget();
    this.target = target;
    const bottomConstraint = this.buildConstraint(target, rope, segmentHeight);
    return { target, bottomConstraint };
  }


  public destroy(): void {
    // no-op for now; kept for symmetry with other managers
    this.isPressed = false;
    this.target = undefined;
  }


  public press(scale: number = 0.95): void {
    if (!this.target || this.isPressed) return;
    try {
      Body.scale(this.target, scale, scale);
      this.syncSpriteScale(scale);
      this.isPressed = true;
    } catch {}
  }


  public release(scale: number = 0.95): void {
    if (!this.target || !this.isPressed) return;
    const inv = 1 / Math.max(0.0001, scale);
    try {
      Body.scale(this.target, inv, inv);
      this.syncSpriteScale(inv);
      this.isPressed = false;
    } catch {}
  }


  public setSprite(render: Render, sprite: TargetSpriteInfo, opts: { keepScale?: boolean } = {}): void {
    if (!this.target) return;

    this.spriteInfo = sprite;

    try {
      applySprite(render, this.target, sprite, opts);
    } catch {}
  }


  private buildTarget(): Body {
    const { anchorX, anchorY, H, ropeGroup } = this.params;
    const p = this.physics;

    const rectHeight = 0.8 * H;
    const baseW = Math.max(1, this.spriteInfo.width);
    const baseH = Math.max(1, this.spriteInfo.height);
    const rectWidth = rectHeight * (baseW / baseH);

    const spriteXScale = rectWidth / baseW;
    const spriteYScale = rectHeight / baseH;

    const target: Body = Bodies.rectangle(
      anchorX,
      anchorY + rectHeight / 2 + rectHeight * 0.33,
      rectWidth,
      rectHeight,
      {
        label: 'target',
        chamfer: { radius: p.chamferRadius },
        friction: p.friction,
        restitution: p.restitution,
        frictionAir: p.frictionAir,
        density: p.density,
        render: {
          fillStyle: '#d36b6b',
          sprite: {
            texture: this.spriteInfo.texture,
            xScale: spriteXScale,
            yScale: spriteYScale,
          },
          strokeStyle: '#ff6',
          lineWidth: 2,
        },
      },
    );

    target.collisionFilter.group = ropeGroup;
    return target;
  }


  private buildConstraint(target: Body, rope: Composite, segmentHeight: number): Constraint {
    const rectHeight = target.bounds.max.y - target.bounds.min.y;
    const rectWidth = target.bounds.max.x - target.bounds.min.x;

    return Constraint.create({
      label: 'target-bottom-constraint',
      bodyA: rope.bodies[rope.bodies.length - 1],
      pointA: { x: 0, y: segmentHeight * 0.5 },
      bodyB: target,
      pointB: { x:  rectWidth * 0.03, y: -rectHeight * 0.3 },
      stiffness: this.physics.constraintStiffness,
      damping: this.physics.constraintDamping,
      length: 0,
      render: { visible: false },
    });
  }


  private syncSpriteScale(factor: number): void {
    const t = this.target;
    if (!t) return;

    const sprite = t.render.sprite;
    if (!sprite) return;

    sprite.xScale = (sprite.xScale ?? 1) * factor;
    sprite.yScale = (sprite.yScale ?? 1) * factor;
    t.render.sprite = sprite;
  }

}
