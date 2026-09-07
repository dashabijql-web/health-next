import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 9531,
      proxy: {
        '/dev-api': {
          target: env.VITE_TARGET || 'http://localhost:8081',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/dev-api/, '/api'),
        },
      },
    },
  }
})
