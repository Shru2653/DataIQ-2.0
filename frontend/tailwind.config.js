/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1e3a8a', // blue-800
          light: '#3b82f6',   // blue-500
        }
      }
    },
  },
  plugins: [],
}
