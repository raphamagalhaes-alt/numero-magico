/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0c0e', 900: '#111316', 850: '#16191d', 800: '#1b1f24', 700: '#262b32', 600: '#363c45', 500: '#4a515c' },
        mist: { 100: '#eceef1', 200: '#d3d7dd', 300: '#aeb4bd', 400: '#9aa1ab', 500: '#858c97' },
        gold: { 300: '#e9d29a', 400: '#d8b766', 500: '#c9a24a', 600: '#a8843a' },
        gain: { 400: '#4cc38a', 500: '#2fa872' },
        loss: { 400: '#f07167', 500: '#e5534b' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
