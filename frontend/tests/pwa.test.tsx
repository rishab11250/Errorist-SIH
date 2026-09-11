import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import manifest from '@/app/manifest';
import { registerPwaServiceWorker } from '@/components/pwa/PwaRegistration';
import { AuthProvider, useAuth } from '@/lib/auth';
import { OCR_ASSET_PATHS } from '@/lib/ocr';

afterEach(() => vi.unstubAllGlobals());

describe('PWA shell', () => {
  it('publishes a standalone manifest with installable and maskable icons', () => {
    const value = manifest();
    expect(value).toMatchObject({
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
      ])
    );
  });

  it('registers a root-scoped service worker without HTTP caching the worker script', async () => {
    const postMessage = vi.fn();
    const registration = { active: { postMessage } };
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal('navigator', {
      serviceWorker: { register, ready: Promise.resolve(registration) },
    });

    await registerPwaServiceWorker(true);

    expect(register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(postMessage).toHaveBeenCalledWith({ type: 'CACHE_CAPTURE_SHELL' });
  });

  it('keeps every Tesseract runtime URL on the service worker controlled origin', () => {
    expect(Object.values(OCR_ASSET_PATHS)).toEqual([
      '/tesseract/worker.min.js',
      '/tesseract/core',
      '/tesseract/lang',
    ]);
  });

  it('verifies Hindi and English traineddata files exist in local assets for offline PWA precache', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const langDir = path.resolve(__dirname, '../public/tesseract/lang');
    expect(fs.existsSync(path.join(langDir, 'eng.traineddata.gz'))).toBe(true);
    expect(fs.existsSync(path.join(langDir, 'hin.traineddata.gz'))).toBe(true);
  });

  it('renders a non-privileged inspector identity when auth is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    function AuthState() {
      const { loading, user } = useAuth();
      return <p>{loading ? 'Loading' : user?.display_name}</p>;
    }

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    );

    expect(await screen.findByText('Offline inspector')).toBeVisible();
  });
});
