import { defineConfig } from 'vite'

export default defineConfig({
  root: 'public',
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'https://goldtarot.ru',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
