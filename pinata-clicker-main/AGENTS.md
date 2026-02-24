# AGENTS

## Project Overview
- `src/app/page.tsx` hosts a single-page piñata clicker mini-game driven by the `PinataClicker` component.
- Built with Next.js 15 / React 19 and powered by `matter-js` physics; only one third-party dependency besides the framework stack.
- Visual assets (pinata, destroyed state, bonus, confetti) live under `public/pinata` and are mirrored into `out/pinata` for static export.

## Runtime Agents

### PinataClicker (`src/app/components/pinata-clicker/PinataClicker.tsx`)
- Central orchestrator that creates and tears down the Matter.js engine, runner, render loop, and scene composites.
- Props (defaults in parentheses): `confettiImages` ([]), `hitsToDestroy` (5), `burstEvery` (10), `targetImage`, `targetDestroyedImage`, `bonusImage`, `targetScaleDownFactor` (0.95), `paused` (true), `onTargetKicked`, `onTargetDestroyed`, `className`, `style`.
- Public handle exposed via `ref`: `reset()` rebuilds the scene and clears counters, `pause()` and `resume()` control the physics loop, `hit()` simulates a pointer strike (press/release animation + physics kick).
- Maintains internal refs for hits, pause state, target body, loaded sprites, and manager instances; `ResizeObserver` triggers soft rebuilds when the host element size changes.
- `setupScene()` loads sprites, computes a 1:1 canvas via `getSceneSize`, builds walls, rope, and target, registers the rope painter, attaches pointer listeners, and spins up the runner; `teardownScene()` removes listeners, managers, and Matter resources.
- `handleStrike()` increments hits, spawns confetti and bonus pieces, applies alternating directional force, emits `onTargetKicked`, and destroys the target (with sprite swap + burst effects) when the hit quota is reached.

### ConfettiManager (`src/app/components/pinata-clicker/confetti/manager.ts`)
- Manages a dedicated Matter composite for confetti particles created during strikes and destruction bursts.
- `init(engine)` registers an `afterUpdate` hook that culls bodies leaving the padded scene bounds.
- `setImages(urls)` preloads sprite textures (if provided) and falls back to colored circles when loading fails.
- `spawn(x, y, parentImpulse?)` emits 2–5 pieces with randomized angles, velocities, and optional textured sprites; `spawnAtBody(body, { jitter })` samples the body velocity to seed impulse.
- `burstFromCenter(forceScale)` pushes existing confetti radially outward, used during milestone bursts and final destruction.

### BonusManager (`src/app/components/pinata-clicker/bonus/manager.ts`)
- Handles collectible bonus sprites that spray out from the target, float upward, fade, and self-remove after ~6 seconds.
- `init(engine)` installs `beforeUpdate` (adds upward force proportional to gravity) and `afterUpdate` (opacity fade, lifetime and bounds culling) hooks.
- `setSprite(sprite)` swaps the visual used for future spawns; defaults to provided dimensions if loading fails.
- `spawn(x, y, parentVelocity?, { spread })` and `spawnAtBody(body, opts)` create rectangle bodies with upward bias; `accelerate(multiplier)` scales existing velocities for dramatic effects during destruction.

### TargetManager (`src/app/components/pinata-clicker/scene/target.ts`)
- Builds and owns the hanging piñata body plus its bottom constraint connection to the rope composite.
- Computes sprite scaling so the texture matches the physics body, sharing the rope's collision group to avoid self-collisions.
- `press(scale)` and `release(scale)` scale the body to create a squash-and-stretch reaction during clicks; `setSprite(render, sprite, { keepScale })` swaps textures at runtime while preserving proportions when requested.
- Exposes `create(rope, segmentHeight)` to attach the target to the rope; `destroy()` currently clears internal flags (kept for symmetry with other managers).

## Physics & Scene Infrastructure
- `createEngine` / `tuneEngineIterations` / `createRender` (`src/app/components/pinata-clicker/matter/bootstrap.ts`) wrap Matter defaults and increase iteration counts on narrow canvases for stability.
- `preloadImage` and `applySprite` (`matter/sprites.ts`) manage texture loading and Matter render cache updates; `hitTestBodyAtClient` (`matter/pointer.ts`) converts pointer coordinates into scene space for precise selection.
- `getSceneSize` (`scene/layout.ts`) enforces a square canvas inside the host padding; `getRope` and `registerRopePainter` (`scene/rope.ts`, `scene/rope-draw.ts`) build the rope composite and draw a smooth quadratic-curve line behind physics sprites.
- `getWalls` (`scene/walls.ts`) supplies static boundaries (ground + lateral guards) sized off the current scene to keep debris in frame.

## Event & UI Flow
1. `Home` (`src/app/page.tsx`) renders `PinataClicker` paused, a wave overlay, progress bar, and start/result buttons managed through local state.
2. Start button calls `resume()` and immediately `hit()` to deliver the opening strike; subsequent clicks on the piñata trigger `handleStrike()` via pointer listeners.
3. Each strike updates the hit counter in `Home` through `onTargetKicked`, animates the target, spawns confetti/bonus pieces, and optionally triggers a center burst every `burstEvery` hits.
4. When `hitsToDestroy` is met, `destroyTarget()` runs: pointer listeners are removed, sprites swap to the destroyed image, confetti bursts, bonuses accelerate, and `onTargetDestroyed` notifies the page to show the completion overlay.
5. The page delays the result button for 2.5 seconds (`RESULT_BUTTON_IMMUNITY_MS`) to prevent immediate dismissal, then lets the player hide the overlay; resetting or replay logic can be added by calling the exposed handle methods.

## Tuning Notes
- Update art by pointing `targetImage`, `targetDestroyedImage`, `bonusImage`, and `confettiImages` to new assets; `PinataClicker` hot-swaps sprites without tearing down the scene.
- Adjust difficulty via `hitsToDestroy` and celebration density via `burstEvery`; both props are reactive and will trigger destruction if the new thresholds are already met.
- External callers can script custom progress logic by capturing the `PinataClickerHandle` ref and invoking `hit()` or `reset()` in response to other UI events or timers.
