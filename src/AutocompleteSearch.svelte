<script>
  // ─────────────────────────────────────────────────────────────────────────────
  // AutocompleteSearch — Budibase plugin v1.0.3
  // ─────────────────────────────────────────────────────────────────────────────
  import { getContext, onMount, onDestroy } from "svelte"

  // ── Budibase runtime context — these are the correct keys ────────────────────
  const { styleable } = getContext("sdk")
  const component     = getContext("component")   // reactive store: $component.styles

  // API lives on the builtin context
  const builtin = getContext("builtin") || {}
  const API     = builtin.API || window?.budibaseAPI || null

  // enrichButtonActions wires event context so {{ Event data.Acct }} resolves
  const enrich  = getContext("sdk")?.enrichButtonActions || null

  // ── Props ────────────────────────────────────────────────────────────────────
  export let queryId       = ""
  export let queryName     = "qry_SearchCustomers"
  export let searchParam   = "search"

  export let placeholder   = "Type at least 3 characters to search…"
  export let displayField  = "BName"
  export let cityField     = "BCity"
  export let stateField    = "BST"
  export let zipField      = "BZip10"

  export let acctField      = "Acct"
  export let bNameField     = "BName"
  export let labCodeField   = "LabCode"
  export let taxCodeField   = "TaxCode"
  export let taxExemptField = "TaxExempt"

  export let minChars       = 3
  export let debounceMs     = 300
  export let showAddNew     = true
  export let addNewLabel    = "Customer not found — Add New"

  export let primaryColor = "#6366f1"
  export let inputBg      = "#ffffff"
  export let dropdownBg   = "#ffffff"
  export let borderColor  = "#e2e8f0"
  export let textColor    = "#1e293b"
  export let mutedColor   = "#64748b"

  export let inputHeight       = 48
  export let borderRadius      = 10
  export let fontSize          = 15
  export let dropdownMaxHeight = 320

  export let onChange         = null
  export let onAddNewCustomer = null

  // ── Internal state ───────────────────────────────────────────────────────────
  let searchText      = ""
  let results         = []
  let loading         = false
  let error           = null
  let showDropdown    = false
  let resolvedQueryId = queryId || ""

  let debounceTimer = null
  let containerEl   = null
  let inputEl       = null

  // ── Derived colours ──────────────────────────────────────────────────────────
  $: rgb         = hexToRgb(primaryColor)
  $: hoverBg     = rgb ? `rgba(${rgb},0.09)` : "rgba(99,102,241,0.09)"
  $: focusRing   = rgb ? `rgba(${rgb},0.22)` : "rgba(99,102,241,0.22)"
  $: addNewBadge = rgb ? `rgba(${rgb},0.13)` : "rgba(99,102,241,0.13)"

  function hexToRgb(hex) {
    if (!hex) return null
    const h = hex.replace("#", "")
    if (h.length !== 6) return null
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
    return [r,g,b].some(isNaN) ? null : `${r},${g},${b}`
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  onMount(async () => {
    if (!resolvedQueryId && queryName) await resolveQueryByName(queryName)
    document.addEventListener("click", handleOutside)
  })

  onDestroy(() => {
    clearTimeout(debounceTimer)
    document.removeEventListener("click", handleOutside)
  })

  function handleOutside(e) {
    if (containerEl && !containerEl.contains(e.target)) showDropdown = false
  }

  // ── Query resolution — two strategies ────────────────────────────────────────
  async function resolveQueryByName(name) {
    // Strategy 1: direct REST call (same origin, session cookie)
    try {
      const resp = await fetch("/api/queries", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (resp.ok) {
        const payload = await resp.json()
        const arr = Array.isArray(payload) ? payload : (payload?.rows ?? payload?.data ?? [])
        const hit = arr.find(q => q.name === name)
        if (hit?._id) { resolvedQueryId = hit._id; return }
      }
    } catch(e) {
      console.warn("[ACS] REST resolve failed:", e)
    }
    // Strategy 2: bbui API (if available)
    if (API) {
      try {
        const fetcher = API.fetchQueryDefinitions ?? API.fetchQueries ?? API.getQueries
        if (fetcher) {
          const list = await fetcher.call(API)
          const arr  = Array.isArray(list) ? list : (list?.rows ?? list?.data ?? [])
          const hit  = arr.find(q => q.name === name)
          if (hit?._id) resolvedQueryId = hit._id
        }
      } catch(e) { console.warn("[ACS] API resolve failed:", e) }
    }
  }

  // ── Input handling ───────────────────────────────────────────────────────────
  function handleInput(e) {
    searchText = e.target.value
    clearTimeout(debounceTimer)
    if (searchText.length < minChars) {
      results      = []
      error        = null
      showDropdown = showAddNew && searchText.length > 0
      return
    }
    showDropdown = true
    loading      = true
    debounceTimer = setTimeout(performSearch, debounceMs)
  }

  async function performSearch() {
    if (!resolvedQueryId) {
      if (queryName) await resolveQueryByName(queryName)
      if (!resolvedQueryId) {
        error   = `Query "${queryName}" not found. Paste the Query ID into settings.`
        loading = false
        return
      }
    }
    loading = true
    error   = null
    try {
      const resp = await fetch(`/api/queries/${resolvedQueryId}`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ parameters: { [searchParam]: searchText } }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      results = unwrapRows(await resp.json())
    } catch(e) {
      console.error("[ACS] Search failed:", e)
      error   = "Search failed — please try again."
      results = []
    } finally {
      loading = false
    }
  }

  function unwrapRows(p) {
    return Array.isArray(p) ? p : (p?.data ?? p?.rows ?? [])
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  async function selectResult(result) {
    searchText   = result[displayField] ?? ""
    showDropdown = false
    results      = []
    error        = null
    const ctx = {
      Acct:      result[acctField]      ?? null,
      BName:     result[bNameField]     ?? "",
      LabCode:   result[labCodeField]   ?? "",
      TaxCode:   result[taxCodeField]   ?? "",
      TaxExempt: Boolean(result[taxExemptField]),
    }
    await fireEvent(onChange, ctx)
  }

  async function handleAddNew() {
    showDropdown = false; results = []; searchText = ""; error = null
    await fireEvent(onAddNewCustomer, {})
  }

  async function fireEvent(handler, ctx) {
    if (!handler) return
    try {
      if (typeof enrich === "function") { await enrich(handler, ctx)?.() }
      else if (typeof handler === "function") { await handler(ctx) }
    } catch(e) { console.error("[ACS] Event error:", e) }
  }

  // ── Keyboard / focus ─────────────────────────────────────────────────────────
  function handleKeydown(e) {
    if (e.key === "Escape") { showDropdown = false; inputEl?.blur() }
  }
  function handleFocus() {
    if (searchText.length >= minChars && (results.length > 0 || showAddNew)) showDropdown = true
    else if (showAddNew && searchText.length > 0) showDropdown = true
  }
  function clearInput() {
    searchText = ""; results = []; showDropdown = false; error = null
    clearTimeout(debounceTimer); inputEl?.focus()
  }
</script>

<!-- ─────────────────────────────────────────────────────────────────────────── -->
<div
  class="acs"
  bind:this={containerEl}
  use:styleable={$component.styles}
  style="
    --p:   {primaryColor};
    --hbg: {hoverBg};
    --fr:  {focusRing};
    --anb: {addNewBadge};
    --ibg: {inputBg};
    --dbg: {dropdownBg};
    --bor: {borderColor};
    --txt: {textColor};
    --mut: {mutedColor};
    --rad: {borderRadius}px;
    --fnt: {fontSize}px;
    --inh: {inputHeight}px;
    --dmh: {dropdownMaxHeight}px;
  "
>

  <!-- Input row -->
  <div class="acs__wrap" class:open={showDropdown}>
    <span class="acs__icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </span>

    <input
      bind:this={inputEl}
      class="acs__input"
      type="text"
      value={searchText}
      {placeholder}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      on:input={handleInput}
      on:focus={handleFocus}
      on:keydown={handleKeydown}
    />

    {#if loading}
      <span class="acs__spin-wrap"><span class="acs__spin"></span></span>
    {:else if searchText}
      <button class="acs__clear" type="button" aria-label="Clear" on:click|stopPropagation={clearInput}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Dropdown -->
  {#if showDropdown}
    <div class="acs__drop" role="listbox">

      {#if error}
        <div class="acs__msg acs__msg--err" role="alert">{error}</div>

      {:else if loading}
        <div class="acs__msg">
          <span class="acs__dots"><span></span><span></span><span></span></span>
          Searching…
        </div>

      {:else if results.length === 0 && searchText.length >= minChars}
        <div class="acs__msg">No results for "<strong>{searchText}</strong>"</div>

      {:else}
        {#each results as result (result[acctField] ?? result[bNameField])}
          <button class="acs__row" type="button"
            on:click={() => selectResult(result)}
            on:keydown={e => e.key === "Enter" && selectResult(result)}>
            <span class="acs__name">{result[displayField] ?? "—"}</span>
            <span class="acs__addr">
              {[result[cityField], result[stateField], result[zipField]].filter(Boolean).join(" · ")}
            </span>
          </button>
        {/each}
      {/if}

      {#if showAddNew}
        <button class="acs__new" type="button"
          on:click={handleAddNew}
          on:keydown={e => e.key === "Enter" && handleAddNew()}>
          <span class="acs__plus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </span>
          {addNewLabel}
        </button>
      {/if}

    </div>
  {/if}

</div>

<style>
  .acs{position:relative;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:var(--fnt,15px);color:var(--txt,#1e293b);box-sizing:border-box}
  .acs *,.acs *::before,.acs *::after{box-sizing:inherit}

  .acs__wrap{display:flex;align-items:center;height:var(--inh,48px);background:var(--ibg,#fff);border:1.5px solid var(--bor,#e2e8f0);border-radius:var(--rad,10px);transition:border-color .15s,box-shadow .15s;overflow:hidden}
  .acs__wrap:focus-within,.acs__wrap.open{border-color:var(--p,#6366f1);box-shadow:0 0 0 3px var(--fr,rgba(99,102,241,.22))}

  .acs__icon{display:flex;align-items:center;flex-shrink:0;padding:0 8px 0 14px;color:var(--mut,#64748b);pointer-events:none;transition:color .15s}
  .acs__wrap:focus-within .acs__icon{color:var(--p,#6366f1)}

  .acs__input{flex:1;min-width:0;height:100%;padding:0 4px;border:none;outline:none;background:transparent;font-size:inherit;font-family:inherit;color:inherit;-webkit-appearance:none;appearance:none}
  .acs__input::placeholder{color:var(--mut,#64748b);opacity:.7}

  .acs__clear{display:flex;align-items:center;justify-content:center;flex-shrink:0;min-width:40px;min-height:40px;margin:4px;padding:0;background:transparent;border:none;border-radius:7px;cursor:pointer;color:var(--mut,#64748b);transition:color .12s,background .12s;-webkit-tap-highlight-color:transparent}
  .acs__clear:hover{color:var(--txt,#1e293b);background:rgba(0,0,0,.06)}

  .acs__spin-wrap{display:flex;align-items:center;padding:0 14px 0 6px;flex-shrink:0}
  .acs__spin{display:block;width:17px;height:17px;border:2px solid var(--bor,#e2e8f0);border-top-color:var(--p,#6366f1);border-radius:50%;animation:spin .5s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}

  .acs__drop{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:9999;max-height:var(--dmh,320px);overflow-y:auto;overflow-x:hidden;background:var(--dbg,#fff);border:1.5px solid var(--bor,#e2e8f0);border-radius:var(--rad,10px);box-shadow:0 4px 6px -1px rgba(0,0,0,.07),0 12px 36px -4px rgba(0,0,0,.14);animation:drop .14s cubic-bezier(.16,1,.3,1);-webkit-overflow-scrolling:touch}
  @keyframes drop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
  .acs__drop::-webkit-scrollbar{width:4px}
  .acs__drop::-webkit-scrollbar-track{background:transparent}
  .acs__drop::-webkit-scrollbar-thumb{background:var(--bor,#e2e8f0);border-radius:2px}

  .acs__row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;min-height:56px;padding:10px 16px;background:transparent;border:none;border-bottom:1px solid rgba(0,0,0,.045);cursor:pointer;text-align:left;font-family:inherit;transition:background .1s;-webkit-tap-highlight-color:transparent}
  .acs__row:last-of-type{border-bottom:none}
  .acs__row:hover,.acs__row:focus-visible{background:var(--hbg,rgba(99,102,241,.09));outline:none}

  .acs__name{font-size:var(--fnt,15px);font-weight:600;color:var(--txt,#1e293b);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .acs__addr{font-size:calc(var(--fnt,15px) - 2px);color:var(--mut,#64748b);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}

  .acs__msg{display:flex;align-items:center;gap:10px;padding:14px 16px;min-height:48px;color:var(--mut,#64748b);font-size:calc(var(--fnt,15px) - 1px)}
  .acs__msg--err{color:#dc2626}

  .acs__dots{display:inline-flex;align-items:center;gap:4px}
  .acs__dots span{display:block;width:5px;height:5px;border-radius:50%;background:var(--mut,#64748b);animation:pulse 1.1s ease-in-out infinite}
  .acs__dots span:nth-child(2){animation-delay:.18s}
  .acs__dots span:nth-child(3){animation-delay:.36s}
  @keyframes pulse{0%,60%,100%{transform:scale(1);opacity:.35}30%{transform:scale(1.4);opacity:1}}

  .acs__new{display:flex;align-items:center;gap:11px;width:100%;min-height:52px;padding:12px 16px;background:transparent;border:none;border-top:1.5px solid var(--bor,#e2e8f0);cursor:pointer;font-family:inherit;font-size:calc(var(--fnt,15px) - .5px);font-weight:600;color:var(--p,#6366f1);text-align:left;transition:background .1s;-webkit-tap-highlight-color:transparent}
  .acs__new:hover{background:var(--hbg,rgba(99,102,241,.09))}

  .acs__plus{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:26px;height:26px;border-radius:50%;background:var(--anb,rgba(99,102,241,.13))}
</style>
