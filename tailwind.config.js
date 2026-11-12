/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ivory (page and card surfaces)
        cream: {
          50: '#FFFFFF',
          100: '#FAF8F4',
          200: '#F3EDE0',
          300: '#ECE2CF',
          400: '#E6DFD2',
        },
        // Gold. Use 600+ for small text on ivory, 300 for text on teal.
        gold: {
          50: '#FAF5EA',
          100: '#F3E9D2',
          200: '#E8D9B8',
          300: '#D9C08A',
          400: '#C9A96A',
          500: '#A98445',
          600: '#7D6030',
          700: '#5E4824',
          800: '#443319',
          900: '#2E2211',
        },
        // "onyx" is the Peacock Teal scale (name kept so every existing screen re-themes at once).
        onyx: {
          50: '#4A4235',
          100: '#3A342A',
          200: '#2A251D',
          300: '#16130F',
          400: '#0E0C09',
          500: '#080705',
        },
        // Deep maroon accent (secondary jewel tone)
        maroon: {
          300: '#B5655A',
          400: '#9B4A3E',
          500: '#8A3B2E',
          600: '#6E2D23',
          700: '#4F2019',
        },
        accent: {
          rose: '#B5655A',
          sage: '#6F8268',
          wine: '#8A3B2E',
        },
        ink: '#16130F',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Jost"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        deva: ['"Noto Serif Devanagari"', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'arch-rise': 'archRise 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'drop-in': 'dropIn 0.35s ease-out',
        'scale-in': 'scaleIn 0.25s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'ticker': 'ticker 30s linear infinite',
        'spin-slow': 'spin 90s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        archRise: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        dropIn: {
          '0%': { opacity: '0', transform: 'translateY(-14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        'soft': '0 2px 16px rgba(22, 19, 15, 0.08)',
        'medium': '0 6px 32px rgba(22, 19, 15, 0.16)',
        'gold': '0 4px 18px rgba(169, 132, 69, 0.30)',
      },
    },
  },
  plugins: [],
};
