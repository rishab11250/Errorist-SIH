import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const backendUrl = (process.env.LMPC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: repositoryRoot,
  allowedDevOrigins: [
      '*.ngrok-free.app',
      '*.ngrok-free.dev',
      '*.ngrok.app',
      '*.ngrok.dev',
      '*.ngrok.io',
      '*.trycloudflare.com',
      '*.localtunnel.me',
      '192.168.43.76:3000',
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
