// particles-burst.js
(function (global) {
  const DEFAULTS = {
    count: 12,
    radius:36,
    size: 4,
    colors: ['#ff6b6b','#ffd93d','#4d96ff','#6bcb77'],
    // Единые классы (можно переопределить опциями, но лучше оставить общими)
    layerClass: 'pb-layer',
    particleClass: 'pb-particle'
  };

  const PRESETS = {
    heartOn:  { count: 12, radius: 36, size: 4,  colors: ['#ff6b6b','#ffd93d','#4d96ff','#6bcb77'] },
    heartOff: { count: 12, radius: 36, size: 4,  colors: ['#99a3ad','#b3c5ff','#cde3ff','#a8e6cf'] }
  };

  // Впрыскиваем базовый CSS один раз
  let cssInjected = false;
  function ensureCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const css = `
      .pb-layer{
        position: fixed; inset: 0; pointer-events: none; contain: layout style;
        z-index: 2147483647; /* поверх всего */
      }
      .pb-particle{
        position: absolute; width: 6px; height: 6px; border-radius: 1px;
        will-change: transform, opacity;
        animation: pb-fly var(--pb-dur,700ms) cubic-bezier(.2,.7,.3,1) forwards;
        opacity: 0;
      }
      @keyframes pb-fly{
        0%   { transform: translate(var(--pb-x0), var(--pb-y0)) rotate(0turn) scale(0.8); opacity: 0.0; }
        10%  { opacity: 1; }
        100% { transform: translate(calc(var(--pb-x0) + var(--pb-dx)), calc(var(--pb-y0) + var(--pb-dy))) rotate(var(--pb-rot)) scale(1); opacity: 0; }
      }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function burst(anchorEl, opts = {}) {
    if (!anchorEl || !anchorEl.ownerDocument) return;
    ensureCSS();

    const o = Object.assign({}, DEFAULTS, opts);
    const doc = anchorEl.ownerDocument;
    const win = doc.defaultView || window;

    // Координаты центра «якоря» (сердца)
    const r = anchorEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height/ 2;

    // Общий слой на весь вьюпорт (одноразовый per burst)
    const layer = doc.createElement('div');
    layer.className = o.layerClass;
    doc.body.appendChild(layer);

    const TWO_PI = Math.PI * 2;
    const count = o.count|0;

    for (let i = 0; i < count; i++) {
      const p = doc.createElement('span');
      p.className = o.particleClass;

      // Геометрия
      const angle = Math.random() * TWO_PI;
      const dist  = (o.radius * 0.5) + Math.random() * (o.radius * 0.5);
      const dx    = Math.cos(angle) * dist;
      const dy    = Math.sin(angle) * dist * 0.9; // чуть более «плоский» веер

      // Внешний вид
      const size  = Math.max(3, (o.size || 6) + Math.round((Math.random()-0.5) * 3));
      const rot   = (Math.random() * 1.5 + 0.5).toFixed(3) + 'turn';
      const dur   = (480 + Math.random()*520)|0; // 480–1000ms
      const color = o.colors[(Math.random() * o.colors.length)|0];

      p.style.background = color;
      p.style.width = p.style.height = size + 'px';

      // Стартовые/конечные смещения через CSS-переменные
      p.style.setProperty('--pb-x0', cx + 'px');
      p.style.setProperty('--pb-y0', cy + 'px');
      p.style.setProperty('--pb-dx', dx + 'px');
      p.style.setProperty('--pb-dy', dy + 'px');
      p.style.setProperty('--pb-rot', rot);
      p.style.setProperty('--pb-dur', dur + 'ms');

      layer.appendChild(p);

      // Случайная небольшая задержка старта, чтобы взрыв был «живым»
      const delay = (Math.random()*60)|0;
      p.style.animationDelay = delay + 'ms';
    }

    // Удаляем слой после анимации
    const ttl = 1200;
    win.setTimeout(() => {
      layer.remove();
    }, ttl);
  }

  global.ParticlesBurst = { burst, presets: PRESETS };
})(window);
