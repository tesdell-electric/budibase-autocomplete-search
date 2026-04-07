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
  },
  // Bundle Svelte into the plugin — Budibase 3.35.x does not expose
  // Svelte 5 internals as window globals, so we cannot externalize it.
  external: [],
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
