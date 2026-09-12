import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';

import { config } from '../middleware';

describe('PWA asset authentication boundary', () => {
  it.each(['/sw.js', '/offline/idb.js', '/manifest.webmanifest', '/tesseract/core/tesseract-core.wasm', '/tesseract/lang/eng.traineddata.gz'])('serves %s without a session redirect', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });

  it.each(['/', '/history', '/operations'])('retains authentication for %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });
});
