import { Bodies, Body, type Composite, Composites, Constraint } from 'matter-js';


export function getRope(params: {
  anchorX: number;
  anchorY: number;
  segmentCount: number;
  segmentWidth: number;
  segmentHeight: number;
}): {
  ropeGroup: number;
  rope: Composite;
  topConstraint: Constraint;
} {
  const ropeGroup = Body.nextGroup(true);

  const rope = Composites.stack(
    params.anchorX,
    params.anchorY,
    params.segmentCount,
    1,
    0,
    0,
    (_x: number, _y: number, i: number) => {
      return Bodies.rectangle(
        params.anchorX,
        params.anchorY + i * params.segmentHeight,
        params.segmentWidth,
        params.segmentHeight,
        {
          collisionFilter: { group: ropeGroup },
          friction: 0.6,
          restitution: 0.0,
          frictionAir: 0.02,
          density: 0.0075,
          render: { visible: false },
        }
      );
    }
  );

  Composites.chain(rope, 0, 0.5, 0, -0.5, {
    stiffness: 1,
    damping: 0,
    length: 0,
    render: { visible: false },
  });

  const topConstraint = Constraint.create({
    pointA: { x: params.anchorX, y: params.anchorY },
    bodyB: rope.bodies[0],
    pointB: { x: 0, y: -params.segmentHeight * 0.5 },
    stiffness: 1,
    render: { visible: false },
  });

  return { ropeGroup, rope, topConstraint };
}
