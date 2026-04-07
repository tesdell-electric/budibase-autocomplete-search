import AutocompleteSearch from "./AutocompleteSearch.svelte"
import schema from "../schema.json"
import pkg from "../package.json"

if (window) {
  const plugin = { Component: AutocompleteSearch, schema, version: pkg.version }
  if (!window["##BUDIBASE_CUSTOM_COMPONENTS##"]) {
    window["##BUDIBASE_CUSTOM_COMPONENTS##"] = []
  }
  window["##BUDIBASE_CUSTOM_COMPONENTS##"].push(plugin)
  if (window.registerCustomComponent) {
    window.registerCustomComponent(plugin)
  }
}

export const Component = AutocompleteSearch
export const version = pkg.version
export { schema }
