/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ivory (page and card surfaces)
        cream: {
          50: '#FFFBF2',
          100: '#FDF3E3',
          200: '#F7E8CC',
          300: '#EBD5A8',
          400: '#D9BE86',
        },
        // Gold. Use 600+ for small text on ivory, 300 for text on teal.
        gold: {
          50: '#FBF5E4',
          100: '#F6E7BE',
          200: '#F6DFA8',
          300: '#EBC873',
          400: '#E2B04F',
          500: '#B8862D',
          600: '#8A6420',
          700: '#6E4F19',
          800: '#503913',
          900: '#38280E',
        },
        // "onyx" is the Peacock Teal scale (name kept so every existing screen re-themes at once).
        onyx: {
          50: '#1C7A76',
          100: '#2C6563',
          200: '#14605C',
          300: '#0F4C4A',
          400: '#0A3A38',
          500: '#072B29',
        },
        // Deep maroon accent (secondary jewel tone)
        maroon: {
          300: '#A63058',
          400: '#8A2447',
          500: '#7B1E3A',
          600: '#5E1530',
          700: '#4A0F24',
        },
        accent: {
          rose: '#B5655A',
          sage: '#6F8268',
          wine: '#7B1E3A',
        },
        ink: '#2B1410',
      },
      fontFamily: {
        serif: ['"Cinzel"', 'Georgia', 'serif'],
        sans: ['"Jost"', 'system-ui', 'sans-serif'],
        display: ['"Cinzel"', 'Georgia', 'serif'],
        deva: ['"Noto Serif Devanagari"', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'arch-rise': 'archRise 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
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
        'soft': '0 2px 16px rgba(15, 76, 74, 0.08)',
        'medium': '0 6px 32px rgba(15, 76, 74, 0.18)',
        'gold': '0 4px 18px rgba(226, 176, 79, 0.30)',
      },
    },
  },
  plugins: [],
};
