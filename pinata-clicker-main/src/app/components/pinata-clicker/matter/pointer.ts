import type { Body } from 'matter-js';
import { Query } from 'matter-js';


export function clientToScene(
  ev: PointerEvent | MouseEvent,
  canvas: HTMLCanvasElement,
  size: { W: number; H: number },
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();

  const nx = (ev.clientX - rect.left) / Math.max(1, rect.width);
  const ny = (ev.clientY - rect.top) / Math.max(1, rect.height);

  const x = nx * size.W;
  const y = ny * size.H;

  return { x, y };
}


export function hitTestBodyAtClient(
  body: Body,
  ev: PointerEvent | MouseEvent,
  canvas: HTMLCanvasElement,
  size: { W: number; H: number },
): boolean {
  const p = clientToScene(ev, canvas, size);

  const hits = Query.point([body], p);

  return hits.length > 0;
}
