/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light surfaces: rosy ivory (jeweller's silk lining)
        cream: {
          50: '#FFFBF6',
          100: '#FAF0E8',
          200: '#F3E4D9',
          300: '#EAD6C7',
          400: '#DCC3AF',
        },
        // Antique gold. Use 600+ for small text on ivory, 300 for text on velvet.
        gold: {
          50: '#FAF3E4',
          100: '#F1E2BC',
          200: '#E8CF94',
          300: '#E2C27D',
          400: '#C49A45',
          500: '#96691F',
          600: '#7E5619',
          700: '#654414',
          800: '#4C330F',
          900: '#38250B',
        },
        // "onyx" is the wine-velvet / ink scale (name kept so every existing screen re-themes at once).
        onyx: {
          50: '#5A2234',
          100: '#5B3A42',
          200: '#4A1428',
          300: '#3A1020',
          400: '#2C0A18',
          500: '#1E0610',
        },
        accent: {
          rose: '#B5655A',
          sage: '#6F8268',
          wine: '#7A2E3A',
        },
      },
      fontFamily: {
        serif: ['"Marcellus"', 'Georgia', 'serif'],
        sans: ['"Jost"', 'system-ui', 'sans-serif'],
        display: ['"Marcellus"', 'Georgia', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'arch-rise': 'archRise 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.25s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'ticker': 'ticker 30s linear infinite',
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
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        'soft': '0 2px 16px rgba(58, 16, 32, 0.07)',
        'medium': '0 6px 32px rgba(58, 16, 32, 0.16)',
        'gold': '0 4px 18px rgba(196, 154, 69, 0.28)',
      },
    },
  },
  plugins: [],
};
