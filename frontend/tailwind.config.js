/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '30px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
        '4xl': ['36px', { lineHeight: '44px' }],
        '5xl': ['48px', { lineHeight: '56px' }],
        '6xl': ['60px', { lineHeight: '68px' }],
        '7xl': ['72px', { lineHeight: '80px' }],
        '8xl': ['96px', { lineHeight: '104px' }],
        '9xl': ['128px', { lineHeight: '1' }],
      },
      colors: {
        primary: {
          DEFAULT: '#4361ee', // indigo blue
          light: '#eef0f6',   // very light blue-gray
        },
        // DataIQ design system colors
        diq: {
          accent: '#4361ee',
          'accent-hover': '#3e56d4',
          'accent-light': '#eef0f6',
          accent2: '#5c4ee8',   // indigo/purple
          accent3: '#9333ea',   // violet
          accent4: '#4f72f5',   // steel blue
          nav: '#1f2937',       // dark gray (darker sidebar)
          'nav-text': 'rgba(255, 255, 255, 0.95)',
          'nav-muted': 'rgba(255, 255, 255, 0.6)',
          'nav-active': 'rgba(255, 255, 255, 0.15)',
          'bg': '#eef0f6',
          'card': '#ffffff',
          'border': '#e8eaf0',
          'border-med': '#d4d8e5',
          'text': '#111827',
          'text-secondary': '#6b7280',
          'text-muted': '#9ca3af',
        }
      }
    },
  },
  plugins: [],
}

