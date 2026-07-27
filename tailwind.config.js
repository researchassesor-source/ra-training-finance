/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef3fd',
          100: '#dbe6fb',
          200: '#b8cff3',
          300: '#8aaee8',
          400: '#5687d3',
          500: '#2f6fe4',
          600: '#185fa5',
          700: '#114899',
          800: '#0d3673',
          900: '#082a5c',
          950: '#041b3d',
        },
        secondary: {
          50:  '#fef0e2',
          100: '#fde2c7',
          200: '#fbc99c',
          300: '#f7ac67',
          400: '#f38f32',
          500: '#f1871a',
          600: '#e46113',
          700: '#cd7316',
          800: '#a95817',
          900: '#853f15',
          950: '#4a1e0a',
        },
      },
    },
  },
  plugins: [],
}
