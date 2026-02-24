import type { Composite, IEvent, Render } from 'matter-js';
import { Events } from 'matter-js';


export function registerRopePainter(
  render: Render,
  params: { anchorX: number; anchorY: number; rope: Composite; thickness: number },
): () => void {
  const { anchorX, anchorY, rope, thickness } = params;

  const handler = (_event: IEvent<Render>) => {
    void _event;
    const ctx = render.context;
    const bodies = rope.bodies;
    if (!bodies || bodies.length === 0) return;

    const pts = [{ x: anchorX, y: anchorY }, ...bodies.map((b) => b.position)];

    ctx.save();

    ctx.globalCompositeOperation = 'destination-over';
    ctx.lineWidth = thickness;
    ctx.strokeStyle = '#eddeff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const n = pts[i + 1];
      const mx = (p.x + n.x) * 0.5;
      const my = (p.y + n.y) * 0.5;
      ctx.quadraticCurveTo(p.x, p.y, mx, my);
    }

    const last = pts[pts.length - 1];

    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
  };

  Events.on(render, 'afterRender', handler);

  let offCalled = false;
  return () => {
    if (offCalled) return;
    offCalled = true;

    try {
      Events.off(render, 'afterRender', handler);
    } catch {}
  };
}
