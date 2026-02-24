import { Engine, Render } from 'matter-js';

export interface SceneSize {
  W: number;
  H: number;
}

export interface EngineTuneOptions {
  smallWidthThreshold?: number;
  smallPositionIterations?: number;
  smallConstraintIterations?: number;
  largePositionIterations?: number;
  largeConstraintIterations?: number;
}

export interface EngineCreateOptions extends EngineTuneOptions {
  enableSleeping?: boolean;
  velocityIterations?: number;
}

export interface RenderCreateOptions {
  wireframes?: boolean;
  background?: string;
  pixelRatio?: number;
}

/**
 * Create a Matter.js Engine with sane defaults for this project
 * and tune iterations based on scene width for stability.
 */
export function createEngine(size: SceneSize, opts: EngineCreateOptions = {}): Engine {
  const engine = Engine.create();

  // Defaults aligned with current component behavior
  engine.enableSleeping = opts.enableSleeping ?? true;
  engine.velocityIterations = opts.velocityIterations ?? 8;

  // Set a baseline before tuning
  engine.positionIterations = opts.largePositionIterations ?? 10;
  engine.constraintIterations = opts.largeConstraintIterations ?? 8;

  tuneEngineIterations(engine, size.W, opts);
  return engine;
}

/**
 * Adjust engine iterations based on available width.
 * Increase iterations on small canvases to reduce jitter.
 */
export function tuneEngineIterations(engine: Engine, width: number, opts: EngineTuneOptions = {}): void {
  const smallThreshold = opts.smallWidthThreshold ?? 700;
  const smallPos = opts.smallPositionIterations ?? 12;
  const smallCon = opts.smallConstraintIterations ?? 12;
  const largePos = opts.largePositionIterations ?? 10;
  const largeCon = opts.largeConstraintIterations ?? 8;

  if (width < smallThreshold) {
    engine.positionIterations = smallPos;
    engine.constraintIterations = smallCon;
  } else {
    engine.positionIterations = largePos;
    engine.constraintIterations = largeCon;
  }
}

/**
 * Create a Matter.js Render bound to an existing canvas with
 * consistent defaults (transparent bg, devicePixelRatio, etc.).
 */
export function createRender(
  canvas: HTMLCanvasElement,
  engine: Engine,
  size: SceneSize,
  opts: RenderCreateOptions = {},
): Render {
  const pixelRatio = opts.pixelRatio ?? (window.devicePixelRatio || 1);
  return Render.create({
    canvas,
    engine,
    options: {
      width: size.W,
      height: size.H,
      wireframes: opts.wireframes ?? false,
      background: opts.background ?? 'transparent',
      pixelRatio,
    },
  });
}

