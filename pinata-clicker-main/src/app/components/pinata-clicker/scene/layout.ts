import type { ReactNode } from 'react';

export function getPaddingX(host: HTMLElement): number {
  const cs = getComputedStyle(host);

  const left = parseFloat(cs.paddingLeft || '0') || 0;
  const right = parseFloat(cs.paddingRight || '0') || 0;

  return left + right;
}


/**
 * Computes scene size maintaining 1:1 aspect inside the host content box.
 * Mirrors existing sizing logic used in the component.
 */
export function getSceneSize(host: HTMLElement): { W: number; H: number } {
  const rect = host.getBoundingClientRect();
  const padX = getPaddingX(host);
  const contentW = Math.max(0, rect.width - padX);

  const W = Math.max(20, Math.floor(contentW));
  const H = Math.max(20, Math.floor(W));

  return { W, H };
}

type SceneLayoutProps = {
  children: ReactNode;
};

export default function SceneLayout({ children }: SceneLayoutProps) {
  return children;
}
