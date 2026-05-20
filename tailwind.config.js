/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Alpine palette: deep navy base, glacier accent, summit highlight
        ink: {
          900: '#0B1220',
          800: '#111A2E',
          700: '#1B2742',
          600: '#27365A',
          500: '#3A4A6E',
        },
        glacier: {
          50: '#EEF6FF',
          100: '#DBEAFE',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        summit: {
          400: '#FBBF24',
          500: '#F59E0B',
        },
        success: '#10B981',
        warn: '#F59E0B',
        danger: '#EF4444',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)',
        cardHover: '0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 24px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
}
