/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 900: '#0d0d0f', 800: '#141418', 700: '#1a1a20', 600: '#22222a' },
        accent: { blue: '#3b82f6', magenta: '#d946ef', cyan: '#06b6d4', amber: '#f59e0b' },
        persona: { A: '#8b5cf6', B: '#ec4899', C: '#14b8a6', D: '#f97316' },
      },
      fontFamily: { sans: ['DM Sans', 'system-ui', 'sans-serif'] },
      keyframes: {
        'blob-slow': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(8%, -6%) scale(1.05)' },
          '66%': { transform: 'translate(-5%, 8%) scale(0.95)' },
        },
        'blob-medium': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-10%, 5%)' },
        },
        'blob-slower': {
          '0%, 100%': { transform: 'translate(-50%, 0) scale(1)' },
          '50%': { transform: 'translate(-48%, -4%) scale(1.08)' },
        },
        'grid-drift': {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(48px, 48px)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bar-fill': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'blob-slow': 'blob-slow 18s ease-in-out infinite',
        'blob-medium': 'blob-medium 14s ease-in-out infinite',
        'blob-slower': 'blob-slower 22s ease-in-out infinite',
        'grid-drift': 'grid-drift 40s linear infinite',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'scale-in': 'scale-in 0.35s ease-out forwards',
        'bar-fill': 'bar-fill 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
}
