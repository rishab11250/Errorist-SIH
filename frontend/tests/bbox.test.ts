import { describe, expect, it } from 'vitest';

import { denormaliseBbox, normaliseBbox } from '../lib/bbox';

describe('bbox', () => {
  it('normalises pixels to [0, 1]', () => expect(normaliseBbox([100, 50, 200, 100], 400, 200)).toEqual([0.25, 0.25, 0.5, 0.5]));
  it('denormalises back to pixels', () => expect(denormaliseBbox([0.25, 0.25, 0.5, 0.5], 800, 400)).toEqual({ x: 200, y: 100, w: 400, h: 200 }));
  it('round-trips losslessly', () => {
    const original: [number, number, number, number] = [123, 456, 78, 90];
    expect(denormaliseBbox(normaliseBbox(original, 1000, 1000), 1000, 1000)).toEqual({ x: 123, y: 456, w: 78, h: 90 });
  });
});
