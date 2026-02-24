(function () {
  function formatHms(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function initTimer(root) {
    const nodes = Array.from(root.querySelectorAll('[data-promo-mini-timer]'));
    if (!nodes.length) return;
    const start = Number(nodes[0].getAttribute('data-start-seconds')) || ((14 * 3600) + (21 * 60) + 58);
    let left = start;
    const render = () => {
      const text = formatHms(left);
      nodes.forEach((node) => {
        node.textContent = text;
      });
    };
    render();
    window.setInterval(() => {
      left = left > 0 ? left - 1 : start;
      render();
    }, 1000);
  }

  function initMarquee(section) {
    const viewport = section.querySelector('[data-promo-mini-viewport]');
    const track = section.querySelector('[data-promo-mini-track]');
    const group = section.querySelector('[data-promo-mini-group]');
    if (!viewport || !track || !group) return;

    const cloneA = group.cloneNode(true);
    cloneA.setAttribute('aria-hidden', 'true');
    const cloneB = group.cloneNode(true);
    cloneB.setAttribute('aria-hidden', 'true');
    track.appendChild(cloneA);
    track.appendChild(cloneB);

    const state = {
      offset: 0,
      speed: 90,
      dragging: false,
      dragStartX: 0,
      dragStartOffset: 0
    };

    function getChildWidth(node) {
      if (!node) return 0;
      return Math.max(0, node.getBoundingClientRect().width);
    }

    function rebalanceTrack() {
      let guard = 0;
      while (guard < 8) {
        guard += 1;
        const first = track.firstElementChild;
        const firstW = getChildWidth(first);
        if (first && firstW > 0 && state.offset <= -firstW) {
          state.offset += firstW;
          track.appendChild(first);
          continue;
        }

        if (state.offset > 0) {
          const last = track.lastElementChild;
          const lastW = getChildWidth(last);
          if (last && lastW > 0) {
            state.offset -= lastW;
            track.insertBefore(last, track.firstElementChild);
            continue;
          }
        }
        break;
      }
    }

    function recalcWidth() {
      rebalanceTrack();
    }

    function applyOffset() {
      track.style.transform = `translate3d(${state.offset}px,0,0)`;
    }

    recalcWidth();
    applyOffset();

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!state.dragging) {
        state.offset -= state.speed * dt;
        rebalanceTrack();
        applyOffset();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    viewport.addEventListener('pointerdown', (e) => {
      state.dragging = true;
      state.dragStartX = e.clientX;
      state.dragStartOffset = state.offset;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      const delta = e.clientX - state.dragStartX;
      state.offset = state.dragStartOffset + delta;
      rebalanceTrack();
      applyOffset();
    });

    function finishDrag() {
      if (!state.dragging) return;
      state.dragging = false;
      viewport.classList.remove('is-dragging');
    }

    viewport.addEventListener('pointerup', finishDrag);
    viewport.addEventListener('pointercancel', finishDrag);
    viewport.addEventListener('lostpointercapture', finishDrag);

    window.addEventListener('resize', recalcWidth, { passive: true });
  }

  function bootstrap() {
    const section = document.querySelector('.promo-mini');
    if (!section) return;
    initMarquee(section);
    initTimer(section);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
