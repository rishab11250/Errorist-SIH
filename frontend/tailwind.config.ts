import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: 'hsl(var(--surface))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          strong: 'hsl(var(--accent-strong))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        pass: 'hsl(var(--pass))',
        fail: 'hsl(var(--fail))',
        warn: 'hsl(var(--warn))',
        review: 'hsl(var(--review))',
        na: 'hsl(var(--na))',
      },
      fontFamily: {
        heading: ['Lexend', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Source Sans 3', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['clamp(2rem, 5vw, 3.75rem)', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        h1: ['clamp(1.75rem, 3.5vw, 2.5rem)', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
        h2: ['clamp(1.375rem, 2.5vw, 1.875rem)', { lineHeight: '1.2' }],
        body: ['clamp(1rem, 0.96rem + 0.2vw, 1.125rem)', { lineHeight: '1.55' }],
      },
      minHeight: { control: '2.75rem' },
      minWidth: { control: '2.75rem' },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        surface: 'var(--shadow-surface)',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        deliberate: '300ms',
      },
    },
  },
  plugins: [],
};

export default config;
