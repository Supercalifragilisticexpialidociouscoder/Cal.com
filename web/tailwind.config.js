/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}', './demo/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        emphasis: token('emphasis'),

        // Borders
        hairline: token('hairline'),
        edge: token('edge'),
        'edge-strong': token('edge-strong'),

        // Text
        ink: token('ink'),
        body: token('body'),
        muted: token('muted'),
        faint: token('faint'),

        // Brand
        accent: token('accent'),
        'accent-ink': token('accent-ink'),
        'accent-wash': token('accent-wash'),

        // Where an event comes from
        'src-institution': token('src-institution'),
        'src-institution-wash': token('src-institution-wash'),
        'src-institution-text': token('src-institution-text'),
        'src-department': token('src-department'),
        'src-department-wash': token('src-department-wash'),
        'src-department-text': token('src-department-text'),
        'src-academic': token('src-academic'),
        'src-academic-wash': token('src-academic-wash'),
        'src-academic-text': token('src-academic-text'),
        'src-club': token('src-club'),
        'src-club-wash': token('src-club-wash'),
        'src-club-text': token('src-club-text'),
        'src-other': token('src-other'),
        'src-other-wash': token('src-other-wash'),
        'src-other-text': token('src-other-text'),
        'src-deadline': token('src-deadline'),
        'src-deadline-wash': token('src-deadline-wash'),
        'src-deadline-text': token('src-deadline-text'),

        // Status and readiness
        success: token('success'),
        'success-wash': token('success-wash'),
        'success-text': token('success-text'),
        attention: token('attention'),
        'attention-wash': token('attention-wash'),
        'attention-text': token('attention-text'),
        'attention-edge': token('attention-edge'),
        error: token('error'),
        'error-wash': token('error-wash'),
        'error-text': token('error-text'),
        'error-edge': token('error-edge'),
      },
      fontFamily: {
        // Inter first, then the platform UI face. Cal Sans is Cal.com's own
        // brand typeface and is deliberately not used here.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        // Cal.com's scale: 4px base, 6 / 8 / 12 / 16 above it.
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        control: '10px',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        raised: '0 1px 1px 0 rgb(0 0 0 / 0.07), 0 1px 2px 0 rgb(0 0 0 / 0.08), 0 2px 2px 0 rgb(0 0 0 / 0.10), 0 0 8px 0 rgb(0 0 0 / 0.05)',
        overlay: '0 5px 20px 0 rgb(0 0 0 / 0.10), 0 10px 40px 0 rgb(0 0 0 / 0.03)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'check-pop': {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        'bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out both',
        'fade-in-up': 'fade-in-up 600ms cubic-bezier(0.21, 1.02, 0.73, 1) both',
        'slide-up': 'slide-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-in': 'toast-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'check-pop': 'check-pop 220ms ease-out',
        'bar-grow': 'bar-grow 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
