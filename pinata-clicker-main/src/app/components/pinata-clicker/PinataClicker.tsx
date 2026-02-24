'use client';

import '../../../../instrumentation-client';
import * as Sentry from '@sentry/nextjs';
import { Body, Composite, Constraint, Engine, Render, Runner } from 'matter-js';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { BonusManager } from './bonus/manager.ts';
import { ConfettiManager } from './confetti/manager.ts';
import { createEngine, createRender } from './matter/bootstrap.ts';
import { hitTestBodyAtClient } from './matter/pointer.ts';
import { applySprite, createPlaceholderSprite, type LoadedSprite, preloadImage } from './matter/sprites.ts';
import { getSceneSize } from './scene/layout.ts';
import { registerRopePainter } from './scene/rope-draw.ts';
import { getRope } from './scene/rope.ts';
import { TargetManager } from './scene/target.ts';
import { getWalls } from './scene/walls.ts';

const { logger } = Sentry;


export type PinataClickerHandle = {
  reset: () => void;
  pause: () => void;
  resume: () => void;
  hit: () => void;
};

export type PinataClickerProps = {
  confettiImages?: string[];
  hitsToDestroy?: number;
  burstEvery?: number;
  targetImage?: string;
  targetImageHit?: string;
  targetDestroyedImage?: string;
  bonusImage?: string;
  targetScaleDownFactor?: number;
  paused?: boolean;

  // React-колбэки вместо кастомных DOM-событий
  onTargetKicked?: (e: {
    hits: number;
    direction: 1 | -1;
    force: { x: number; y: number };
    position: { x: number; y: number };
  }) => void;

  onTargetDestroyed?: (e: {
    hits: number;
    scene: { width: number; height: number };
  }) => void;

  className?: string;
  style?: React.CSSProperties;
};

const DEFAULTS = {
  confettiImages: [] as string[],
  hitsToDestroy: 5,
  burstEvery: 10,
  targetScaleDownFactor: 0.97,
  paused: true,
};

const HIT_SPRITE_VISIBLE_MS = 150;

