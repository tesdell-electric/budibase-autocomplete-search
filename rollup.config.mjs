import commonjs from "@rollup/plugin-commonjs"
import resolve from "@rollup/plugin-node-resolve"
import svelte from "rollup-plugin-svelte"
import { terser } from "rollup-plugin-terser"
import postcss from "rollup-plugin-postcss"
import json from "rollup-plugin-json"
import * as tar from "tar"
import fs from "fs"
import crypto from "crypto"

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"))

// ── Custom plugins ────────────────────────────────────────────────────────────

const clean = () => ({
  name: "clean",
  buildStart() {
    if (fs.existsSync("./dist")) {
      fs.readdirSync("./dist")
        .filter(f => f.endsWith(".tar.gz"))
        .forEach(f => fs.unlinkSync(`./dist/${f}`))
    }
  },
})

// Embed a SHA1 hash + version into schema.json so Budibase can detect updates
const hashSchema = () => ({
  name: "hash-schema",
  writeBundle() {
    const fileBuffer = fs.readFileSync("dist/plugin.min.js")
    const hash = crypto.createHash("sha1").update(fileBuffer).digest("hex")
    const schema = JSON.parse(fs.readFileSync("./dist/schema.json", "utf8"))
    fs.writeFileSync("./dist/schema.json", JSON.stringify({ ...schema, hash, version: pkg.version }, null, 2))
  },
})

// Auto-create the correctly named tar.gz in dist/ after every build
const bundle = () => ({
  name: "bundle",
  async writeBundle() {
    const bundleName = `${pkg.name}-${pkg.version}.tar.gz`
    return tar
      .c({ gzip: true, cwd: "dist" }, ["plugin.min.js", "schema.json", "package.json"])
      .pipe(fs.createWriteStream(`dist/${bundleName}`))
  },
})

// ── Build config ──────────────────────────────────────────────────────────────

export default {
  input: "src/index.js",
  // Svelte is provided by the Budibase host at runtime — do NOT bundle it.
  // The globals below must match what Budibase exposes on window.
  external: (id) => id === "svelte" || id.startsWith("svelte/"),
  output: {
    format: "iife",
    file: "dist/plugin.min.js",
    name: "plugin",
    sourcemap: true,
    globals: (id) => {
      if (id === "svelte/store")      return "svelteStore"
      if (id === "svelte/transition") return "svelteTransition"
      if (id === "svelte/animate")    return "svelteAnimate"
      if (id === "svelte/motion")     return "svelteMotion"
      if (id === "svelte/easing")     return "svelteEasing"
      if (id === "svelte/events")     return "svelteEvents"
      if (id.startsWith("svelte/internal")) return "svelteInternal"
      return "svelte"
    },
  },
  plugins: [
    clean(),
    svelte({
      emitCss: true,
      compilerOptions: {
        // componentApi:4 makes Svelte 5 output the Svelte 4 instantiation API
        // that Budibase's plugin loader expects (new Component() style).
        compatibility: { componentApi: 4 },
      },
      onwarn(warning, handler) {
        const ignore = ["unused-export-let", "css-unused-selector", "a11y-no-onchange"]
        if (!ignore.includes(warning.code) && !warning.code?.startsWith("a11y-")) handler(warning)
      },
    }),
    postcss({ inject: true, minimize: true }),
    resolve({
      browser: true,
      exportConditions: ["default", "module", "import", "svelte"],
      extensions: [".mjs", ".js", ".json", ".svelte"],
    }),
    commonjs(),
    json(),
    terser(),
    // Copy schema + package into dist so the bundle plugin can tar them up
    {
      name: "copy-assets",
      writeBundle() {
        fs.copyFileSync("schema.json",  "dist/schema.json")
        fs.copyFileSync("package.json", "dist/package.json")
      },
    },
    hashSchema(),
    bundle(),
  ],
}
