import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// Refined neutral scale - warm-tinted darks
				carbon: {
					1: '#0a0a0b',
					2: '#0f0f10',
					3: '#141415',
					4: '#1a1a1c',
					5: '#202023',
					6: '#28282c',
					7: '#323238',
					8: '#424249',
					9: '#5a5a63',
					10: '#78787f',
					11: '#a8a8b0',
					12: '#eeeef0',
				},
				// Accent: Warm coral-orange - distinctive, not the usual cyan/purple
				accent: {
					3: '#2a1a16',
					4: '#3d2420',
					5: '#4f2e29',
					6: '#643a33',
					7: '#7d483f',
					8: '#9a584c',
					9: '#e07a5f',  // Primary - warm coral
					10: '#e8927a',
					11: '#f0aa96',
					12: '#fae5df',
				},
				// Status: Working - electric cyan (stands out against warm palette)
				active: {
					3: '#0a1f24',
					4: '#0f2d33',
					5: '#143b44',
					6: '#1a4a55',
					7: '#1f5a68',
					8: '#256b7a',
					9: '#22d3ee',  // Bright cyan
					10: '#5ce1f0',
					11: '#99ecf5',
					12: '#d4f8fc',
				},
				// Status: Needs approval - warm amber
				pending: {
					3: '#241a0a',
					4: '#35260f',
					5: '#463214',
					6: '#573f19',
					7: '#6a4c1f',
					8: '#7d5a26',
					9: '#eab308',
					10: '#f0c53d',
					11: '#f5d76e',
					12: '#fcf3d4',
				},
				// Status: Waiting - muted slate
				waiting: {
					3: '#161619',
					4: '#1d1d22',
					5: '#25252b',
					6: '#2e2e36',
					7: '#383842',
					8: '#45454f',
					9: '#6b6b78',
					10: '#8a8a96',
					11: '#acacb6',
					12: '#d4d4da',
				},
				// Error - muted red
				error: {
					3: '#261214',
					5: '#3d1c1f',
					6: '#4f2528',
					9: '#e54d4d',
					11: '#f5a3a3',
				},
			},
			fontFamily: {
				sans: ['"Geist Sans"', ...defaultTheme.fontFamily.sans],
				mono: ['"Geist Mono"', '"JetBrains Mono Variable"', 'JetBrains Mono', ...defaultTheme.fontFamily.mono],
			},
			fontSize: {
				'2xs': ['0.6875rem', { lineHeight: '1rem' }],  // 11px
			},
			animation: {
				'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
				'fade-in': 'fade-in 0.15s ease-out',
				'slide-in': 'slide-in 0.2s ease-out backwards',
			},
			keyframes: {
				'glow-pulse': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.5' },
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' },
				},
				'slide-in': {
					from: { opacity: '0', transform: 'translateY(4px)' },
					to: { opacity: '1', transform: 'translateY(0)' },
				},
			},
			boxShadow: {
				'card': 'inset 0 1px 0 0 rgba(255,255,255,0.03), 0 1px 2px 0 rgba(0,0,0,0.4)',
				'card-hover': 'inset 0 1px 0 0 rgba(255,255,255,0.05), 0 4px 16px -4px rgba(0,0,0,0.5)',
				'card-active': 'inset 0 1px 0 0 rgba(34,211,238,0.1), 0 0 0 1px rgba(34,211,238,0.15), 0 4px 20px -4px rgba(34,211,238,0.2)',
				'card-pending': 'inset 0 1px 0 0 rgba(234,179,8,0.08), 0 0 0 1px rgba(234,179,8,0.2)',
				'popup': '0 0 0 1px rgba(255,255,255,0.05), 0 16px 40px -8px rgba(0,0,0,0.6)',
				'glow-active': '0 0 20px -4px rgba(34,211,238,0.4)',
				'glow-pending': '0 0 16px -4px rgba(234,179,8,0.3)',
			},
			backgroundImage: {
				'card-gradient': 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 100%)',
				'card-gradient-active': 'linear-gradient(to bottom, rgba(34,211,238,0.03) 0%, transparent 100%)',
				'card-gradient-pending': 'linear-gradient(to bottom, rgba(234,179,8,0.02) 0%, transparent 100%)',
				'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
			},
		},
	},
	plugins: [],
};
