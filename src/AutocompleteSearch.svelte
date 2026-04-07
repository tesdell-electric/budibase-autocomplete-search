<script>
  // ─────────────────────────────────────────────────────────────────────────────
  // AutocompleteSearch — Budibase custom component plugin
  //
  // Calls a named Budibase query directly (no premium data provider needed).
  // Mobile-first: 44 px minimum tap targets, debounced input, loading/error states.
  // Emits: onChange({ Acct, BName, LabCode, TaxCode, TaxExempt })
  //        onAddNewCustomer() — no payload, parent handles navigation
  // ─────────────────────────────────────────────────────────────────────────────

  import { getContext, onMount, onDestroy } from "svelte"

  // ── Budibase runtime context ─────────────────────────────────────────────────
  const bbui = getContext("bbui")
  const styleable = bbui?.styleable || (() => ({ destroy() {} }))
  const API       = bbui?.API
  // enrichButtonActions lets us pass event context so bindings like
  // {{ Event data.Acct }} work in Budibase action chains.
  const enrich    = bbui?.enrichButtonActions

  // ── Props (all declared in schema.json) ─────────────────────────────────────

  // Data
  export let queryId    = ""
  export let queryName  = "qry_SearchCustomers"
  export let searchParam = "search"

  // Display fields
  export let placeholder  = "Search customers…"
  export let displayField = "BName"
  export let cityField    = "BCity"
  export let stateField   = "BST"
  export let zipField     = "BZip10"

  // Output field mapping
  export let acctField      = "Acct"
  export let bNameField     = "BName"
  export let labCodeField   = "LabCode"
  export let taxCodeField   = "TaxCode"
  export let taxExemptField = "TaxExempt"

  // Behavior
  export let minChars       = 3
  export let debounceMs     = 300
  export let showAddNew     = true
  export let addNewLabel    = "Customer not found — Add New"

  // Colours
  export let primaryColor = "#6366f1"
  export let inputBg      = "#ffffff"
  export let dropdownBg   = "#ffffff"
  export let borderColor  = "#e2e8f0"
  export let textColor    = "#1e293b"
  export let mutedColor   = "#64748b"

  // Sizing
  export let inputHeight       = 48
  export let borderRadius      = 10
  export let fontSize          = 15
  export let dropdownMaxHeight = 320

  // Events (Budibase passes action arrays; we enrich+execute them)
  export let onChange          = null
  export let onAddNewCustomer  = null

  // Budibase injects this; pass it to use:styleable so the design tab works
  export let styles

  // ── Internal state ───────────────────────────────────────────────────────────
  let searchText      = ""
  let results         = []
  let loading         = false
  let error           = null
  let showDropdown    = false
  let resolvedQueryId = queryId || ""
  let debounceTimer   = null
  let containerEl     = null
  let inputEl         = null

  // ── Derived colours (compute RGBA values JS-side for broad browser support) ──
  $: primaryRgb  = hexToRgb(primaryColor)
  $: hoverBg     = primaryRgb
    ? `rgba(${primaryRgb}, 0.09)`
    : "rgba(99,102,241,0.09)"
  $: focusRing   = primaryRgb
    ? `rgba(${primaryRgb}, 0.22)`
    : "rgba(99,102,241,0.22)"
  $: addNewBadge = primaryRgb
    ? `rgba(${primaryRgb}, 0.13)`
    : "rgba(99,102,241,0.13)"

  function hexToRgb(hex) {
    if (!hex || typeof hex !== "string") return null
    const h = hex.replace("#", "")
    if (h.length !== 6) return null
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if ([r, g, b].some(isNaN)) return null
    return `${r},${g},${b}`
  }

  // ── Resolve query ID by name ─────────────────────────────────────────────────
  onMount(async () => {
    if (!resolvedQueryId && queryName) {
      await resolveQueryByName(queryName)
    }
  })

  async function resolveQueryByName(name) {
    // Strategy 1 — bbui API (preferred, handles auth automatically)
    if (API) {
      const fetcher =
        API.fetchQueryDefinitions ??
        API.fetchQueries ??
        API.getQueries ??
        null
      if (fetcher) {
        try {
          const list = await fetcher.call(API)
          const arr  = Array.isArray(list)
            ? list
            : (list?.rows ?? list?.data ?? [])
          const hit  = arr.find(q => q.name === name)
          if (hit?._id) { resolvedQueryId = hit._id; return }
        } catch { /* fall through */ }
      }
    }

    // Strategy 2 — direct fetch to Budibase internal REST API
    // Works because the plugin runs at the same origin with the same session cookie.
    try {
      const resp = await fetch("/api/queries", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      if (resp.ok) {
        const payload = await resp.json()
        const arr = Array.isArray(payload)
          ? payload
          : (payload?.rows ?? payload?.data ?? [])
        const hit = arr.find(q => q.name === name)
        if (hit?._id) resolvedQueryId = hit._id
      }
    } catch (err) {
      console.warn("[AutocompleteSearch] Could not resolve query by name:", err)
    }
  }

  // ── Input handler ────────────────────────────────────────────────────────────
  function handleInput(e) {
    searchText = e.target.value
    clearTimeout(debounceTimer)

    if (searchText.length < minChars) {
      results   = []
      error     = null
      // Keep dropdown open for the "Add New" pin if text > 0
      showDropdown = showAddNew && searchText.length > 0
      return
    }

    showDropdown = true
    loading      = true      // optimistic — spinner appears immediately
    debounceTimer = setTimeout(performSearch, debounceMs)
  }

  // ── Query execution ──────────────────────────────────────────────────────────
  async function performSearch() {
    if (!resolvedQueryId) {
      // Last chance: try to resolve again before giving up
      if (queryName) await resolveQueryByName(queryName)
      if (!resolvedQueryId) {
        error   = `Query "${queryName}" not found. Check the Query ID / Query Name setting.`
        loading = false
        return
      }
    }

    loading = true
    error   = null

    try {
      let rows = []

      // Strategy 1 — bbui API
      if (API?.executeQuery) {
        const result = await API.executeQuery({
          queryId:    resolvedQueryId,
          parameters: { [searchParam]: searchText },
        })
        rows = unwrapRows(result)
      } else {
        // Strategy 2 — direct fetch
        const resp = await fetch(`/api/queries/${resolvedQueryId}`, {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({ parameters: { [searchParam]: searchText } }),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
        rows = unwrapRows(await resp.json())
      }

      results = rows
    } catch (err) {
      console.error("[AutocompleteSearch] Search error:", err)
      error   = "Search failed — please try again."
      results = []
    } finally {
      loading = false
    }
  }

  function unwrapRows(payload) {
    if (Array.isArray(payload)) return payload
    // Budibase SQL query responses wrap rows in { data: [...] }
    return payload?.data ?? payload?.rows ?? []
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  async function selectResult(result) {
    searchText   = result[displayField] ?? ""
    showDropdown = false
    results      = []
    error        = null

    await fireEvent(onChange, {
      Acct:      result[acctField]      ?? null,
      BName:     result[bNameField]     ?? "",
      LabCode:   result[labCodeField]   ?? "",
      TaxCode:   result[taxCodeField]   ?? "",
      TaxExempt: Boolean(result[taxExemptField]),
    })
  }

  async function handleAddNew() {
    showDropdown = false
    results      = []
    searchText   = ""
    error        = null
    await fireEvent(onAddNewCustomer, {})
  }

  // ── Event firing ─────────────────────────────────────────────────────────────
  // enrichButtonActions is the Budibase mechanism that injects event context into
  // action chains so bindings like {{ Event data.Acct }} resolve correctly.
  async function fireEvent(handler, ctx) {
    if (!handler) return
    try {
      if (typeof enrich === "function") {
        const fn = enrich(handler, ctx)
        await fn?.()
      } else if (typeof handler === "function") {
        // Some Budibase versions pre-enrich the prop into a plain async function
        await handler(ctx)
      }
    } catch (err) {
      console.error("[AutocompleteSearch] Event handler error:", err)
    }
  }

  // ── Keyboard / focus helpers ─────────────────────────────────────────────────
  function handleKeydown(e) {
    if (e.key === "Escape") {
      showDropdown = false
      inputEl?.blur()
    }
  }

  function handleFocus() {
    if (searchText.length >= minChars && (results.length > 0 || showAddNew)) {
      showDropdown = true
    } else if (showAddNew && searchText.length > 0) {
      showDropdown = true
    }
  }

  function clearInput() {
    searchText   = ""
    results      = []
    showDropdown = false
    error        = null
    clearTimeout(debounceTimer)
    inputEl?.focus()
  }

  function handleClickOutside(e) {
    if (containerEl && !containerEl.contains(e.target)) {
      showDropdown = false
    }
  }

  onDestroy(() => clearTimeout(debounceTimer))
</script>

<!-- ─────────────────────────────────────────────────────────────────────────── -->
<svelte:window on:click={handleClickOutside} />

<div
  class="acs"
  bind:this={containerEl}
  use:styleable={styles}
  style="
    --acs-primary:    {primaryColor};
    --acs-hover-bg:   {hoverBg};
    --acs-focus-ring: {focusRing};
    --acs-badge-bg:   {addNewBadge};
    --acs-input-bg:   {inputBg};
    --acs-drop-bg:    {dropdownBg};
    --acs-border:     {borderColor};
    --acs-text:       {textColor};
    --acs-muted:      {mutedColor};
    --acs-radius:     {borderRadius}px;
    --acs-font:       {fontSize}px;
    --acs-input-h:    {inputHeight}px;
    --acs-drop-max-h: {dropdownMaxHeight}px;
  "
>

  <!-- ── Input row ─────────────────────────────────────────────────────────── -->
  <div class="acs__input-wrap" class:acs__input-wrap--open={showDropdown}>

    <span class="acs__icon-search" aria-hidden="true">
      <!-- Heroicons magnifying glass -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </span>

    <input
      bind:this={inputEl}
      class="acs__input"
      type="text"
      value={searchText}
      placeholder={placeholder}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      aria-label={placeholder}
      aria-autocomplete="list"
      aria-expanded={showDropdown}
      aria-haspopup="listbox"
      on:input={handleInput}
      on:focus={handleFocus}
      on:keydown={handleKeydown}
    />

    {#if loading}
      <span class="acs__spinner-wrap" aria-label="Searching…">
        <span class="acs__spinner" />
      </span>
    {:else if searchText}
      <button
        class="acs__clear"
        type="button"
        tabindex="0"
        aria-label="Clear"
        on:click|stopPropagation={clearInput}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
          <line x1="18" y1="6"  x2="6"  y2="18"/>
          <line x1="6"  y1="6"  x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- ── Dropdown ──────────────────────────────────────────────────────────── -->
  {#if showDropdown}
    <div class="acs__drop" role="listbox" aria-label="Search results">

      <!-- Error -->
      {#if error}
        <div class="acs__state acs__state--error" role="alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="13"/>
            <circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none"/>
          </svg>
          {error}
        </div>

      <!-- Loading indicator inside the dropdown (first paint) -->
      {:else if loading}
        <div class="acs__state">
          <span class="acs__dots" aria-hidden="true">
            <span/><span/><span/>
          </span>
          Searching…
        </div>

      <!-- No results -->
      {:else if results.length === 0 && searchText.length >= minChars}
        <div class="acs__state">
          No results for "<strong>{searchText}</strong>"
        </div>

      <!-- Results list -->
      {:else}
        {#each results as result}
          <button
            class="acs__result"
            type="button"
            role="option"
            on:click={() => selectResult(result)}
            on:keydown={e => e.key === "Enter" && selectResult(result)}
          >
            <span class="acs__result-primary">
              {result[displayField] ?? "—"}
            </span>
            <span class="acs__result-secondary">
              {[result[cityField], result[stateField], result[zipField]]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        {/each}
      {/if}

      <!-- "Add New" — always pinned at the bottom -->
      {#if showAddNew}
        <button
          class="acs__add-new"
          type="button"
          on:click={handleAddNew}
          on:keydown={e => e.key === "Enter" && handleAddNew()}
        >
          <span class="acs__add-new-badge" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </span>
          {addNewLabel}
        </button>
      {/if}

    </div>
  {/if}

</div>

<!-- ─────────────────────────────────────────────────────────────────────────── -->
<style>
  /* ── Reset / container ─────────────────────────────────────────── */
  .acs {
    position:    relative;
    width:       100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 Helvetica, Arial, sans-serif;
    font-size:   var(--acs-font, 15px);
    color:       var(--acs-text, #1e293b);
    box-sizing:  border-box;
  }
  .acs *, .acs *::before, .acs *::after {
    box-sizing: inherit;
  }

  /* ── Input wrapper ─────────────────────────────────────────────── */
  .acs__input-wrap {
    position:      relative;
    display:       flex;
    align-items:   center;
    height:        var(--acs-input-h, 48px);
    background:    var(--acs-input-bg, #fff);
    border:        1.5px solid var(--acs-border, #e2e8f0);
    border-radius: var(--acs-radius, 10px);
    transition:    border-color 0.15s ease, box-shadow 0.15s ease;
    overflow:      hidden;
  }
  .acs__input-wrap:focus-within,
  .acs__input-wrap--open {
    border-color: var(--acs-primary, #6366f1);
    box-shadow:   0 0 0 3px var(--acs-focus-ring, rgba(99,102,241,.22));
  }

  /* ── Search icon ───────────────────────────────────────────────── */
  .acs__icon-search {
    display:        flex;
    align-items:    center;
    flex-shrink:    0;
    padding:        0 8px 0 14px;
    color:          var(--acs-muted, #64748b);
    pointer-events: none;
    transition:     color 0.15s;
  }
  .acs__input-wrap:focus-within .acs__icon-search {
    color: var(--acs-primary, #6366f1);
  }

  /* ── Text input ────────────────────────────────────────────────── */
  .acs__input {
    flex:             1;
    min-width:        0;
    height:           100%;
    padding:          0 4px;
    border:           none;
    outline:          none;
    background:       transparent;
    font-size:        inherit;
    font-family:      inherit;
    color:            inherit;
    -webkit-appearance: none;
  }
  .acs__input::placeholder {
    color:   var(--acs-muted, #64748b);
    opacity: 0.65;
  }

  /* ── Clear button ──────────────────────────────────────────────── */
  .acs__clear {
    display:         flex;
    align-items:     center;
    justify-content: center;
    flex-shrink:     0;
    /* 44 px touch target */
    min-width:  40px;
    min-height: 40px;
    margin:     4px;
    padding:    0;
    background: transparent;
    border:     none;
    border-radius: 7px;
    cursor:     pointer;
    color:      var(--acs-muted, #64748b);
    transition: color 0.12s, background 0.12s;
    -webkit-tap-highlight-color: transparent;
  }
  .acs__clear:hover,
  .acs__clear:focus-visible {
    color:      var(--acs-text, #1e293b);
    background: rgba(0,0,0,.06);
    outline:    none;
  }

  /* ── Spinner ───────────────────────────────────────────────────── */
  .acs__spinner-wrap {
    display:  flex;
    align-items: center;
    padding:  0 14px 0 6px;
    flex-shrink: 0;
  }
  .acs__spinner {
    display:      block;
    width:        17px;
    height:       17px;
    border:       2px solid var(--acs-border, #e2e8f0);
    border-top-color: var(--acs-primary, #6366f1);
    border-radius: 50%;
    animation:    acs-spin 0.5s linear infinite;
  }
  @keyframes acs-spin { to { transform: rotate(360deg); } }

  /* ── Dropdown ──────────────────────────────────────────────────── */
  .acs__drop {
    position:      absolute;
    top:           calc(100% + 6px);
    left:          0;
    right:         0;
    max-height:    var(--acs-drop-max-h, 320px);
    overflow-y:    auto;
    background:    var(--acs-drop-bg, #fff);
    border:        1.5px solid var(--acs-border, #e2e8f0);
    border-radius: var(--acs-radius, 10px);
    box-shadow:
      0 4px 6px  -1px rgba(0,0,0,.07),
      0 12px 36px -4px rgba(0,0,0,.13);
    overflow-x: hidden;
    z-index:    9999;
    animation:  acs-drop 0.14s cubic-bezier(0.16, 1, 0.3, 1);
    /* Momentum scrolling on iOS */
    -webkit-overflow-scrolling: touch;
  }
  @keyframes acs-drop {
    from { opacity: 0; transform: translateY(-6px) scale(.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1);   }
  }

  /* Subtle scrollbar */
  .acs__drop::-webkit-scrollbar       { width: 4px; }
  .acs__drop::-webkit-scrollbar-track { background: transparent; }
  .acs__drop::-webkit-scrollbar-thumb {
    background:    var(--acs-border, #e2e8f0);
    border-radius: 2px;
  }

  /* ── Result item ───────────────────────────────────────────────── */
  .acs__result {
    display:         flex;
    flex-direction:  column;
    justify-content: center;
    align-items:     flex-start;
    gap:             3px;
    width:           100%;
    min-height:      56px;          /* > 44 px tap target */
    padding:         10px 16px;
    background:      transparent;
    border:          none;
    border-bottom:   1px solid rgba(0,0,0,.045);
    cursor:          pointer;
    text-align:      left;
    font-family:     inherit;
    transition:      background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .acs__result:last-of-type { border-bottom: none; }
  .acs__result:hover,
  .acs__result:focus-visible {
    background: var(--acs-hover-bg, rgba(99,102,241,.09));
    outline:    none;
  }
  .acs__result:active {
    background: var(--acs-hover-bg, rgba(99,102,241,.09));
    opacity:    0.8;
  }

  .acs__result-primary {
    font-size:      var(--acs-font, 15px);
    font-weight:    600;
    color:          var(--acs-text, #1e293b);
    line-height:    1.35;
    white-space:    nowrap;
    overflow:       hidden;
    text-overflow:  ellipsis;
    max-width:      100%;
  }
  .acs__result-secondary {
    font-size:     calc(var(--acs-font, 15px) - 2px);
    color:         var(--acs-muted, #64748b);
    line-height:   1.3;
    white-space:   nowrap;
    overflow:      hidden;
    text-overflow: ellipsis;
    max-width:     100%;
  }

  /* ── State messages (loading / empty / error) ──────────────────── */
  .acs__state {
    display:     flex;
    align-items: center;
    gap:         10px;
    padding:     14px 16px;
    min-height:  48px;
    color:       var(--acs-muted, #64748b);
    font-size:   calc(var(--acs-font, 15px) - 1px);
  }
  .acs__state--error {
    color: #dc2626;
  }

  /* Dot-pulse loader */
  .acs__dots {
    display:     inline-flex;
    align-items: center;
    gap:         4px;
    flex-shrink: 0;
  }
  .acs__dots span {
    display:       block;
    width:         5px;
    height:        5px;
    border-radius: 50%;
    background:    var(--acs-muted, #64748b);
    animation:     acs-pulse 1.1s ease-in-out infinite;
  }
  .acs__dots span:nth-child(2) { animation-delay: 0.18s; }
  .acs__dots span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes acs-pulse {
    0%, 60%, 100% { transform: scale(1);   opacity: .35; }
    30%            { transform: scale(1.4); opacity: 1;   }
  }

  /* ── "Add New" row — always pinned at bottom ───────────────────── */
  .acs__add-new {
    display:         flex;
    align-items:     center;
    gap:             11px;
    width:           100%;
    min-height:      52px;
    padding:         12px 16px;
    background:      transparent;
    border:          none;
    border-top:      1.5px solid var(--acs-border, #e2e8f0);
    cursor:          pointer;
    font-family:     inherit;
    font-size:       calc(var(--acs-font, 15px) - 0.5px);
    font-weight:     600;
    color:           var(--acs-primary, #6366f1);
    text-align:      left;
    letter-spacing:  0.01em;
    transition:      background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .acs__add-new:hover,
  .acs__add-new:focus-visible {
    background: var(--acs-hover-bg, rgba(99,102,241,.09));
    outline:    none;
  }
  .acs__add-new:active { opacity: .75; }

  .acs__add-new-badge {
    display:         flex;
    align-items:     center;
    justify-content: center;
    width:           26px;
    height:          26px;
    border-radius:   50%;
    background:      var(--acs-badge-bg, rgba(99,102,241,.13));
    flex-shrink:     0;
  }
</style>
