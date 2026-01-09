import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: parseInt(process.env.UI_PORT || '5173'),
		strictPort: true
	},
	define: {
		// Pass daemon ports to client at build time
		// This way users only need to set PORT/API_PORT once in .env
		'import.meta.env.VITE_STREAM_PORT': JSON.stringify(process.env.PORT || '4450'),
		'import.meta.env.VITE_API_PORT': JSON.stringify(process.env.API_PORT || '4451'),
	}
});
