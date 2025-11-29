/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// CSS変数を使用したダイナミックカラー
				primary: {
					50: 'rgb(var(--primary-50) / <alpha-value>)',
					100: 'rgb(var(--primary-100) / <alpha-value>)',
					200: 'rgb(var(--primary-200) / <alpha-value>)',
					300: 'rgb(var(--primary-300) / <alpha-value>)',
					400: 'rgb(var(--primary-400) / <alpha-value>)',
					500: 'rgb(var(--primary-500) / <alpha-value>)',
					600: 'rgb(var(--primary-600) / <alpha-value>)',
					700: 'rgb(var(--primary-700) / <alpha-value>)',
					800: 'rgb(var(--primary-800) / <alpha-value>)',
					900: 'rgb(var(--primary-900) / <alpha-value>)',
					950: 'rgb(var(--primary-950) / <alpha-value>)'
				},
				dark: {
					50: '#f8fafc',
					100: '#f1f5f9',
					200: '#e2e8f0',
					300: '#cbd5e1',
					400: '#94a3b8',
					500: '#64748b',
					600: '#475569',
					700: '#334155',
					800: '#1e293b',
					900: '#0f172a',
					950: '#020617'
				},
				// テーマ対応の背景色
				themed: {
					base: 'rgb(var(--bg-base) / <alpha-value>)',
					surface: 'rgb(var(--bg-surface) / <alpha-value>)',
					elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
					border: 'rgb(var(--border-color) / <alpha-value>)',
					text: 'rgb(var(--text-primary, 226 232 240) / <alpha-value>)',
					'text-secondary': 'rgb(var(--text-secondary, 148 163 184) / <alpha-value>)',
					'text-muted': 'rgb(var(--text-muted, 100 116 139) / <alpha-value>)'
				}
			},
			fontFamily: {
				sans: ['Inter', 'Noto Sans JP', 'system-ui', 'sans-serif'],
				mono: ['JetBrains Mono', 'Fira Code', 'monospace']
			}
		}
	},
	plugins: [
		require('@tailwindcss/typography')
	]
};
