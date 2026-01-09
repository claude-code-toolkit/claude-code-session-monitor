import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				violet: {
					1: '#14121f',
					2: '#1b1525',
					3: '#291f43',
					4: '#33265a',
					5: '#3d2e6e',
					6: '#473781',
					7: '#5842a3',
					8: '#6e56cf',
					9: '#8b5cf6',
					10: '#9d6dff',
					11: '#baa7ff',
					12: '#e2ddfe'
				},
				slate: {
					1: '#111113',
					2: '#18191b',
					3: '#212225',
					4: '#272a2d',
					5: '#2e3135',
					6: '#363a3f',
					7: '#43484e',
					8: '#5a6169',
					9: '#696e77',
					10: '#777b84',
					11: '#b0b4ba',
					12: '#edeef0'
				},
				grass: {
					3: '#0d2214',
					6: '#1b3926',
					9: '#22c55e',
					11: '#5cff8a'
				},
				orange: {
					3: '#2c1608',
					6: '#4e2a09',
					9: '#f97316',
					11: '#ff9a3d'
				},
				amber: {
					3: '#271e00',
					6: '#473a00',
					9: '#eab308',
					11: '#ffc53d'
				}
			},
			fontFamily: {
				sans: ['"Inter Variable"', 'Inter', ...defaultTheme.fontFamily.sans],
				heading: ['"Space Grotesk Variable"', 'Space Grotesk', ...defaultTheme.fontFamily.sans],
				mono: ['"JetBrains Mono Variable"', 'JetBrains Mono', ...defaultTheme.fontFamily.mono]
			},
			animation: {
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
				wiggle: 'wiggle 0.5s ease-in-out infinite',
				'slide-up': 'slide-up 0.3s ease-out backwards'
			},
			keyframes: {
				'pulse-glow': {
					'0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)' },
					'50%': { boxShadow: '0 0 0 8px rgba(34, 197, 94, 0)' }
				},
				wiggle: {
					'0%, 100%': { transform: 'rotate(0deg)' },
					'25%': { transform: 'rotate(-1deg)' },
					'75%': { transform: 'rotate(1deg)' }
				},
				'slide-up': {
					from: { opacity: '0', transform: 'translateY(12px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				}
			}
		}
	},
	plugins: []
};
