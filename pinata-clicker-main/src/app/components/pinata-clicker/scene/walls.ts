import { Bodies, type Body } from 'matter-js';


export function getWalls(W: number, H: number, thickness: number = 0.1): Body[] {
  const ground = Bodies.rectangle(W / 2, H * 2 + thickness / 2, W, thickness, {
    isStatic: true,
    render: { fillStyle: '#e2e2e2' },
  });

  const leftWall = Bodies.rectangle(-thickness / 2 - W, H / 2, thickness, H * 2, {
    isStatic: true,
    render: { fillStyle: '#e2e2e2', strokeStyle: '#ccc', lineWidth: 1 },
  });

  const rightWall = Bodies.rectangle(W + thickness / 2 + W, H / 2, thickness, H * 2, {
    isStatic: true,
    render: { fillStyle: '#e2e2e2' },
  });

  return [ground, leftWall, rightWall];
}
