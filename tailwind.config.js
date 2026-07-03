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
        // Brand tokens pulled from the LIVE Botscrew analytics page
        // (bots.getskitickets.com/admin/bot/2/analytics). Authoritative source
        // for our visual identity — charts + text + canvas match the tool
        // resorts already use. See src/lib/chartTheme.ts for the chart presets.
        brand: {
          blue: '#2182BF', // primary — KPI numbers, primary series, CTAs
          blueSoft: '#7FB9DD',
          gold: '#F3B116', // accent — secondary series
          slate: '#354052', // line series + strong marks
          heading: '#3A3F62', // card titles
          muted: '#616581', // secondary text + axis labels
          ink: '#212529', // body text
        },
        canvas: '#F4F7FA', // app background (soft blue-grey)
        // Botscrew dashboard palette (matches the existing admin shell).
        // Medium-blue chrome + bright cobalt CTAs.
        botscrew: {
          50: '#EEF5FB',
          100: '#D6E7F3',
          400: '#3F92CE',
          500: '#2A7DC0',   // sidebar / active tab background
          600: '#236AA8',   // hover
          700: '#1B5689',   // pressed / active state
        },
        // Action-button blue — slightly brighter than the chrome
        action: {
          500: '#2196F3',
          600: '#1976D2',
        },
        // Alpine palette retained for the hero only (deep navy base + glacier accent)
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
