import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FAF8F3',
        'surface-dim': '#F1ECE4',
        'surface-card': '#FFFFFF',
        charcoal: {
          DEFAULT: '#1C1B19',
          light: '#2D2C29',
        },
        ink: {
          DEFAULT: '#1C1B19',
          muted: '#6B6862',
        },
        amberAccent: '#C1550C',
        terracotta: {
          DEFAULT: '#C1550C',
          hover: '#A34607',
          light: '#FDF4EF',
          border: '#E87A38',
        },
        forestConfirm: '#1F4B3F',
        forest: {
          DEFAULT: '#1F4B3F',
          light: '#EBF3F0',
          border: '#2C6858',
        },
        brickFail: '#B3261E',
        brick: '#B3261E',
        'brick-bg': '#FDF2F2',
        goldWarn: '#B8860B',
        amber: '#B8860B',
        'amber-bg': '#FEF9EB',
        clayReview: '#9C4221',
        rust: '#9C4221',
        'rust-bg': '#FAF0EB',
        'border-kinetic': '#E4DFC8',
        'border-subtle': '#EFECE3',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
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
        heading: ['var(--font-heading)', 'Space Grotesk', 'Lexend', 'sans-serif'],
        body: ['var(--font-body)', 'Plus Jakarta Sans', 'Source Sans 3', 'sans-serif'],
        sans: ['var(--font-body)', 'Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
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
        kinetic: '10px',
        'kinetic-sm': '6px',
      },
      boxShadow: {
        surface: 'var(--shadow-surface)',
        'kinetic-sm': '0 2px 6px -1px rgba(28, 27, 25, 0.05), 0 1px 3px -1px rgba(28, 27, 25, 0.03)',
        'kinetic-md': '0 8px 20px -3px rgba(28, 27, 25, 0.07), 0 3px 8px -2px rgba(28, 27, 25, 0.04)',
        'kinetic-glow': '0 0 24px -4px rgba(193, 85, 12, 0.22)',
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
