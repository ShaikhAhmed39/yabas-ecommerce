/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFCF8',
          100: '#FAF9F6',
          200: '#F5F3EE',
          300: '#EFEBE3',
          400: '#E5DFD3',
        },
        gold: {
          50: '#FBF6EC',
          100: '#F3E8C8',
          200: '#E5D4A0',
          300: '#D9BF78',
          400: '#C9A054',
          500: '#B8893E',
          600: '#9C7332',
          700: '#7A5928',
          800: '#5E4420',
          900: '#4A3619',
        },
        onyx: {
          50: '#3A3835',
          100: '#2E2C29',
          200: '#252320',
          300: '#1C1B1A',
          400: '#15140F',
          500: '#0E0D0B',
        },
        accent: {
          rose: '#C97B5A',
          sage: '#8A9A7B',
          wine: '#7A2E3A',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.25s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'ticker': 'ticker 30s linear infinite',
      },
      keyframes: {
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
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        'soft': '0 2px 20px rgba(28, 27, 26, 0.06)',
        'medium': '0 4px 30px rgba(28, 27, 26, 0.10)',
        'gold': '0 4px 20px rgba(201, 160, 84, 0.25)',
      },
    },
  },
  plugins: [],
};
