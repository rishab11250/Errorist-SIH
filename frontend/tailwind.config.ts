import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { pass: '#10b981', fail: '#ef4444', warn: '#f59e0b', na: '#6b7280' },
    },
  },
  plugins: [],
};

export default config;
