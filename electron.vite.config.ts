import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Small assets (texture-bg.svg is ~1.3KB) default to being inlined as
    // base64 data: URIs - the CSP's default-src 'self' has no img-src
    // override, so a data: background-image gets silently blocked instead
    // of loosening the CSP, every asset referenced via url() is forced to
    // stay a real same-origin file.
    build: {
      assetsInlineLimit: 0
    },
    plugins: [react()]
  }
})