export const PinataClicker = forwardRef<PinataClickerHandle, PinataClickerProps>(function PinataClicker(
  props,
  ref,
) {
  const {
    confettiImages = DEFAULTS.confettiImages,
    hitsToDestroy = DEFAULTS.hitsToDestroy,
    burstEvery = DEFAULTS.burstEvery,
    targetImage,
    targetImageHit,
    targetDestroyedImage,
    bonusImage,
    targetScaleDownFactor = DEFAULTS.targetScaleDownFactor,
    paused = DEFAULTS.paused,
    onTargetKicked,
    onTargetDestroyed,
    className,
    style,
  } = props;

  // DOM
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Matter и менеджеры
  const engineRef = useRef<Engine | null>(null);
  const renderRef = useRef<Render | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const confettiRef = useRef<ConfettiManager | null>(null);
  const bonusRef = useRef<BonusManager | null>(null);
  const afterRenderOffRef = useRef<(() => void) | null>(null);

  // Сцена/состояние игры
  const sceneWRef = useRef<number | null>(null);
  const sceneHRef = useRef<number | null>(null);
  const hitsRef = useRef<number>(0);
  const destroyedRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(paused);
  const targetBodyRef = useRef<Body | null>(null);
  const targetManagerRef = useRef<TargetManager | null>(null);
  const targetConstraintRef = useRef<Constraint | null>(null);

  const capturePinataError = useCallback((error: unknown, context: string): void => {
    if (error == null) {
      return;
    }
    Sentry.captureException(error, (scope) => {
      scope.setTag('component', 'PinataClicker');
      scope.setContext('pinata', {
        context,
        hits: hitsRef.current,
        destroyed: destroyedRef.current,
        paused: pausedRef.current,
      });
      return scope;
    });
    logger.error('Pinata runtime error', {
      context,
      hits: hitsRef.current,
      destroyed: destroyedRef.current,
    });
  }, []);

  const safeInvoke = useCallback(<T,>(context: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (error) {
      capturePinataError(error, context);
      return undefined;
    }
  }, [capturePinataError]);

  const safeInvokeAsync = useCallback(async <T,>(context: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (error) {
      capturePinataError(error, context);
      return undefined;
    }
  }, [capturePinataError]);

  // Спрайты
  const targetSpriteRef = useRef<LoadedSprite | null>(null);
  const targetHitSpriteRef = useRef<LoadedSprite | null>(null);
  const targetDestroyedSpriteRef = useRef<LoadedSprite | null>(null);
  const bonusSpriteRef = useRef<LoadedSprite | null>(null);
  const preloadedConfettiRef = useRef<Set<string>>(new Set());

  // Слушатели
  const onPointerDownRef = useRef<((ev: PointerEvent) => void) | null>(null);
  const onPointerUpRef = useRef<((ev: PointerEvent) => void) | null>(null);
  const strikeRef = useRef<(() => void) | null>(null);
  const hitSpriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ResizeObserver
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const resizeTimerRef = useRef<number | null>(null);

  // Внутренний флажок для форс-пересборки сцены (reset)
  const [sceneToken, setSceneToken] = useState<number>(0);

  // ---------- Загрузка спрайтов ----------
  const loadBonusSprite = useCallback(async (url?: string): Promise<void> => {
    if (!url) {
      bonusSpriteRef.current = null;
      return;
    }
    try {
      bonusSpriteRef.current = await preloadImage(url);
    } catch (error) {
      capturePinataError(error, 'preload bonus sprite');
      bonusSpriteRef.current = createPlaceholderSprite(url, { width: 256, height: 256 });
    }
  }, [capturePinataError]);

  const preloadConfettiSprites = useCallback(async (urls: string[] = []): Promise<void> => {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    if (!unique.length) return;

    const cache = preloadedConfettiRef.current;
    const pending = unique.filter((src) => !cache.has(src));
    if (!pending.length) return;

    await Promise.all(
      pending.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const done = (): void => resolve();
            img.onload = () => {
              cache.add(src);
              done();
            };
            img.onerror = done;
            img.src = src;
          }),
      ),
    );
  }, []);

  const waitForFirstFrame = useCallback(async (
    render: Render,
    sprites: Array<LoadedSprite | null | undefined>,
  ): Promise<void> => {
    await Promise.all(
      sprites.map(async (sprite) => {
        if (!sprite?.image) return;
        if (sprite.image.complete) return;
        await new Promise<void>((resolve) => {
          const handle = (): void => resolve();
          sprite.image?.addEventListener('load', handle, { once: true });
          sprite.image?.addEventListener('error', handle, { once: true });
        });
      }),
    );

    await new Promise<void>((resolve) => {
      const runResolve = (): void => {
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          window.setTimeout(resolve, 17);
        } else {
          setTimeout(resolve, 17);
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => runResolve());
      } else {
        runResolve();
      }
    });
    safeInvoke('render.world', () => { Render.world(render); });
  }, [safeInvoke]);

  const loadTargetSprites = useCallback(async (
    targetUrl?: string,
    destroyedUrl?: string,
    hitUrl?: string,
  ): Promise<void> => {
    const tasks: Promise<void>[] = [];

    if (targetUrl) {
      tasks.push(
        preloadImage(targetUrl)
          .then((v) => {
            targetSpriteRef.current = v;
          })
          .catch((error) => {
            capturePinataError(error, 'preload target sprite');
            targetSpriteRef.current = createPlaceholderSprite(targetUrl, { width: 500, height: 500 });
          }),
      );
    } else {
      targetSpriteRef.current = null;
    }

    if (destroyedUrl) {
      tasks.push(
        preloadImage(destroyedUrl)
          .then((v) => {
            targetDestroyedSpriteRef.current = v;
          })
          .catch((error) => {
            capturePinataError(error, 'preload destroyed sprite');
            targetDestroyedSpriteRef.current = createPlaceholderSprite(destroyedUrl, { width: 500, height: 500 });
          }),
      );
    } else {
      targetDestroyedSpriteRef.current = null;
    }

    if (hitUrl) {
      tasks.push(
        preloadImage(hitUrl)
          .then((v) => {
            targetHitSpriteRef.current = v;
          })
          .catch((error) => {
            capturePinataError(error, 'preload hit sprite');
            targetHitSpriteRef.current = createPlaceholderSprite(hitUrl, { width: 500, height: 500 });
          }),
      );
    } else {
      targetHitSpriteRef.current = null;
    }

    await Promise.all(tasks);
  }, [capturePinataError]);

  const restoreIdleSprite = useCallback((opts: { force?: boolean } = {}): void => {
    const { force = false } = opts;
    if (destroyedRef.current) return;
    if (!force && hitSpriteTimeoutRef.current) {
      return;
    }
    if (hitSpriteTimeoutRef.current) {
      clearTimeout(hitSpriteTimeoutRef.current);
      hitSpriteTimeoutRef.current = null;
    }
    const sprite = targetSpriteRef.current;
    const manager = targetManagerRef.current;
    const render = renderRef.current;
    if (!sprite || !manager || !render) return;
    safeInvoke('targetManager.setSprite (idle sprite)', () => { manager.setSprite(render, sprite); });
  }, [safeInvoke]);

  const scheduleRestoreAfter = useCallback((delay: number): void => {
    if (hitSpriteTimeoutRef.current) {
      clearTimeout(hitSpriteTimeoutRef.current);
    }
    hitSpriteTimeoutRef.current = setTimeout(() => {
      hitSpriteTimeoutRef.current = null;
      restoreIdleSprite({ force: true });
    }, delay);
  }, [restoreIdleSprite]);

  const flashTargetHitSprite = useCallback((): void => {
    if (destroyedRef.current) return;
    const sprite = targetHitSpriteRef.current;
    const manager = targetManagerRef.current;
    const render = renderRef.current;
    if (!sprite || !manager || !render) return;

    safeInvoke('targetManager.setSprite (restore idle)', () => { manager.setSprite(render, sprite); });

    scheduleRestoreAfter(HIT_SPRITE_VISIBLE_MS);
  }, [safeInvoke, scheduleRestoreAfter]);

  // ---------- teardown ----------
  const teardownScene = useCallback((opts: { removeCanvas: boolean }): void => {
    const { removeCanvas } = opts;
    const render = renderRef.current;
    const runner = runnerRef.current;
    const engine = engineRef.current;
    Sentry.startSpan(
      {
        op: 'game.scene',
        name: 'pinata.teardownScene',
      },
      (span) => {
        span.setAttribute('pinata.removeCanvas', removeCanvas);
        logger.info('Teardown scene requested', {
          hasRender: Boolean(render),
          hasRunner: Boolean(runner),
        });

        // afterRender
        if (afterRenderOffRef.current) {
          safeInvoke('rope painter teardown', () => { afterRenderOffRef.current?.(); });
          afterRenderOffRef.current = null;
        }

        // Слушатели указателя
        const canvas = (render?.canvas ?? canvasRef.current) as HTMLCanvasElement | null;
        if (canvas && onPointerDownRef.current) {
          safeInvoke('canvas.removeEventListener(pointerdown)', () => {
            canvas.removeEventListener('pointerdown', onPointerDownRef.current!);
          });
        }
        if (onPointerUpRef.current) {
          safeInvoke('window.removeEventListener(pointerup/pointercancel)', () => {
            window.removeEventListener('pointerup', onPointerUpRef.current!);
            window.removeEventListener('pointercancel', onPointerUpRef.current!);
          });
        }
        onPointerDownRef.current = null;
        onPointerUpRef.current = null;
        strikeRef.current = null;
        if (hitSpriteTimeoutRef.current) {
          clearTimeout(hitSpriteTimeoutRef.current);
          hitSpriteTimeoutRef.current = null;
        }

        // Render / Runner
        if (render) {
          safeInvoke('teardown Render.stop', () => { Render.stop(render); });
          if (removeCanvas && canvas && canvas !== canvasRef.current) {
            safeInvoke('teardown canvas.remove', () => { canvas.remove(); });
          }
          type RenderWithTextures = Render & { textures?: Record<string, CanvasImageSource> };
          const textures = (render as RenderWithTextures).textures;
          if (textures) {
            Object.keys(textures).forEach((key) => { delete textures[key]; });
          }
        }
        if (runner && engine) {
          safeInvoke('teardown Runner.stop', () => { Runner.stop(runner); });
        }

        // Менеджеры
        safeInvoke('confetti.destroy', () => { confettiRef.current?.destroy(); });
        safeInvoke('bonus.destroy', () => { bonusRef.current?.destroy(); });
        safeInvoke('targetManager.destroy', () => { targetManagerRef.current?.destroy(); });

        // Обнуление ссылок
        engineRef.current = null;
        renderRef.current = null;
        runnerRef.current = null;
        confettiRef.current = null;
        bonusRef.current = null;
        targetManagerRef.current = null;
        targetBodyRef.current = null;
        targetConstraintRef.current = null;

        sceneWRef.current = null;
        sceneHRef.current = null;
      },
    );
  }, [safeInvoke]);

  // ---------- destroyTarget ----------
  const destroyTarget = useCallback((): void => {
    if (destroyedRef.current) return;
    Sentry.startSpan(
      {
        op: 'game.state',
        name: 'pinata.destroyTarget',
      },
      (span) => {
        destroyedRef.current = true;
        span.setAttribute('pinata.hits', hitsRef.current);
        span.setAttribute('pinata.scene.width', sceneWRef.current ?? 0);
        span.setAttribute('pinata.scene.height', sceneHRef.current ?? 0);
        logger.info('Destroy target triggered', { hits: hitsRef.current });

        if (hitSpriteTimeoutRef.current) {
          clearTimeout(hitSpriteTimeoutRef.current);
          hitSpriteTimeoutRef.current = null;
        }

        const render = renderRef.current;
        const canvas = (render?.canvas ?? canvasRef.current) as HTMLCanvasElement | null;
        if (canvas && onPointerDownRef.current) {
          safeInvoke('destroyTarget canvas.removeEventListener(pointerdown)', () => {
            canvas.removeEventListener('pointerdown', onPointerDownRef.current!);
          });
        }
        if (onPointerUpRef.current) {
          safeInvoke('destroyTarget window.removeEventListener(pointerup/pointercancel)', () => {
            window.removeEventListener('pointerup', onPointerUpRef.current!);
            window.removeEventListener('pointercancel', onPointerUpRef.current!);
          });
        }
        onPointerDownRef.current = null;
        onPointerUpRef.current = null;

        if (targetDestroyedSpriteRef.current && renderRef.current && targetManagerRef.current) {
          safeInvoke('targetManager.setSprite (destroyed immediate)', () => {
            targetManagerRef.current?.setSprite(renderRef.current!, targetDestroyedSpriteRef.current!, { keepScale: true });
          });
        } else if (targetDestroyedImage) {
          void loadTargetSprites(undefined, targetDestroyedImage).then(() => {
            if (renderRef.current && targetManagerRef.current && targetDestroyedSpriteRef.current) {
              targetManagerRef.current.setSprite(renderRef.current, targetDestroyedSpriteRef.current, { keepScale: true });
            }
          });
        }

        const manager = targetManagerRef.current;
        const target = targetBodyRef.current;
        if (manager && target) {
          safeInvoke('targetManager.release (destroy)', () => { manager.release(targetScaleDownFactor); });
          safeInvoke('applySprite(target destroyed)', () => {
            if (renderRef.current && targetDestroyedSpriteRef.current) {
              applySprite(renderRef.current, target, targetDestroyedSpriteRef.current, { keepScale: true });
            }
          });
          Body.setStatic(target, true);
          const engine = engineRef.current;
          const bottomConstraint = targetConstraintRef.current;
          if (engine && bottomConstraint) {
            safeInvoke('Composite.remove(bottom constraint)', () => {
              Composite.remove(engine.world, bottomConstraint);
            });
          }
          targetConstraintRef.current = null;
        }

        safeInvoke('bonus.accelerate', () => { bonusRef.current?.accelerate(3); });
        safeInvoke('confetti.burstFromCenter', () => { confettiRef.current?.burstFromCenter(); });

        if (onTargetDestroyed) {
          onTargetDestroyed({
            hits: hitsRef.current,
            scene: {
              width: sceneWRef.current ?? 0,
              height: sceneHRef.current ?? 0,
            },
          });
        }
      },
    );
  }, [loadTargetSprites, onTargetDestroyed, safeInvoke, targetDestroyedImage, targetScaleDownFactor]);

  // ---------- setupScene ----------
  const setupScene = useCallback(async (): Promise<void> => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (!targetImage) return;

    // Гарантировать спрайты
    if (!targetSpriteRef.current) {
      await safeInvokeAsync('loadTargetSprites(initial)', () =>
        loadTargetSprites(targetImage, targetDestroyedImage, targetImageHit),
      );
    }
    if (bonusImage && !bonusSpriteRef.current) {
      await safeInvokeAsync('loadBonusSprite(initial)', () => loadBonusSprite(bonusImage));
    }
    await safeInvokeAsync('preloadConfettiSprites(initial)', () => preloadConfettiSprites(confettiImages));

    // Размеры сцены
    const { W, H } = getSceneSize(host);
    sceneWRef.current = W;
    sceneHRef.current = H;

    // Engine/Render
    const engine = createEngine({ W, H });
    const render = createRender(canvas, engine, { W, H }, {
      wireframes: false,
      background: 'transparent',
    });

    // Стены
    const wallThickness = Math.max(20, Math.round(0.02 * Math.min(W, H)));
    const walls = getWalls(W, H, wallThickness);

    // Канат/якорь
    const anchorX = 0.5 * W;
    const anchorY = -0.1 * H;

    const totalChainLength = 0.35 * H;
    const targetSegW = 30;
    const minSegments = 5;
    const maxSegments = 18;
    const segmentCount = Math.max(minSegments, Math.min(maxSegments, Math.round(totalChainLength / targetSegW)));
    const segmentWidth = totalChainLength / segmentCount;
    const segmentHeight = totalChainLength / segmentCount;

    const { ropeGroup, rope, topConstraint } = getRope({
      anchorX,
      anchorY,
      segmentCount,
      segmentWidth,
      segmentHeight,
    });

    const spriteInfo = targetSpriteRef.current ?? { texture: targetImage, width: 500, height: 500 };
    const targetManager = new TargetManager({
      anchorX,
      anchorY,
      segmentCount,
      segmentWidth,
      H,
      W,
      ropeGroup,
      sprite: spriteInfo,
    });
    targetManagerRef.current = targetManager;

    const { target, bottomConstraint } = targetManager.create(rope, segmentHeight);
    targetBodyRef.current = target;
    targetConstraintRef.current = bottomConstraint;

    if (targetSpriteRef.current) {
      safeInvoke('applySprite(target idle)', () => {
        applySprite(render, target, targetSpriteRef.current!, { keepScale: true });
      });
    }

    const ropeThickness = Math.max(1, Math.min(18, segmentHeight * 0.45));
    afterRenderOffRef.current = registerRopePainter(render, {
      anchorX,
      anchorY,
      rope,
      thickness: ropeThickness,
    });

    if (destroyedRef.current && targetDestroyedSpriteRef.current) {
      safeInvoke('targetManager.setSprite (destroyed restore)', () => {
        targetManager.setSprite(render, targetDestroyedSpriteRef.current!);
      });
    }

    // Удар
    let lastDirection: 1 | -1 = 1;
    const applyKick = (): void => {
      const g = engine.gravity;
      const weightPerStep = target.mass * Math.abs(g.y || 1) * (g.scale || 0.001);
      const baseWidth = 800;
      const widthScale = Math.max(0.5, Math.min(1, (sceneWRef.current ?? W) / baseWidth));
      const kY = 5 * widthScale;
      const kX = 25 * widthScale;
      lastDirection = (lastDirection * -1) as 1 | -1;

      const fx = lastDirection * kX * weightPerStep;
      const fy = -kY * weightPerStep;

      Body.applyForce(target, target.position, { x: fx, y: fy });

      if (burstEvery > 0 && hitsRef.current % burstEvery === 0 && hitsRef.current !== hitsToDestroy) {
        safeInvoke('confetti.burstFromCenter (milestone)', () => { confettiRef.current?.burstFromCenter(0.5); });
      }

      if (onTargetKicked) {
        onTargetKicked({
          hits: hitsRef.current,
          direction: lastDirection,
          force: { x: fx, y: fy },
          position: { x: target.position.x, y: target.position.y },
        });
      }
    };

    const handleStrike = (): void => {
      Sentry.startSpan(
        {
          op: 'game.hit',
          name: 'pinata.handleStrike',
        },
        (span) => {
          if (pausedRef.current || destroyedRef.current) {
            span.setAttribute('pinata.skipped', true);
            return;
          }
          flashTargetHitSprite();
          hitsRef.current += 1;
          span.setAttribute('pinata.hits', hitsRef.current);
          span.setAttribute('pinata.remaining', Math.max(hitsToDestroy - hitsRef.current, 0));
          logger.debug('Strike registered', {
            hits: hitsRef.current,
            hitsToDestroy,
          });

          // общие эффекты
          safeInvoke('confetti.spawnAtBody', () => { confettiRef.current?.spawnAtBody(target, { jitter: 0.25 }); });
          safeInvoke('bonus.spawnAtBody', () => { bonusRef.current?.spawnAtBody(target, { spread: 36 }); });

          if (hitsRef.current >= hitsToDestroy) {
            applyKick();
            destroyTarget();
            span.setAttribute('pinata.completed', true);
            return;
          }

          applyKick();
        },
      );
    };
    strikeRef.current = handleStrike;

    // Менеджеры
    const confetti = new ConfettiManager({ width: W, height: H });
    confettiRef.current = confetti;
    void confetti.setImages(confettiImages);
    const confettiComposite = confetti.init(engine);

    const bonus = new BonusManager({ width: W, height: H });
    bonusRef.current = bonus;
    bonus.setSprite(bonusSpriteRef.current ?? undefined);
    const bonusComposite = bonus.init(engine);

    // Слушатели pointer
    onPointerDownRef.current = (ev: PointerEvent) => {
      if (pausedRef.current) return;
      if (destroyedRef.current) return;
      if (ev.button != null && ev.button !== 0) return;
      const tBody = targetBodyRef.current;
      if (tBody && targetManagerRef.current && hitTestBodyAtClient(tBody, ev, canvas, { W, H })) {
        safeInvoke('targetManager.press(pointer down)', () => {
          targetManagerRef.current!.press(targetScaleDownFactor);
        });
      }
      handleStrike();
    };
    onPointerUpRef.current = () => {
      if (pausedRef.current) return;
      safeInvoke('targetManager.release(pointer up)', () => {
        targetManagerRef.current?.release(targetScaleDownFactor);
      });
      restoreIdleSprite();
    };

    canvas.addEventListener('pointerdown', onPointerDownRef.current);
    window.addEventListener('pointerup', onPointerUpRef.current);
    window.addEventListener('pointercancel', onPointerUpRef.current);

    // Мир
    Composite.add(engine.world, [
      ...walls,
      rope,
      topConstraint,
      target,
      bottomConstraint,
      confettiComposite,
      bonusComposite,
    ]);

    engineRef.current = engine;
    renderRef.current = render;

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);
    runnerRef.current = runner;

    if (pausedRef.current) {
      await waitForFirstFrame(render, [targetSpriteRef.current, targetDestroyedSpriteRef.current]);
      safeInvoke('pause Render.stop', () => { Render.stop(render); });
      safeInvoke('pause Runner.stop', () => { Runner.stop(runner); });
    }
  }, [
    bonusImage,
    burstEvery,
    destroyTarget,
    flashTargetHitSprite,
    hitsToDestroy,
    loadBonusSprite,
    loadTargetSprites,
    onTargetKicked,
    restoreIdleSprite,
    targetDestroyedImage,
    targetImage,
    targetImageHit,
    targetScaleDownFactor,
    waitForFirstFrame,
    confettiImages,
    preloadConfettiSprites,
    safeInvoke,
    safeInvokeAsync,
  ]);

  // ---------- эффекты жизненного цикла ----------
  // Инициализация (загрузка спрайтов + сцена) и ресайз-обсервер
  useEffect(() => {
    let cancelled = false;

    const mount = async (): Promise<void> => {
      hitsRef.current = 0;
      destroyedRef.current = false;

      await Promise.all([
        loadTargetSprites(targetImage, targetDestroyedImage, targetImageHit),
        loadBonusSprite(bonusImage),
        preloadConfettiSprites(confettiImages),
      ]);

      if (!cancelled) {
        await setupScene();
      }

      // Resize observer
      if (!cancelled && hostRef.current) {
        const obs = new ResizeObserver(() => {
          const t = resizeTimerRef.current;
          if (t != null) window.clearTimeout(t);
          resizeTimerRef.current = window.setTimeout(() => {
            resizeTimerRef.current = null;
            // мягкая пересборка без удаления canvas
            teardownScene({ removeCanvas: false });
            void setupScene();
          }, 80);
        });
        resizeObsRef.current = obs;
        obs.observe(hostRef.current);
      }
    };

    void mount();

    return () => {
      cancelled = true;

      // stop resize
      if (resizeObsRef.current) {
        safeInvoke('ResizeObserver.disconnect', () => { resizeObsRef.current?.disconnect(); });
        resizeObsRef.current = null;
      }
      const t = resizeTimerRef.current;
      if (t != null) {
        window.clearTimeout(t);
        resizeTimerRef.current = null;
      }

      // полное выключение, canvas оставляем (он в разметке)
      teardownScene({ removeCanvas: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneToken]); // reset перезапускает этот эффект

  // Пауза через пропс
  useEffect(() => {
    const render = renderRef.current;
    const engine = engineRef.current;
    const runner = runnerRef.current;

    if (paused && !pausedRef.current) {
      pausedRef.current = true;
      safeInvoke('reset Render.stop', () => { if (render) Render.stop(render); });
      safeInvoke('reset Runner.stop', () => { if (runner && engine) Runner.stop(runner); });
    } else if (!paused && pausedRef.current) {
      pausedRef.current = false;
      safeInvoke('resume Render.run', () => { if (render) Render.run(render); });
      safeInvoke('resume Runner.run', () => { if (runner && engine) Runner.run(runner, engine); });
    }
  }, [paused, safeInvoke]);

  useEffect(() => {
    void preloadConfettiSprites(confettiImages);
  }, [confettiImages, preloadConfettiSprites]);

  // Обновление картинок конфетти
  useEffect(() => {
    if (confettiRef.current) {
      void confettiRef.current.setImages(confettiImages);
    }
  }, [confettiImages]);

  // hitsToDestroy пересечён с текущими ударами
  useEffect(() => {
    if (!destroyedRef.current && hitsRef.current >= hitsToDestroy) {
      destroyTarget();
    }
  }, [hitsToDestroy, destroyTarget]);

  // Смена target/ destroyed спрайтов «на лету»
  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      const prevTarget = targetSpriteRef.current?.texture;
      const prevDestroyed = targetDestroyedSpriteRef.current?.texture;
      const prevHit = targetHitSpriteRef.current?.texture;

      const targetChanged = prevTarget !== targetImage;
      const destroyedChanged = prevDestroyed !== targetDestroyedImage;
      const hitChanged = prevHit !== targetImageHit;

      if (targetChanged || destroyedChanged || hitChanged) {
        await safeInvokeAsync('loadTargetSprites(dynamic)', () =>
          loadTargetSprites(targetImage, targetDestroyedImage, targetImageHit),
        );
        if (cancelled) return;

        if (destroyedRef.current) {
          if (targetManagerRef.current && renderRef.current && targetDestroyedSpriteRef.current) {
            safeInvoke('targetManager.setSprite (dynamic destroyed)', () => {
              targetManagerRef.current!.setSprite(renderRef.current!, targetDestroyedSpriteRef.current!, { keepScale: true });
            });
          }
        } else {
          restoreIdleSprite();
        }
      }
    };

    void run();

    return () => { cancelled = true; };
  }, [targetDestroyedImage, targetImage, targetImageHit, loadTargetSprites, restoreIdleSprite, safeInvoke, safeInvokeAsync]);

  // Смена bonus спрайта «на лету»
  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      await safeInvokeAsync('loadBonusSprite(dynamic)', () => loadBonusSprite(bonusImage));
      if (cancelled) return;
      safeInvoke('bonus.setSprite(dynamic)', () => {
        bonusRef.current?.setSprite(bonusSpriteRef.current ?? undefined);
      });
    };
    void run();
    return () => { cancelled = true; };
  }, [bonusImage, loadBonusSprite, safeInvoke, safeInvokeAsync]);

  // ---------- публичные методы ----------
  useImperativeHandle(ref, (): PinataClickerHandle => ({
    reset: (): void => {
      hitsRef.current = 0;
      destroyedRef.current = false;
      // мягкий teardown + пересборка
      teardownScene({ removeCanvas: false });
      setSceneToken((x) => x + 1);
    },
    pause: (): void => {
      if (pausedRef.current) return;
      pausedRef.current = true;
      const render = renderRef.current;
      const engine = engineRef.current;
      const runner = runnerRef.current;
      safeInvoke('handle.pause Render.stop', () => { if (render) Render.stop(render); });
      safeInvoke('handle.pause Runner.stop', () => { if (runner && engine) Runner.stop(runner); });
    },
    resume: (): void => {
      if (!pausedRef.current) return;
      pausedRef.current = false;
      const render = renderRef.current;
      const engine = engineRef.current;
      const runner = runnerRef.current;
      safeInvoke('handle.resume Render.run', () => { if (render) Render.run(render); });
      safeInvoke('handle.resume Runner.run', () => { if (runner && engine) Runner.run(runner, engine); });
    },
    hit: (): void => {
      if (pausedRef.current) return;
      const manager = targetManagerRef.current;
      if (manager) {
        safeInvoke('handle.hit press', () => { manager.press(targetScaleDownFactor); });
        setTimeout(() => {
          safeInvoke('handle.hit release (timeout)', () => {
            targetManagerRef.current?.release(targetScaleDownFactor);
          });
          restoreIdleSprite();
        }, 120);
      }
      safeInvoke('handle.hit strike', () => { strikeRef.current?.(); });
    },
  }), [restoreIdleSprite, safeInvoke, teardownScene, targetScaleDownFactor]);

  // ---------- разметка ----------
  return (
    <div ref={hostRef} className={className} style={style}>
      <canvas ref={canvasRef} className="scene"/>
      <style jsx>{`
          :global(.scene) {
              display: block;
              object-fit: contain;
              height: 100%;
              max-width: 100%;
              aspect-ratio: 1;
          }

          :global(div:where(.${className ?? 'pinata-host'})) {
              display: flex;
              justify-content: center;
              width: 100%;
              margin: 0 auto;
              aspect-ratio: 1;
          }
      `}</style>
    </div>
  );
});
