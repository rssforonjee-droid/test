import type { Body, Render } from 'matter-js';


export type LoadedSprite = {
  texture: string;
  width: number;
  height: number;
  image?: HTMLImageElement;
};


export async function preloadImage(src: string): Promise<LoadedSprite> {
  return new Promise<LoadedSprite>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({
      texture: src,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      image: img,
    });
    img.onerror = reject;
    img.src = src;
  });
}


const FALLBACK_PREVIEW_MAX_SIDE = 200;
const FALLBACK_PREVIEW_MIN_SIDE = 42;


export function createPlaceholderSprite(
  texture: string,
  opts: { width?: number; height?: number } = {},
): LoadedSprite {
  const width = Math.max(1, Math.round(opts.width ?? 256));
  const height = Math.max(1, Math.round(opts.height ?? width));
  const image = createPlaceholderImage(width, height);

  return { texture, width, height, image };
}


function createPlaceholderImage(width: number, height: number): HTMLImageElement | undefined {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof Image === 'undefined'
  ) {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  const aspect = width / height || 1;
  if (aspect >= 1) {
    canvas.width = FALLBACK_PREVIEW_MAX_SIDE;
    canvas.height = Math.max(
      FALLBACK_PREVIEW_MIN_SIDE,
      Math.round(FALLBACK_PREVIEW_MAX_SIDE / aspect),
    );
  } else {
    canvas.height = FALLBACK_PREVIEW_MAX_SIDE;
    canvas.width = Math.max(
      FALLBACK_PREVIEW_MIN_SIDE,
      Math.round(FALLBACK_PREVIEW_MAX_SIDE * aspect),
    );
  }

  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ff8a80');
    gradient.addColorStop(1, '#b388ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const stroke = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.08));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = stroke;
    ctx.strokeRect(stroke / 2, stroke / 2, canvas.width - stroke, canvas.height - stroke);

    ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.06));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.moveTo(canvas.width, 0);
    ctx.lineTo(0, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.stroke();
  }

  const img = new Image();
  img.src = canvas.toDataURL('image/png');
  return img;
}


/**
 * Apply sprite to body and ensure Matter.Render texture cache is populated.
 * If keepScale is false or missing, scales sprite to match current body bounds.
 */
export function applySprite(
  render: Render,
  body: Body,
  sprite: LoadedSprite,
  opts: { keepScale?: boolean } = {},
): void {
  const texture = sprite.texture;
  type TextureCache = Record<string, HTMLImageElement | HTMLCanvasElement>;
  type RenderWithTextures = Render & { textures?: TextureCache };
  const cache = (render as RenderWithTextures).textures;

  let cached = cache ? cache[texture] : undefined;

  if (!cached) {
    if (sprite.image) {
      cached = sprite.image;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = texture;
      cached = img;
    }

    if (cache && cached) {
      cache[texture] = cached;
    }
  }

  type BodySprite = NonNullable<Body['render']['sprite']>;
  const existingSprite = body.render.sprite;
  const nextSprite: BodySprite = existingSprite
    ? { ...existingSprite }
    : {
      texture,
      xScale: 1,
      yScale: 1,
    };

  const hasExistingScale = Boolean(
    opts.keepScale &&
    existingSprite?.xScale != null &&
    existingSprite?.yScale != null,
  );

  const boundsW = Math.max(1, body.bounds.max.x - body.bounds.min.x);
  const boundsH = Math.max(1, body.bounds.max.y - body.bounds.min.y);
  const natW = Math.max(1, sprite.width);
  const natH = Math.max(1, sprite.height);

  const targetXScale = hasExistingScale
    ? (existingSprite?.xScale as number)
    : boundsW / natW;
  const targetYScale = hasExistingScale
    ? (existingSprite?.yScale as number)
    : boundsH / natH;

  const applyTexture = () => {
    nextSprite.xScale = targetXScale;
    nextSprite.yScale = targetYScale;
    nextSprite.texture = texture;
    body.render.sprite = nextSprite;
  };

  if (cached instanceof HTMLImageElement && cached.complete) {
    applyTexture();
  } else if (cached instanceof HTMLImageElement) {
    cached.addEventListener('load', applyTexture, { once: true });
  } else {
    applyTexture();
  }
}
