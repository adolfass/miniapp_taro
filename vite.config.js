import { defineConfig } from 'vite'

export default defineConfig({
  root: 'public',
  base: '/miniapp_taro/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  server: {
    port: 3000,
    open: false
  }
})
