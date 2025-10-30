// assistant-cards.js
// МОДУЛЬ СНИППЕТОВ: без HTML/CSS в коде — только DOM, логика избранного,
// ленивое подключение конфетти и Shadow DOM с <link> на внешний CSS.

(function (global) {
  // ————— УТИЛИТЫ —————
  const isGradientOrColor = s => /^(?:linear|radial|conic)-gradient\(|^#|^rgb[a]?\(/i.test(s);
  const isVideo = s => /\.(mp4|webm|ogg)$/i.test(s);
  const resolveSrc = (src) => /^(https?:|data:|\/|\.\/|\.\.\/)/i.test(src) ? src : ('./' + src);

  function el(tag, cls, html){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  async function loadCardsData(url){
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
  }

  // === ЛЕНИВАЯ ПОДГРУЗКА ВНЕШНИХ СКРИПТОВ ===================================
  const _loadedScripts = new Map();
  function loadScriptOnce(url, doc){
    if (_loadedScripts.has(url)) return _loadedScripts.get(url);
    const p = new Promise((resolve, reject)=>{
      const s = doc.createElement('script');
      s.src = url; s.async = true; s.onload = ()=>resolve(); s.onerror = reject;
      doc.head.appendChild(s);
    });
    _loadedScripts.set(url, p);
    return p;
  }
  // ==========================================================================

  function setupHeart(btn, icons){
    const icon = new Image();
    icon.src = icons.off;
    icon.alt = '';
    icon.width = 18; icon.height = 18;
    btn.appendChild(icon);
    btn.type = 'button';
    btn.setAttribute('aria-pressed','false');

    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const saved = btn.classList.toggle('saved');
      btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      icon.src = saved ? icons.on : icons.off;
      btn.classList.add('animating');
      setTimeout(()=>btn.classList.remove('animating'), 320);

      // ——— КОНФЕТТИ (ленивая подгрузка общей библиотеки) ———
    try{
    const doc = btn.ownerDocument;
    await loadScriptOnce('./particles-burst.js', doc);
    if (global.ParticlesBurst && typeof global.ParticlesBurst.burst === 'function') {
        global.ParticlesBurst.burst(
        btn,
        saved ? global.ParticlesBurst.presets.heartOn
                : global.ParticlesBurst.presets.heartOff
        );
    }
    }catch(_){}

    });
  }

  // ——— БЕЙДЖ: можно задавать цвет и отдельные «хвостики» для каждого ———
  function makeRibbon(opts){
    const {
      text,
      color = '#30c977',
      capLeft = './res/left_bage_flag.svg',
      capRight = './res/right_bage_flag.svg',
    } = (typeof opts === 'string') ? { text: opts } : (opts || {});

    const wrap = el('span','ribbon-assist');
    wrap.style.setProperty('--ribbon', color);
    wrap.style.setProperty('--cap-left-url', `url("${capLeft}")`);
    wrap.style.setProperty('--cap-right-url', `url("${capRight}")`);

    wrap.append(
      el('span','ribbon-assist__cap ribbon-assist__cap--left',''),
      el('span','ribbon-assist__body s10', text || ''),
      el('span','ribbon-assist__cap ribbon-assist__cap--right',''),
    );
    return wrap;
  }

  // Заглушка (оставлена, чтобы не ломать внешние ожидания)
  function attachSwipe(){ /* no-op для скролл-галереи */ }

  // === СРЕДНИЙ ЦВЕТ (оптимизировано) =========================
  function avgColorFromImage(img, sample = 8){
    const c = document.createElement('canvas');
    c.width = sample; c.height = sample;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, sample, sample);

    const { data } = ctx.getImageData(0, 0, sample, sample);
    let r=0,g=0,b=0,cnt=0;
    for (let i=0; i<data.length; i+=4){
      const a = data[i+3]; // 0..255
      if (a === 0) continue;
      r += data[i]   * a;
      g += data[i+1] * a;
      b += data[i+2] * a;
      cnt += a;
    }
    if (!cnt) return null;
    r = Math.round(r/cnt); g = Math.round(g/cnt); b = Math.round(b/cnt);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // ==========================================================================

  function renderCards(root, items, icons){
    const hdr = el('div','assist-cards-hdr h3');
    hdr.textContent = '🔖 3 проверенных объявления';
    root.appendChild(hdr);

    const grid = el('div','assist-cards-grid');

    items.forEach(item=>{
      const card = el('article','assist-card');

      // ——— Галерея ———
      const pics = Array.isArray(item.images) && item.images.length ? item.images.slice() : (item.image?[item.image]:[]);
      const host = el('div','assist-image-host');

      const view = el('div','assist-image');        // фикс. высота 176px, ширина = 100%
      const rail = el('div','assist-image-rail');   // горизонтальная лента

      if (pics.length > 1) {
        view.classList.add('assist-image--scroll');
        view.setAttribute('tabindex','0');
        view.setAttribute('role','region');
        view.setAttribute('aria-label','Галерея изображений: горизонтальная прокрутка');
      } else {
        view.classList.add('assist-image--single');
      }

      pics.forEach(src=>{
        const slide = el('div','assist-image-slide');

        if (isGradientOrColor(src)) {
          slide.style.background = src;

        } else if (isVideo(src)) {
          const v = document.createElement('video');
          v.src = resolveSrc(src);
          v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
          slide.appendChild(v);

        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = resolveSrc(src);
          img.alt = item.title || '';
          img.loading = 'lazy';
          img.onerror = () => { slide.style.background = '#e8edf6'; };
          slide.appendChild(img);

          // ——— СРЕДНИЙ ЦВЕТ: только для одного фото и в idle ———
          img.addEventListener('load', () => {
            if (!view.classList.contains('assist-image--single')) return;
            const idle = global.requestIdleCallback || function(cb){ setTimeout(cb, 0); };
            idle(() => {
              try{
                const col = avgColorFromImage(img, 8);
                if (col) {
                  slide.style.backgroundColor = col;
                  view.style.backgroundColor  = col;
                }
              }catch(_e){}
            });
          });
        }

        rail.appendChild(slide);
      });

      view.appendChild(rail);
      host.appendChild(view);

      // ——— Бейджи ———
      const badges = [];
      if (Array.isArray(item.badges) && item.badges.length){
        for (const b of item.badges) {
          if (!b || (!b.text && !b.label)) continue;
          badges.push({
            text: b.text ?? b.label,
            color: b.color ?? b.colour ?? b.badgeColor,
            capLeft: b.capLeft ?? b.leftCap ?? b.cap_left,
            capRight: b.capRight ?? b.rightCap ?? b.cap_right,
          });
        }
      } else if (item.badge) {
        badges.push({
          text: item.badge,
          color: item.badgeColor,
          capLeft: item.badgeLeftCap,
          capRight: item.badgeRightCap,
        });
      }

      if (badges.length){
        const group = el('div','ribbon-assist-group');
        badges.forEach(b => group.appendChild(makeRibbon(b)));
        host.appendChild(group);
      }

      card.appendChild(host);

      // ——— Контент ———
      const content  = el('div','assist-card-content');

      // === ПОРЯДОК: СНАЧАЛА ЦЕНА, ПОТОМ ТАЙТЛ ===
      const priceRow = el('div','assist-price-row');
      priceRow.appendChild(el('div','assist-price h4', item.price || ''));

      const oldLine = el('div','assist-old-line');
      if (item.oldPrice) oldLine.appendChild(el('div','assist-price-old m20', item.oldPrice));
      if (item.discount) oldLine.appendChild(el('div','assist-discount m20', item.discount));
      if (oldLine.childNodes.length) priceRow.appendChild(oldLine);

      content.appendChild(priceRow);

      const titleRow = el('div','assist-title-row');
      titleRow.appendChild(el('div','assist-card-title m20', item.title || ''));

      const heart = el('button','assist-heart');
      setupHeart(heart, icons);
      titleRow.appendChild(heart);

      content.appendChild(titleRow);
      // === /ПОРЯДОК ===

      const subtitle = item.subtitle || item.description || '';
      if (subtitle) content.appendChild(el('div','s10 assist-card-subtitle', subtitle));

      if (item.rating) {
        const ratingRow = el('div', 's10 assist-card-rating');
        const icon = el('span', 'assist-rating-icon');
        ratingRow.appendChild(icon);
        ratingRow.append(' ', item.rating);
        content.appendChild(ratingRow);
        }

      // GEO отдельно
        if (item.geo) {
        const geoRow = el('div','s10 assist-card-geo');
        geoRow.appendChild(el('span','assist-geo-icon'));
        geoRow.append(' ', item.geo);
        content.appendChild(geoRow);
        }

        // META отдельно
        if (item.meta) {
        const metaRow = el('div','s10 assist-card-meta');
        metaRow.appendChild(el('span','assist-meta-icon'));
        metaRow.append(' ', item.meta);
        content.appendChild(metaRow);
        }

      card.appendChild(content);
      grid.appendChild(card);
    });

    root.appendChild(grid);

    // --- Блок после карточек: текст + ссылка ---
    const summary = el('div', 'assist-summary');

    const summaryText = el(
    'div',
    'assist-summary-text m20',
    'Нашёл 175 похожих айфонов. Можешь уточнить ваши пожелания, и я помогу подобрать точнее.'
    );
    summary.appendChild(summaryText);

    // ссылка с иконкой
    const link = el('a', 'assist-summary-link h4', 'Показать 175 предложений');
    link.href = '#'; // пока заглушка
    summary.appendChild(link);

    root.appendChild(summary);

  }

  // ————— ПУБЛИЧНЫЙ API —————
  // hooks: { setBusy, showThinking, scrollToNode, randDelay, addMessage, FALLBACK_TXT,
  //          CARDS_CSS_URL, ANSWER_DATA_URL, HEART_OFF, HEART_ON }
  async function aiCardsFromJSONWithThinking(hooks){
    const {
      setBusy, showThinking, scrollToNode, randDelay,
      addMessage, FALLBACK_TXT,
      CARDS_CSS_URL, ANSWER_DATA_URL,
      HEART_OFF, HEART_ON
    } = hooks;

    setBusy?.(true);
    const typing = showThinking();

    if (typeof randDelay === 'function') {
      await new Promise(r => setTimeout(r, randDelay()));
    } else {
      await new Promise(r => setTimeout(r, 4900));
    }

    try{
      const data = await loadCardsData(ANSWER_DATA_URL);

      const host = el('div','msg ai m20 rich');
      const shadow = host.attachShadow({mode:'open'});

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CARDS_CSS_URL;
      shadow.appendChild(link);

      const root = el('div');
      shadow.appendChild(root);
      renderCards(root, data, { off: HEART_OFF, on: HEART_ON });

      typing.replaceWith(host);
      scrollToNode?.(host);
    }catch(e){
      const fallback = addMessage?.('ai', FALLBACK_TXT, { replaceNode: typing });
      if (fallback) scrollToNode?.(fallback);
    }finally{
      setBusy?.(false);
    }
  }

  global.AssistCards = { aiCardsFromJSONWithThinking };
})(window);
