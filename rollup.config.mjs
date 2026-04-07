import svelte from "rollup-plugin-svelte"
import resolve from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import { terser } from "rollup-plugin-terser"
import postcss from "rollup-plugin-postcss"
import json from "rollup-plugin-json"
import fs from "fs"

const clean = {
  name: "clean",
  buildStart() {
    if (fs.existsSync("dist")) {
      fs.readdirSync("dist")
        .filter(f => f.endsWith(".tar.gz") || f.endsWith(".tgz"))
        .forEach(f => fs.unlinkSync(`dist/${f}`))
    }
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
      "svelte/internal/client": "svelte_internal_client",
      "svelte/store": "svelte_store",
      "svelte/transition": "svelte_transition",
      "svelte/animate": "svelte_animate",
      "svelte/easing": "svelte_easing",
      "svelte/motion": "svelte_motion",
      "svelte/events": "svelte_events",
    },
  },
  external: [
    "svelte",
    "svelte/internal",
    "svelte/internal/client",
    "svelte/store",
    "svelte/transition",
    "svelte/animate",
    "svelte/easing",
    "svelte/motion",
    "svelte/events",
  ],
  plugins: [
    clean,
    svelte({
      emitCss: true,
      compilerOptions: { dev: false },
      onwarn(warning, handler) {
        if (warning.code.startsWith("a11y-")) return
        handler(warning)
      },
    }),
    postcss({ inject: true, minimize: true }),
    resolve({ browser: true, exportConditions: ["svelte"], extensions: [".svelte", ".js"] }),
    commonjs(),
    json(),
    terser(),
  ],
}
