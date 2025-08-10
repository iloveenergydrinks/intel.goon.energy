import { defineConfig } from 'vite'

export default defineConfig({
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    // Allow Railway preview hosts
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'intelgoonenergy-production.up.railway.app',
      'intel.goon.energy',
    ],
  },
})

