import { describe, expect, it } from 'vitest';
import {
  computeHomography,
  isValidConvexQuad,
  warpPerspective,
  type Quad,
} from '../lib/perspective';

describe('perspective module', () => {
  it('validates convex vs non-convex quads', () => {
    const validQuad: Quad = {
      tl: { x: 50, y: 50 },
      tr: { x: 750, y: 40 },
      br: { x: 760, y: 550 },
      bl: { x: 40, y: 560 },
    };
    expect(isValidConvexQuad(validQuad, 800, 600)).toBe(true);

    // Self-intersecting / bowtie
    const bowtieQuad: Quad = {
      tl: { x: 50, y: 50 },
      tr: { x: 750, y: 550 }, // crossed
      br: { x: 750, y: 50 },
      bl: { x: 50, y: 550 },
    };
    expect(isValidConvexQuad(bowtieQuad, 800, 600)).toBe(false);

    // Too small area (<15% of 800x600 = 72000)
    const smallQuad: Quad = {
      tl: { x: 10, y: 10 },
      tr: { x: 20, y: 10 },
      br: { x: 20, y: 20 },
      bl: { x: 10, y: 20 },
    };
    expect(isValidConvexQuad(smallQuad, 800, 600)).toBe(false);
  });

  it('computes homography for rectangular and projective quads', () => {
    // Identity rectangle
    const rectQuad: Quad = {
      tl: { x: 0, y: 0 },
      tr: { x: 800, y: 0 },
      br: { x: 800, y: 600 },
      bl: { x: 0, y: 600 },
    };
    const hRect = computeHomography(rectQuad);
    expect(hRect).toBeDefined();
    expect(hRect?.a).toBe(800);
    expect(hRect?.e).toBe(600);
    expect(hRect?.g).toBe(0);
    expect(hRect?.h).toBe(0);

    // Tilted / trapezoidal quad
    const trapQuad: Quad = {
      tl: { x: 100, y: 50 },
      tr: { x: 700, y: 80 },
      br: { x: 650, y: 520 },
      bl: { x: 150, y: 500 },
    };
    const hTrap = computeHomography(trapQuad);
    expect(hTrap).toBeDefined();
  });

  it('maps warped bounding boxes back to original coordinates', () => {
    // Canvas context mock for testing
    const mockCanvas = {
      getContext: () => ({
        getImageData: () => ({
          data: new Uint8ClampedArray(800 * 600 * 4),
        }),
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: () => undefined,
      }),
    } as unknown as HTMLCanvasElement;

    const ctx = mockCanvas.getContext('2d') as unknown as CanvasRenderingContext2D;

    const quad: Quad = {
      tl: { x: 0, y: 0 },
      tr: { x: 800, y: 0 },
      br: { x: 800, y: 600 },
      bl: { x: 0, y: 600 },
    };

    const res = warpPerspective(ctx, 800, 600, quad, 800);
    expect(res).toBeDefined();
    if (res) {
      // For identity quad, mapped bbox should match original bbox
      const mapped = res.mapBboxToOriginal([100, 150, 200, 50]);
      expect(Math.round(mapped[0])).toBe(100);
      expect(Math.round(mapped[1])).toBe(150);
      expect(Math.round(mapped[2])).toBe(200);
      expect(Math.round(mapped[3])).toBe(50);
    }
  });
});
