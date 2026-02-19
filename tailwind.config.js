/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#6366F1',   // Indigo
        secondary: '#8B5CF6', // Purple
        accent: '#F59E0B',    // Amber
        surface: '#1E1E2E',
        'surface-light': '#2A2A3E',
      },
    },
  },
  plugins: [],
};
