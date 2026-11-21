import { defineConfig } from 'vite'

// Served from https://ramanchawla-space.github.io/musical-chairs/
export default defineConfig({
  base: process.env.BASE ?? '/musical-chairs/',
  server: { host: true },
})
