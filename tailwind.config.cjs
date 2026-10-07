/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        newsprint: '#EFE4C9',
        'paper-light': '#F9F6EE',
        banana: '#FACC15',
      },
      fontFamily: {
        sans: ['"Open Sans"', 'Arial', 'sans-serif'],
        'open-sans': ['"Open Sans"', 'Arial', 'sans-serif'],
        bangers: ['Bangers', 'cursive'],
        lora: ['Lora', 'serif'],
        'special-elite': ['"Special Elite"', 'cursive'],
        masthead: ['"Manufacturing Consent"', 'serif'],
      },
      letterSpacing: {
        extrawidest: '.3em',
      },
      borderWidth: {
        3: '3px',
      },
      keyframes: {
        'spin-once': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'spin-once': 'spin-once 0.5s linear 1',
      },
    },
  },
  plugins: [],
};