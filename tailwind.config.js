/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f4f1fb', 100: '#e7e0f6', 200: '#cfc2ec', 500: '#5a3fa8', 600: '#4a3290', 700: '#3a2674', 800: '#2d1d5c', 900: '#231646' },
        crimson: { 500: '#b3263e', 600: '#9a1f35' },
        gold: { 400: '#e0b04a', 500: '#c8921f', 600: '#a87714' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
