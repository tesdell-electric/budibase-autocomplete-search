import svelte from "rollup-plugin-svelte"
import resolve from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import { terser } from "rollup-plugin-terser"
import postcss from "rollup-plugin-postcss"
import fs from "fs"

// Auto-clean dist before build
const clean = {
  name: "clean",
  buildStart() {
    const files = fs.existsSync("dist")
      ? fs.readdirSync("dist").filter(f => f.endsWith(".tar.gz"))
      : []
    files.forEach(f => fs.unlinkSync(`dist/${f}`))
  },
}

export default {
  input: "src/index.js",
  output: {
    format: "iife",
    file: "dist/plugin.min.js",
    name: "plugin",
    globals: {
      svelte: "svelte",
      "svelte/internal": "svelte_internal",
      "svelte/store": "svelte_store",
      "svelte/transition": "svelte_transition",
      "svelte/animate": "svelte_animate",
      "svelte/easing": "svelte_easing",
    },
  },
  // Do NOT externalize svelte — bundle it in.
  // Budibase injects Svelte at runtime in some versions but it's safer to bundle.
  plugins: [
    clean,
    svelte({
      emitCss: true,
      compilerOptions: {
        dev: false,
      },
      onwarn(warning, defaultHandler) {
        if (warning.code.startsWith("a11y-")) return
        defaultHandler(warning)
      },
    }),
    postcss({
      inject: true,   // Inject CSS into JS bundle — Budibase only loads plugin.min.js
      minimize: true,
    }),
    resolve({
      browser: true,
      exportConditions: ["svelte"],
      extensions: [".svelte", ".js"],
    }),
    commonjs(),
    terser(),
  ],
}
