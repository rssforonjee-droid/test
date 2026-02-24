(function (global) {
  let splitCardRenderCount = 0;
  const promoImageCache = new Map();

  function preloadPromoImage(src) {
    if (!src) return Promise.resolve();
    if (promoImageCache.has(src)) return promoImageCache.get(src);

    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
      if (img.decode) {
        img.decode().then(resolve).catch(() => {});
      }
    });

    promoImageCache.set(src, p);
    return p;
  }

  const defaultSpinPrizes = [
    {
      label: '1 000 бонусов',
      title: 'Ура! Вы выиграли',
      body: '1 000 бонусов на\u00A0посуточную арендую',
      promoImage: './res_promo_card/img_card_bonuses.png',
      color: '#34d399',
      weight: 20,
      win: true
    },
    {
      label: 'iPhone 17 Pro Max или 100 000 ₽',
      title: 'Ура! Вы выиграли',
      body: 'iPhone 17 Pro\u00A0Max или\u00A0100 000\u00A0₽',
      promoImage: './res_promo_card/img_card_iphone.png',
      color: '#fbbf24',
      weight: 20,
      win: true
    },
    {
      label: 'Пусто :(',
      title: 'Пусто :(',
      body: 'Попробуйте ещё раз, у\u00A0вас всё получится!',
      promoImage: './res_promo_card/img_card_empty.png',
      color: '#94a3b8',
      weight: 60,
      win: false
    }
  ];

  function pickWeighted(items) {
    const sum = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
    let r = Math.random() * Math.max(sum, 1);
    for (const it of items) {
      r -= (Number(it.weight) || 0);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function resolvePromoImage(prize) {
    if (prize?.promoImage) return prize.promoImage;

    const key = String(prize?.promoKey || '').toLowerCase();
    const label = String(prize?.label || '').toLowerCase();

    if (key === 'bonuses' || label.includes('бонус')) return './res_promo_card/img_card_bonuses.png';
    if (key === 'iphone' || label.includes('iphone') || label.includes('айфон')) return './res_promo_card/img_card_iphone.png';
    if (key === 'empty' || label.includes('пусто') || prize?.win === false) return './res_promo_card/img_card_empty.png';

    return './res_promo_card/img_card_empty.png';
  }

  function resolvePrizeCopy(prize) {
    if (prize?.title || prize?.body) {
      return {
        title: String(prize.title || ''),
        body: String(prize.body || '')
      };
    }

    const raw = String(prize?.message || prize?.label || '').trim();
    if (!raw) return { title: '', body: '' };

    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    const firstLine = String(lines[0] || '');
    const isLoseCopy = prize?.win === false || /пусто/i.test(firstLine);
    const titleLineCount = !isLoseCopy && lines.length >= 3 ? 2 : 1;
    return {
      title: lines.slice(0, titleLineCount).join('\n') || '',
      body: lines.slice(titleLineCount).join('\n') || ''
    };
  }

  function initSpinCard(card, item, deps, options = {}) {
    const btn = card.querySelector('[data-sc="button"]');
    const front = card.querySelector('[data-sc="front-card"]');
    const defaultFace = card.querySelector('[data-sc="default-face"]');
    const prizeFace = card.querySelector('[data-sc="prize-face"]');
    const message = card.querySelector('[data-sc="message"]');
    const backTimer = card.querySelector('[data-sc="back-timer"]');

    if (!btn || !front || !defaultFace || !prizeFace) return;

    function setFrontDecorVisible(visible) {
      defaultFace.querySelectorAll('.spin-default-cover, .spin-default-cover-text').forEach((node) => {
        node.style.opacity = visible ? '1' : '0';
      });
    }

    const prizes = Array.isArray(item.prizes) && item.prizes.length ? item.prizes : defaultSpinPrizes;
    const lockSeconds = Number(item.winLockSeconds) > 0 ? Number(item.winLockSeconds) : ((9 * 3600) + (24 * 60) + 45);
    const idleText = item.initialText || 'Испытай удачу, крути и получай призы.';
    const spinText = item.spinningText || 'Крутить';
    const idleButtonLabel = item.buttonLabel || 'Крутить';
    const baseTransform = 'translate(-50%,-50%)';
    const mixTurns = Number(item.mixTurns) > 0 ? Number(item.mixTurns) : 1;
    const mixLastTurnPortion = Number(item.mixLastTurnPortion) > 0
      ? Math.min(1, Number(item.mixLastTurnPortion))
      : 0.35;

    if (backTimer) backTimer.textContent = item.backLabel || '00:30';

    const isFirstSplitCard = Boolean(options.isFirstSplitCard);
    const explicitCover = String(item.frontCoverImage || '').trim();
    const coverSrc = explicitCover || (isFirstSplitCard ? './res/flip_cards_cover.png' : '');
    const explicitCoverText = String(item.frontCoverTextImage || '').trim();
    const coverTextSrc = explicitCoverText || (isFirstSplitCard ? './res/flip_cards_cover_text.svg' : '');
    if (coverTextSrc) {
      const coverText = document.createElement('img');
      coverText.className = 'spin-default-cover-text';
      coverText.src = coverTextSrc;
      coverText.alt = '';
      coverText.setAttribute('aria-hidden', 'true');
      defaultFace.appendChild(coverText);
    }
    if (coverSrc) {
      const cover = document.createElement('img');
      cover.className = 'spin-default-cover';
      cover.src = coverSrc;
      cover.alt = '';
      cover.setAttribute('aria-hidden', 'true');
      defaultFace.appendChild(cover);
    }

    function setAngle(deg) {
      front.style.transform = `${baseTransform} rotateY(${deg}deg)`;
    }

    function easeOutCubic(x) {
      return 1 - Math.pow(1 - x, 3);
    }

    function formatTime(total) {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    let currentAngle = 0;
    let isSpinning = false;
    let raf = 0;
    let lockTimer = 0;
    let confettiRaf = 0;
    let confettiRunning = false;

    const confettiCanvas = document.createElement('canvas');
    confettiCanvas.className = 'spin-confetti-canvas';
    confettiCanvas.setAttribute('aria-hidden', 'true');
    front.appendChild(confettiCanvas);
    const confettiCtx = confettiCanvas.getContext('2d', { alpha: true });
    const defaultConfettiColors = ['#F97C97', '#FDBFA9', '#37E3C6', '#2B9DFF', '#E1A1FF'];
    const confettiColors = Array.isArray(item.confettiColors) && item.confettiColors.length
      ? item.confettiColors.map((c) => String(c).trim()).filter(Boolean)
      : defaultConfettiColors;

    const confettiParticles = Array.from({ length: 17 }, () => ({
      x: Math.random(),
      y: -0.1 - Math.random(),
      vx: (Math.random() - 0.5) * 0.03,
      vy: 0.16 + Math.random() * 0.22,
      s: 0.7 + Math.random() * 0.6,
      r: Math.random() * Math.PI * 2,
      vr: (-2.5 + Math.random() * 5) * Math.PI,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      a: 0.2 + Math.random() * 0.8
    }));

    function resetConfettiFromTop() {
      confettiParticles.forEach((p) => {
        p.x = Math.random();
        p.y = -0.1 - Math.random();
      });
    }

    function resizeConfettiCanvas() {
      const rect = front.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      confettiCanvas.width = Math.floor(w * dpr);
      confettiCanvas.height = Math.floor(h * dpr);
      confettiCanvas.style.width = `${w}px`;
      confettiCanvas.style.height = `${h}px`;
      if (confettiCtx) confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawConfetti(width, height, deltaSec) {
      if (!confettiCtx) return;
      confettiCtx.clearRect(0, 0, width, height);
      confettiParticles.forEach((p) => {
        p.x += p.vx * deltaSec;
        p.y += p.vy * deltaSec;
        p.r += p.vr * deltaSec;

        if (p.x > 1.1) p.x = -0.1;
        if (p.x < -0.1) p.x = 1.1;
        if (p.y > 1.1) p.y = -0.1;

        const x = p.x * width;
        const y = p.y * height;

        confettiCtx.save();
        confettiCtx.translate(x, y);
        confettiCtx.rotate(p.r);
        confettiCtx.globalAlpha = p.a;
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-4 * p.s, -6 * p.s, 8 * p.s, 12 * p.s);
        confettiCtx.restore();
      });
    }

    function stopConfetti() {
      confettiRunning = false;
      cancelAnimationFrame(confettiRaf);
      confettiRaf = 0;
      if (!confettiCtx) return;
      const rect = front.getBoundingClientRect();
      confettiCtx.clearRect(0, 0, rect.width, rect.height);
    }

    function startConfetti() {
      if (!confettiCtx || confettiRunning) return;
      confettiRunning = true;
      resetConfettiFromTop();
      resizeConfettiCanvas();
      let lastNow = performance.now();

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const runFrame = () => {
        if (!confettiRunning) return;
        const now = performance.now();
        const deltaSec = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
        lastNow = now;
        const rect = front.getBoundingClientRect();
        if (Math.floor(confettiCanvas.clientWidth) !== Math.floor(rect.width)
          || Math.floor(confettiCanvas.clientHeight) !== Math.floor(rect.height)) {
          resizeConfettiCanvas();
        }
        drawConfetti(rect.width, rect.height, deltaSec);
        if (!reduced) confettiRaf = requestAnimationFrame(runFrame);
      };

      runFrame();
    }

    window.addEventListener('resize', resizeConfettiCanvas);

    setAngle(currentAngle);
    btn.textContent = idleButtonLabel;
    if (message) message.style.display = 'none';

    // Предзагрузка всех изображений результата, чтобы исключить визуальный скачок.
    prizes.forEach((prize) => preloadPromoImage(resolvePromoImage(prize)));

    function finishWinState() {
      let left = lockSeconds;
      card.classList.add('spin-card--locked');
      btn.disabled = true;
      btn.textContent = formatTime(left);
      startConfetti();

      clearInterval(lockTimer);
      lockTimer = window.setInterval(() => {
        left = Math.max(0, left - 1);
        btn.textContent = formatTime(left);
        if (left <= 0) {
          clearInterval(lockTimer);
          card.classList.remove('spin-card--locked');
          btn.disabled = false;
          btn.textContent = idleButtonLabel;
          defaultFace.style.opacity = '1';
          prizeFace.style.opacity = '0';
          prizeFace.style.transform = 'scale(.96)';
          setFrontDecorVisible(true);
          stopConfetti();
        }
      }, 1000);
    }

    function spinOnce() {
      if (isSpinning || btn.disabled) return;

      isSpinning = true;
      btn.disabled = true;
      btn.textContent = spinText;
      setFrontDecorVisible(false);

      const prize = pickWeighted(prizes);
      const nextPromoSrc = resolvePromoImage(prize);
      const prizeCopy = resolvePrizeCopy(prize);
      const prizeHTML = `
        <div class="spin-prize-content">
          <img class="spin-prize-image" src="${nextPromoSrc}" alt="">
          <div class="spin-prize-title h3">${prizeCopy.title}</div>
          <div class="spin-prize-body m20">${prizeCopy.body}</div>
        </div>
      `;

      // 1:1 из test.html
      const spins = 3 + Math.floor(Math.random() * 3); // 3..5
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reduced ? 0 : 2200 + (spins - 3) * 400;
      const startTime = performance.now();
      const startAngle = currentAngle;
      const endAngle = startAngle + spins * 360;
      const startMixAngle = Math.max(
        startAngle + (0.75 * 360),
        endAngle - (mixTurns * 360 * mixLastTurnPortion)
      );
      const mixRange = Math.max(1, endAngle - startMixAngle);

      // Полный сброс перед новым спином: без плавного fade от предыдущего результата.
      defaultFace.style.transition = 'none';
      prizeFace.style.transition = 'none';
      defaultFace.style.opacity = '1';
      prizeFace.style.opacity = '0';
      prizeFace.style.transform = 'scale(.96)';
      prizeFace.innerHTML = '';
      stopConfetti();
      void prizeFace.offsetHeight;
      defaultFace.style.transition = '';
      prizeFace.style.transition = '';

      let prizeMounted = false;
      const prizeIsWin = typeof prize.win === 'boolean'
        ? prize.win
        : !/пусто/i.test(String(prize.label || ''));
      let buttonFinalStatePrimed = false;
      let buttonUnlockedEarly = false;

      function complete() {
        currentAngle = endAngle % 360;
        setAngle(currentAngle);
        // Сразу фиксируем финальное состояние лицевой стороны результата без остаточного fade.
        defaultFace.style.opacity = '0';
        prizeFace.style.opacity = '1';
        prizeFace.style.transform = 'scale(1)';

        if (prizeIsWin) {
          finishWinState();
        } else {
          btn.disabled = false;
          btn.textContent = idleButtonLabel;
        }

        isSpinning = false;
      }

      function step(now) {
        const t = Math.min(1, (now - startTime) / Math.max(1, duration));
        const p = easeOutCubic(t);
        const ang = startAngle + (endAngle - startAngle) * p;
        setAngle(ang);

        if (ang >= startMixAngle) {
          if (!prizeMounted) {
            prizeFace.innerHTML = prizeHTML;
            prizeMounted = true;
          }
          const rawK = Math.min(1, Math.max(0, (ang - startMixAngle) / mixRange));
          const k = Math.pow(rawK, 0.55);
          const visibleK = rawK >= 0.82 ? 1 : k;
          // Шаг 2: в момент начала финального переворота X2 исчезает сразу.
          defaultFace.style.opacity = '0';
          prizeFace.style.opacity = String(visibleK);
          prizeFace.style.transform = `scale(${0.96 + 0.04 * visibleK})`;

          if (!buttonFinalStatePrimed && rawK >= 0.82) {
            buttonFinalStatePrimed = true;
            btn.textContent = prizeIsWin ? formatTime(lockSeconds) : idleButtonLabel;
          }
        }

        // Разлочиваем кнопку чуть до полной остановки (только для проигрыша),
        // чтобы визуально это происходило параллельно с финальным докручиванием.
        if (!prizeIsWin && !buttonUnlockedEarly && t >= 0.94) {
          buttonUnlockedEarly = true;
          btn.disabled = false;
          btn.textContent = idleButtonLabel;
        }

        if (t < 1) {
          raf = requestAnimationFrame(step);
        } else {
          complete();
        }
      }

      if (duration === 0) {
        if (!prizeMounted) {
          prizeFace.innerHTML = prizeHTML;
          prizeMounted = true;
        }
        currentAngle = endAngle % 360;
        setAngle(currentAngle);
        defaultFace.style.opacity = '0';
        prizeFace.style.opacity = '1';
        prizeFace.style.transform = 'scale(1)';
        complete();
      } else {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
      }
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      spinOnce();
    });

    btn.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        spinOnce();
      }
    });

    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(raf);
      clearInterval(lockTimer);
      stopConfetti();
    });
  }

  function renderSplitCard(item, deps) {
    const tpl = document.getElementById('split-card-template');
    if (!tpl || !(tpl instanceof HTMLTemplateElement)) return null;

    const isFirstSplitCard = splitCardRenderCount === 0;
    splitCardRenderCount += 1;
    const card = tpl.content.firstElementChild.cloneNode(true);
    initSpinCard(card, item, deps, { isFirstSplitCard });
    return card;
  }

  global.SplitCard = {
    isSplitCard(item) {
      return item && item.type === 'text-card';
    },
    render(item, deps) {
      return renderSplitCard(item, deps);
    }
  };
})(window);
