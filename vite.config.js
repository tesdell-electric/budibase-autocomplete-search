import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js"

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: false,
      },
      onwarn(warning, defaultHandler) {
        // Svelte a11y rules trip on Budibase's patterns; suppress them.
        if (warning.code.startsWith("a11y-")) return
        defaultHandler(warning)
      },
    }),
    cssInjectedByJsPlugin(),   // Inlines CSS into index.js — required for Budibase plugins
  ],
  build: {
    lib: {
      entry: "src/index.js",
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // These are provided by the Budibase host at runtime — never bundle them.
      external: ["svelte", "@budibase/bbui"],
      output: {
        globals: {
          svelte: "svelte",
          "@budibase/bbui": "bbui",
        },
      },
    },
    minify: true,
    target: "es2015",
    outDir: "dist",
  },
})
