import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const resolvePath = (relative) => fileURLToPath(new URL(relative, import.meta.url))

/**
 * Rewritten from scratch after the previous vite.config.js was found to contain a
 * supply-chain trojan (detached `node -e` spawn + eval payload, flagged by Defender as
 * Trojan:JS/PolinRider.DB!MTB). Nothing from that file was reused — the aliases below
 * were derived from the imports actually present in src/.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    // Array form because order matters: '@food/api' lives outside the Food module and
    // must be matched before the broader '@food' rule, and '@' must come last so it
    // cannot swallow the others.
    alias: [
      { find: '@food/api', replacement: resolvePath('./src/services/api') },
      { find: '@food', replacement: resolvePath('./src/modules/Food') },
      { find: '@delivery', replacement: resolvePath('./src/modules/DeliveryV2') },
      { find: '@', replacement: resolvePath('./src') },
    ],
  },

  define: {
    // Two components branch on process.env.NODE_ENV at runtime; without this the
    // browser throws "process is not defined" when they render.
    'process.env.NODE_ENV': JSON.stringify(mode),
  },

  server: {
    port: 5173,
  },
}))
