/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./remotion/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Hardcoded hex colors for Remotion (CSS variables don't work)
        background: '#0d0e14',
        foreground: '#f8fafc',
        card: '#141520',
        muted: '#1e1f2a',
        'muted-foreground': '#858a99',
        border: '#282937',
        input: '#1a1b24',
        primary: {
          DEFAULT: '#00d4ff',
          foreground: '#0d0e14',
        },
        secondary: {
          DEFAULT: '#f5b800',
          foreground: '#0d0e14',
        },
        accent: {
          DEFAULT: '#17b877',
          foreground: '#0d0e14',
        },
        destructive: {
          DEFAULT: '#e54545',
          foreground: '#f8fafc',
        },
        // Status colors
        status: {
          success: '#17b877',
          warning: '#f5b800',
          error: '#e54545',
          info: '#00d4ff',
          pending: '#858a99',
          active: '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
};
