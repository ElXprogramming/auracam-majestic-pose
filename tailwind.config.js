/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#ffd700',
          500: '#e6c200',
          600: '#b89a00',
        },
      },
      animation: {
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite alternate',
        'fadeIn': 'fadeIn 0.18s ease-out both',
        'slideLeft': 'slideLeft 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        glowPulse: {
          '0%': { filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))' },
          '100%': { filter: 'drop-shadow(0 0 25px rgba(255, 223, 100, 0.9))' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translate3d(100%, 0, 0)' },
          '100%': { transform: 'translate3d(0, 0, 0)' },
        },
      },
    },
  },
  plugins: [],
};
