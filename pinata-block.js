(function () {
  const DEFAULTS = {
    hitsToDestroy: 30,
    burstEvery: 10,
    winLockSeconds: 33885,
    resultButtonImmunityMs: 2500,
    assets: {
      preview: './res/pinjata.png',
      target: './pinata-clicker-main/public/pinata/horse.png',
      targetHit: './pinata-clicker-main/public/pinata/horse_hit.png',
      targetDestroyed: './pinata-clicker-main/public/pinata/horse_destroyed.png',
      bonus: './pinata-clicker-main/public/pinata/bonus.png',
      buttonStart: './pinata-clicker-main/public/button-start.png',
      buttonTomorrow: './pinata-clicker-main/public/button-tomorrow.png',
      success: './pinata-clicker-main/public/success.png'
    },
    confettiImages: []
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomNumber(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomFrom(arr) {
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function mergeConfig(raw) {
    const cfg = { ...DEFAULTS, ...(raw || {}) };
    cfg.assets = { ...DEFAULTS.assets, ...((raw && raw.assets) || {}) };
    cfg.hitsToDestroy = Math.max(1, Number(cfg.hitsToDestroy) || DEFAULTS.hitsToDestroy);
    cfg.burstEvery = Math.max(0, Number(cfg.burstEvery) || 0);
    cfg.winLockSeconds = Math.max(0, Number(cfg.winLockSeconds) || DEFAULTS.winLockSeconds);
    cfg.resultButtonImmunityMs = Math.max(0, Number(cfg.resultButtonImmunityMs) || DEFAULTS.resultButtonImmunityMs);
    cfg.confettiImages = Array.isArray(raw && raw.confettiImages) ? raw.confettiImages.slice() : [];
    return cfg;
  }

  function formatTime(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function setupCanvas(canvas) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth));
      const h = Math.max(1, Math.floor(canvas.clientHeight));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    return { ctx, resize };
  }

  async function initBlock(host, cfgRaw) {
    const cfg = mergeConfig(cfgRaw);
    const [previewImg, targetImg, targetHitImg, targetDestroyedImg, bonusImg, ...confettiSpritesRaw] = await Promise.all([
      preloadImage(cfg.assets.preview || cfg.assets.target),
      preloadImage(cfg.assets.target),
      preloadImage(cfg.assets.targetHit),
      preloadImage(cfg.assets.targetDestroyed),
      preloadImage(cfg.assets.bonus),
      ...cfg.confettiImages.map((src) => preloadImage(src))
    ]);
    const confettiSprites = confettiSpritesRaw.filter(Boolean);
    const burstSprites = [bonusImg, ...confettiSprites].filter(Boolean);

    host.innerHTML = `
      <div class="pinata-block__inner">
        <div class="pinata-block__wrap">
          <div class="pinata-block__scene">
            <div class="pinata-block__rope" aria-hidden="true"></div>
            <canvas class="pinata-block__canvas" aria-hidden="true"></canvas>
            <img class="pinata-block__target" src="${cfg.assets.preview || cfg.assets.target}" alt="Пиньята">
            <div class="pinata-block__wave" aria-hidden="true"></div>
          </div>
        </div>
        <div class="pinata-block__controls">
          <div class="pinata-block__progress-wrap" hidden>
            <div class="pinata-block__progress-track" aria-hidden="true">
              <div class="pinata-block__progress-fill" aria-hidden="true"></div>
            </div>
            <progress class="pinata-block__progress" max="${cfg.hitsToDestroy}" value="0"></progress>
          </div>
          <button class="pinata-block__button m20" type="button">Разбить</button>
        </div>
        <div class="pinata-block__toast s10" role="status" aria-live="polite">
          Вы выбили 5 билетов. Приходите завтра ещё.
        </div>
      </div>
    `;

    const target = host.querySelector('.pinata-block__target');
    const rope = host.querySelector('.pinata-block__rope');
    const canvas = host.querySelector('.pinata-block__canvas');
    const wave = host.querySelector('.pinata-block__wave');
    const startBtn = host.querySelector('.pinata-block__button');
    const progressWrap = host.querySelector('.pinata-block__progress-wrap');
    const progressFill = host.querySelector('.pinata-block__progress-fill');
    const progress = host.querySelector('.pinata-block__progress');
    const toast = host.querySelector('.pinata-block__toast');
    if (!target || !rope || !canvas || !wave || !startBtn || !progressWrap || !progressFill || !progress || !toast) return;

    const canvasApi = setupCanvas(canvas);
    if (!canvasApi) return;
    const { ctx, resize } = canvasApi;
    window.addEventListener('resize', resize);

    const state = {
      phase: 'idle',
      hits: 0,
      paused: true,
      lastDirection: 1,
      lockLeft: 0
    };

    const swing = {
      angle: 0,
      velocity: 0,
      bobY: 0,
      bobVelocity: 0
    };

    const particles = [];
    let raf = 0;
    let lastFrame = performance.now();
    let hitTimer = 0;
    let lockTimer = 0;
    let toastHideTimer = 0;
    let toastShowRaf = 0;

    function setToastVisible(visible) {
      toast.classList.toggle('is-visible', visible);
      document.body.classList.toggle('has-pinata-toast', visible);
    }

    function updateTargetTransform() {
      const deg = swing.angle * (180 / Math.PI);
      target.style.transform = `translate(-50%, ${swing.bobY.toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
      rope.style.transform = `translateX(-50%) rotate(${(deg * 0.38).toFixed(2)}deg)`;
      rope.style.transformOrigin = '50% 0%';
    }

    function getParentKinematicsUnit() {
      const width = canvas.clientWidth || 800;
      const swingRadius = width * 0.19;
      const linearX = swing.velocity * swingRadius;
      const linearY = swing.bobVelocity;
      return {
        x: clamp(linearX / 24, -8, 8),
        y: clamp(linearY / 30, -8, 8)
      };
    }

    function spawnConfettiAt(x, y, parentImpulseUnit) {
      const sceneRect = canvas.getBoundingClientRect();
      const w = sceneRect.width || 1;
      const h = sceneRect.height || 1;
      const sizeScale = h / 720;
      const velScale = Math.max(0.25, w / 800);
      const count = Math.max(3, Math.round(randomNumber(3, 7)));
      for (let i = 0; i < count; i += 1) {
        const size = randomNumber(115 * sizeScale, 185 * sizeScale);
        const unitVx = randomNumber(-14, 14) * velScale + (parentImpulseUnit?.x || 0);
        const unitVy = (-12 - randomNumber(0, 7)) * velScale + (parentImpulseUnit?.y || 0);
        particles.push({
          kind: 'confetti',
          x: x + randomNumber(-25, 25) * sizeScale,
          y: y + randomNumber(-18, 18) * sizeScale,
          vx: unitVx * 16,
          vy: unitVy * 16,
          g: 330,
          r: Math.random() * Math.PI * 2,
          vr: randomNumber(-0.15, 0.15) * Math.PI * 5,
          s: clamp(size / 90, 1.05, 1.95),
          a: 0.62 + Math.random() * 0.35,
          sprite: randomFrom(confettiSprites),
          color: randomFrom(['#ff3b3b', '#ffb800', '#00c853', '#2979ff', '#7c4dff', '#ff6d00', '#00bfa5']),
          frictionAir: randomNumber(0.008, 0.016)
        });
      }
    }

    function spawnBonusAt(x, y, parentVelocityUnit) {
      const spread = 54;
      const bonusSprite = randomFrom(burstSprites) || bonusImg || targetImg;
      const vxUnit = (parentVelocityUnit?.x || 0) * 0.22 + randomNumber(-0.7, 0.7);
      const vyUnit = Math.min(parentVelocityUnit?.y || 0, 0) / 10 - 5 + randomNumber(-1.5, 0.4);
      particles.push({
        kind: 'bonus',
        x: x + randomNumber(-spread * 0.5, spread * 0.5),
        y: y + randomNumber(-spread * 0.25, spread * 0.25),
        vx: vxUnit * 48,
        vy: vyUnit * 48,
        g: 280,
        r: Math.random() * Math.PI * 2,
        vr: randomNumber(-0.2, 0.2) * Math.PI * 4,
        s: 0.62 + Math.random() * 0.62,
        a: 0.88 + Math.random() * 0.12,
        sprite: bonusSprite,
        color: null,
        frictionAir: randomNumber(0.004, 0.01)
      });
    }

    function applyKickAndEffects() {
      const rect = canvas.getBoundingClientRect();
      const widthScale = Math.max(0.5, Math.min(1, rect.width / 800));
      const kX = 80 * widthScale;
      const kY = 4 * widthScale;
      state.lastDirection = state.lastDirection * -1;
      const dir = state.lastDirection;

      swing.velocity += dir * kX * 0.038;
      swing.bobVelocity -= kY * 0.6;

      const x = rect.width * 0.5;
      const y = rect.height * 0.44;
      const parent = getParentKinematicsUnit();
      const jitterMul = randomNumber(0.875, 1.125);
      spawnConfettiAt(x, y, {
        x: parent.x * 0.35 * jitterMul,
        y: parent.y * 0.35 * jitterMul
      });
      spawnBonusAt(x, y, parent);

      if (cfg.burstEvery > 0 && state.hits % cfg.burstEvery === 0 && state.hits !== cfg.hitsToDestroy) {
        spawnConfettiAt(rect.width * 0.5, rect.height * 0.5, { x: 0, y: 0 });
        spawnConfettiAt(rect.width * 0.5, rect.height * 0.5, { x: 0, y: 0 });
      }

      wave.classList.remove('play');
      void wave.offsetWidth;
      wave.classList.add('play');
      setTimeout(() => wave.classList.remove('play'), 240);
    }

    function setUi() {
      host.classList.toggle('is-preview', state.phase === 'idle');
      startBtn.hidden = state.phase !== 'idle';
      progressWrap.hidden = state.phase !== 'running';
      progress.value = state.hits;
      const progressRatio = clamp(state.hits / cfg.hitsToDestroy, 0, 1);
      progressFill.style.width = `${((1 - progressRatio) * 100).toFixed(4)}%`;
      startBtn.disabled = state.lockLeft > 0;
      startBtn.textContent = state.lockLeft > 0 ? formatTime(state.lockLeft) : 'Разбить';
      target.classList.toggle('is-preview', state.phase === 'idle');
    }

    function startLockCountdown() {
      clearInterval(lockTimer);
      if (state.lockLeft <= 0) {
        setUi();
        return;
      }
      setUi();
      lockTimer = window.setInterval(() => {
        state.lockLeft = Math.max(0, state.lockLeft - 1);
        setUi();
        if (state.lockLeft <= 0) {
          clearInterval(lockTimer);
        }
      }, 1000);
    }

    function resetRound() {
      state.phase = 'idle';
      state.paused = true;
      state.hits = 0;
      state.lockLeft = 0;
      target.src = (previewImg && previewImg.src) || cfg.assets.preview || cfg.assets.target;
      target.classList.remove('is-hit', 'is-destroyed');
      swing.angle = 0;
      swing.velocity = 0;
      swing.bobY = 0;
      swing.bobVelocity = 0;
      updateTargetTransform();
      particles.length = 0;
      clearTimeout(hitTimer);
      clearInterval(lockTimer);
      clearTimeout(toastHideTimer);
      cancelAnimationFrame(toastShowRaf);
      setToastVisible(false);
      setUi();
    }

    function completeRound() {
      state.phase = 'completed';
      state.paused = true;
      target.classList.add('is-destroyed');
      target.src = (targetDestroyedImg && targetDestroyedImg.src) || cfg.assets.targetDestroyed;
      spawnConfettiAt(canvas.clientWidth * 0.5, canvas.clientHeight * 0.46, { x: 0, y: -2.5 });
      spawnConfettiAt(canvas.clientWidth * 0.5, canvas.clientHeight * 0.46, { x: 0, y: -2.5 });
      for (let i = 0; i < 7; i += 1) {
        spawnBonusAt(canvas.clientWidth * 0.5, canvas.clientHeight * 0.46, { x: 0, y: -2.8 });
      }
      clearTimeout(toastHideTimer);
      cancelAnimationFrame(toastShowRaf);
      setToastVisible(false);
      toastShowRaf = requestAnimationFrame(() => {
        setToastVisible(true);
      });
      toastHideTimer = window.setTimeout(() => {
        setToastVisible(false);
      }, 5000);

      // Как в спин-карточке: сразу возвращаем стартовый вид и включаем блокировку по таймеру.
      state.phase = 'idle';
      state.paused = true;
      state.hits = 0;
      state.lockLeft = cfg.winLockSeconds;
      target.classList.remove('is-hit', 'is-destroyed');
      target.src = (previewImg && previewImg.src) || cfg.assets.preview || cfg.assets.target;
      swing.angle = 0;
      swing.velocity = 0;
      swing.bobY = 0;
      swing.bobVelocity = 0;
      updateTargetTransform();
      progress.value = 0;
      startLockCountdown();
    }

    function strike() {
      if (state.paused || state.phase === 'completed') return;
      state.hits += 1;
      target.classList.add('is-hit');
      target.src = (targetHitImg && targetHitImg.src) || cfg.assets.targetHit;
      clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => {
        target.classList.remove('is-hit');
        if (state.phase === 'completed') return;
        target.src = state.phase === 'idle'
          ? ((previewImg && previewImg.src) || cfg.assets.preview || cfg.assets.target)
          : ((targetImg && targetImg.src) || cfg.assets.target);
      }, 90);
      applyKickAndEffects();
      progress.value = state.hits;
      progressFill.style.width = `${((1 - clamp(state.hits / cfg.hitsToDestroy, 0, 1)) * 100).toFixed(4)}%`;
      if (state.hits >= cfg.hitsToDestroy) {
        completeRound();
      }
    }

    function frame() {
      const now = performance.now();
      const dt = clamp((now - lastFrame) / 1000, 0.001, 0.05);
      lastFrame = now;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const margin = 40;

      const pendulumOmega2 = 9.2;
      const swingDamping = 1.5;
      const bobStiffness = 38;
      const bobDamping = 7.4;
      swing.velocity += (-pendulumOmega2 * Math.sin(swing.angle) - swingDamping * swing.velocity) * dt;
      swing.angle += swing.velocity * dt;
      swing.angle = clamp(swing.angle, -1.05, 1.05);
      swing.bobVelocity += (-bobStiffness * swing.bobY - bobDamping * swing.bobVelocity) * dt;
      swing.bobY += swing.bobVelocity * dt;
      swing.bobY = clamp(swing.bobY, -24, 24);
      updateTargetTransform();

      ctx.clearRect(0, 0, w, h);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        const drag = Math.max(0, 1 - (p.frictionAir || 0) * 60 * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        if (p.x < -margin || p.x > w + margin || p.y < -margin || p.y > h + margin) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.globalAlpha = p.a;
        const pw = (p.kind === 'bonus' ? 44 : 24) * p.s;
        const ph = (p.kind === 'bonus' ? 44 : 24) * p.s;
        if (p.sprite) {
          ctx.drawImage(p.sprite, -pw * 0.5, -ph * 0.5, pw, ph);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-pw * 0.5, -ph * 0.5, pw, ph);
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    }

    startBtn.addEventListener('click', () => {
      if (state.phase === 'completed') return;
      if (state.lockLeft > 0) return;
      if (state.paused) {
        state.paused = false;
        state.phase = 'running';
      }
      setUi();
      strike();
    });

    target.addEventListener('click', strike);

    resetRound();
    raf = requestAnimationFrame(frame);

    host.__pinataCleanup = () => {
      cancelAnimationFrame(raf);
      clearTimeout(hitTimer);
      clearInterval(lockTimer);
      clearTimeout(toastHideTimer);
      cancelAnimationFrame(toastShowRaf);
      setToastVisible(false);
      window.removeEventListener('resize', resize);
    };
  }

  async function bootstrap() {
    const nodes = Array.from(document.querySelectorAll('.pinata-block[data-pinata-config]'));
    for (const host of nodes) {
      if (host.__pinataCleanup) host.__pinataCleanup();
      const src = host.getAttribute('data-pinata-config');
      if (!src) continue;
      try {
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Pinata config request failed: ${res.status}`);
        const cfg = await res.json();
        await initBlock(host, cfg);
      } catch (err) {
        console.debug('Pinata init error:', err);
        host.innerHTML = '<div class="pinata-block__error s10">Не удалось загрузить блок пиньяты.</div>';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
