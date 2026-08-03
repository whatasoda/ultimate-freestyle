export const DASHBOARD_DESIGN_STYLE = String.raw`
  :root:has(.account) {
    color-scheme: light;
    --bg: #f7f8f5;
    --ink: #17283d;
    --muted: #667587;
    --line: #d8e1e7;
    --line-strong: #b9c8d2;
    --panel: #ffffff;
    --surface-soft: #edf7fc;
    --surface-warm: #fff2e7;
    --surface-subtle: #f1f4f4;
    --field: #ffffff;
    --accent: #2389c9;
    --accent-strong: #126da5;
    --accent-soft: #dff2fc;
    --accent-ink: #ffffff;
    --warm: #e88b4c;
    --warm-soft: #ffeadb;
    --success: #237f6b;
    --success-soft: #ddf4ed;
    --warning: #9a6818;
    --warning-soft: #fff0ca;
    --danger: #b94d58;
    --danger-soft: #ffe5e7;
    --shadow: 0 .8rem 2.2rem #29455b12;
    --floating-shadow: 0 1rem 3rem #17283d26;
  }

  @media (prefers-color-scheme: dark) {
    :root:has(.account):not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #101a26;
      --ink: #edf5fb;
      --muted: #a3b2c0;
      --line: #314457;
      --line-strong: #50667a;
      --panel: #172534;
      --surface-soft: #173044;
      --surface-warm: #35271f;
      --surface-subtle: #1c2b39;
      --field: #101d29;
      --accent: #63b9e8;
      --accent-strong: #8fd3f4;
      --accent-soft: #183c52;
      --accent-ink: #0c2332;
      --warm: #f0a06c;
      --warm-soft: #442d20;
      --success: #69c7ad;
      --success-soft: #173b32;
      --warning: #efc066;
      --warning-soft: #3d3018;
      --danger: #f08a93;
      --danger-soft: #442229;
      --shadow: 0 .8rem 2.2rem #00000024;
      --floating-shadow: 0 1rem 3rem #00000066;
    }
  }

  :root:has(.account)[data-theme="dark"] {
    color-scheme: dark;
    --bg: #101a26;
    --ink: #edf5fb;
    --muted: #a3b2c0;
    --line: #314457;
    --line-strong: #50667a;
    --panel: #172534;
    --surface-soft: #173044;
    --surface-warm: #35271f;
    --surface-subtle: #1c2b39;
    --field: #101d29;
    --accent: #63b9e8;
    --accent-strong: #8fd3f4;
    --accent-soft: #183c52;
    --accent-ink: #0c2332;
    --warm: #f0a06c;
    --warm-soft: #442d20;
    --success: #69c7ad;
    --success-soft: #173b32;
    --warning: #efc066;
    --warning-soft: #3d3018;
    --danger: #f08a93;
    --danger-soft: #442229;
    --shadow: 0 .8rem 2.2rem #00000024;
    --floating-shadow: 0 1rem 3rem #00000066;
  }

  :root:has(.account)[data-theme="light"] { color-scheme: light; }
  body { background: var(--bg); color: var(--ink); }
  body:has(.account) main:not(.workspace-main):not(.voice-main) { padding-top: clamp(1.75rem, 4vw, 3.5rem); }
  .site-header { padding-block: 1rem; border-bottom: 1px solid var(--line); }
  .brand { color: var(--ink); font-family: ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif; }
  h1, h2, h3, summary, .button, button { text-wrap: balance; }
  h1, h2, h3 { font-family: ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif; }
  .eyebrow { color: var(--accent-strong); }
  .lead, .panel p, .panel li, .back, .meta, .hint { color: var(--muted); }
  .button, button { border: 1px solid transparent; background: var(--accent); color: var(--accent-ink); }
  .button:hover, button:hover { background: var(--accent-strong); }
  .button:disabled, button:disabled { opacity: .5; cursor: not-allowed; }
  .ghost { border-color: var(--line-strong); background: transparent; color: var(--ink); }
  .ghost:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .danger, .actions .danger, .slide-actions .danger { border-color: var(--danger); background: transparent; color: var(--danger); }
  .danger:hover { background: var(--danger-soft); color: var(--danger); }
  :where(a, button, input, textarea, select, summary):focus-visible { outline-color: var(--accent); }
  input, textarea, select, .editor input, .editor textarea, .editor select,
  .dashboard-search input, .dashboard-sort select, .review-composer textarea,
  .review-script textarea, .narration-outline textarea, .filmstrip-search input {
    border-color: var(--line-strong);
    background: var(--field);
    color: var(--ink);
  }
  input::placeholder, textarea::placeholder { color: var(--muted); opacity: .8; }
  .dashboard-search, .editor label, .upload label, .asset-alt label, .review-composer label { color: var(--ink); }
  .theme-toggle { gap: .45rem; min-height: 2.35rem; padding: .42rem .65rem; font-size: .78rem; }
  .theme-toggle-icon { display: grid; place-items: center; width: 1.15rem; height: 1.15rem; color: var(--accent-strong); font-size: 1rem; }

  .panel, .empty, .inspector-section { border-color: var(--line); background: var(--panel); box-shadow: none; }
  .panel { border-radius: .8rem; }
  .section-head { align-items: center; }
  .stage { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .hint, .mode-note, .guide-note { border-color: var(--accent); background: var(--surface-soft); color: var(--ink); }
  .connection-guide, .workspace-guide { border-color: var(--line); background: var(--panel); }
  .connection-guide > summary, .workspace-guide > summary { color: var(--ink); }
  .connection-body, .disclosure-body, .inspector-body { background: transparent; }
  .setup-steps li, .workspace-guide-body p { border-color: var(--line); background: var(--surface-subtle); color: var(--ink); }
  .endpoint-box, .copy-box, .upload { border-color: var(--line-strong); background: var(--surface-subtle); }
  .endpoint-box code, .official-links a, .component-outline code { color: var(--accent-strong); }

  .grid { display: grid; grid-template-columns: 1fr; gap: 0; border-block: 1px solid var(--line); }
  .card-link { border-radius: 0; }
  .card-link + .card-link { border-top: 1px solid var(--line); }
  .card { display: grid; grid-template-columns: minmax(10rem, .75fr) minmax(15rem, 1.25fr) auto; gap: .45rem 1.25rem; align-items: center; min-height: 0; padding: 1rem .35rem; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .card-link:hover .card { border-color: transparent; background: var(--surface-soft); transform: none; }
  .card-top { grid-column: 1; grid-row: 1 / span 2; justify-content: flex-start; flex-wrap: wrap; }
  .card h2 { grid-column: 2; margin: 0; font-size: 1.08rem; }
  .card > .meta { grid-column: 2; }
  .card > .meta:last-child { grid-column: 3; grid-row: 1; white-space: nowrap; }
  .project-statuses { grid-column: 2 / -1; margin-top: .2rem; }
  .project-attention { grid-column: 2 / -1; margin: .15rem 0 0; color: var(--warning); }
  .project-status { border-color: var(--line-strong); color: var(--muted); }
  .project-status[data-state="ready"] { border-color: var(--success); background: var(--success-soft); color: var(--success); }
  .project-status[data-state="attention"] { border-color: var(--warning); background: var(--warning-soft); color: var(--warning); }
  .dashboard-filter button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .search-empty { border-color: var(--line-strong); }
  .danger-zone { border-color: var(--danger); background: var(--danger-soft); }
  .danger-zone > summary { color: var(--danger); }
  .danger-zone > p, .danger-zone label { color: var(--ink); }
  .danger-zone input { border-color: var(--danger); background: var(--field); color: var(--ink); }
  .danger-zone button.danger { border-color: var(--danger); background: var(--danger); color: #ffffff; }

  .journey { border-color: var(--line); background: var(--surface-soft); box-shadow: none; }
  .journey-step { border-color: var(--line); }
  .journey-step[data-complete="true"], .save-state { border-color: var(--success); background: var(--success-soft); color: var(--success); }
  .journey-next { border-left: .2rem solid var(--warm); background: var(--panel); }
  .save-state[data-state="dirty"], .setting-chip[data-state="warning"] { border-color: var(--warning); background: var(--warning-soft); color: var(--warning); }
  .save-state[data-state="saving"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }

  .project-section-nav, .voice-filter {
    border-color: var(--line);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    box-shadow: var(--shadow);
  }
  .project-section-nav a { color: var(--muted); }
  .project-section-nav a:hover, .project-section-nav a:focus-visible { background: var(--surface-subtle); color: var(--ink); }
  .project-section-nav a[aria-current="location"] { background: var(--accent-soft); color: var(--accent-strong); }
  .stat-list dd[data-warning="true"], .character-count[data-near-limit="true"] { color: var(--warning); }
  .character-count[data-over-limit="true"] { color: var(--danger); }
  .storage-breakdown summary, .storage-breakdown a, .preflight-action { color: var(--accent-strong); }
  .slide-row:hover { background: var(--surface-soft); }
  .slide-quality-warning { border-color: var(--warning); background: var(--warning-soft); color: var(--warning); }
  .quality-sweep-results, .preflight-list, .revision-slide-list { gap: 0; border-block: 1px solid var(--line); }
  .quality-sweep-results li, .preflight-item, .revision-slide-list li {
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    color: var(--ink);
  }
  .quality-sweep-results li:last-child, .preflight-item:last-child, .revision-slide-list li:last-child { border-bottom: 0; }
  .quality-sweep-results a { color: var(--accent-strong); }
  .preflight-item::before { background: var(--success-soft); color: var(--success); }
  .preflight-item[data-state="attention"]::before { background: var(--warning-soft); color: var(--warning); }
  .preflight-item[data-state="recommendation"]::before { background: var(--accent-soft); color: var(--accent-strong); }
  .preflight-action:hover { background: var(--accent-soft); }
  .publication-history .status-row, .draft-revision { border-color: var(--line); background: transparent; }
  .success, .audio-state.ready { color: var(--success) !important; }
  .warning, .audio-state, .voice-timing[data-state="warning"] { color: var(--warning) !important; }
  .feedback { color: var(--accent-strong); }
  .draft-recovery { border-color: var(--warning); background: var(--warning-soft); color: var(--warning); }
  .draft-recovery.conflict { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
  .asset, .upload, .upload-preview, .content-structure { border-color: var(--line); background: var(--surface-subtle); }
  .asset { background: var(--panel); }
  .asset img, .upload-dropzone { border-color: var(--line-strong); background: var(--surface-subtle); }
  .asset-body, .asset-alt { color: var(--ink); }
  .asset-alt { border-color: var(--line); background: transparent; }
  .content-structure span { background: var(--accent-soft); color: var(--accent-strong); }

  .workspace-head { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
  .workspace-version { justify-content: flex-end; max-width: 58rem; }
  .workspace-version > .slide-actions { flex: 1 0 100%; justify-content: flex-end; padding-top: .5rem; border-top: 1px solid var(--line); }
  .workspace-version > .feedback { flex: 1 0 100%; text-align: right; }
  .slide-workspace { gap: .85rem; }
  .filmstrip { border-right: 1px solid var(--line); padding-right: .75rem; }
  .filmstrip-search { background: linear-gradient(var(--bg) 80%, transparent); }
  .filmstrip-link { border-color: transparent; border-radius: .55rem; color: var(--muted); }
  .filmstrip-link:hover { background: var(--surface-subtle); color: var(--ink); }
  .filmstrip-link[data-active="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .workspace-preview { background: var(--surface-subtle); }
  .workspace-frame { border-color: var(--line-strong); box-shadow: var(--shadow); }
  .inspector-section { border-radius: .75rem; }
  .inspector-section > summary { background: var(--panel); }
  .inspector-section[open] > summary { background: var(--surface-soft); }
  .workspace-guide-body p { border: 0; border-left: .15rem solid var(--accent); border-radius: 0; background: transparent; }
  .editor fieldset { padding-inline: 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }
  .editor legend { color: var(--ink); }
  .visual-pick, .design-axis-pick, .font-pick, .ratio-option, .cover-pick, .narration-display-pick,
  .narration-color-pick, .region-pick, .animation-pick, .tone-pick, .loading-style-pick {
    border-color: var(--line);
    background: var(--field);
    color: var(--ink);
  }
  .visual-pick[aria-pressed="true"], .design-axis-pick[aria-pressed="true"], .font-pick[aria-pressed="true"],
  .ratio-option:has(input:checked), .cover-pick[aria-pressed="true"], .narration-display-pick[aria-pressed="true"],
  .narration-color-pick[aria-pressed="true"], .region-pick[aria-pressed="true"], .animation-pick[aria-pressed="true"],
  .tone-pick[aria-pressed="true"], .loading-style-pick[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--ink);
    box-shadow: none;
  }
  .animation-symbol { background: var(--surface-soft); color: var(--accent-strong); }
  .mode-note, .voice-composed { border-color: var(--accent); background: var(--surface-soft); color: var(--ink); }
  .setting-chip { border-color: var(--line); background: var(--surface-subtle); color: var(--ink); }
  .component-outline li { border-color: var(--line); color: var(--ink); }
  a.component-outline-row:hover, a.component-outline-row[aria-current="true"] { background: var(--accent-soft); color: var(--ink); }
  .component-outline .component-outline { border-color: var(--line-strong); }
  .component-outline .component-outline li, .editor .component-item, .voice-segment, .voice-cue { background: transparent; }
  .component-step { border-color: var(--line); background: var(--surface-subtle); color: var(--muted); }
  .narration-outline li { border-color: var(--line); background: transparent; color: var(--ink); }
  .narration-outline li[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); }
  .narration-outline p, .setting-table dd, .component-detail > summary, .voice-cue-head strong, .voice-composed,
  .quality-list { color: var(--ink); }
  .component-item legend { color: var(--accent-strong); }
  .component-detail { border-color: var(--line); }
  .voice-segment, .voice-cue { border-color: var(--line); }
  .voice-segment:target { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
  .voice-howto, .quality-status { border-color: var(--line); background: var(--surface-soft); color: var(--ink); }
  .voice-howto > summary { color: var(--accent-strong); }
  .voice-howto-body { color: var(--ink); }
  .quality-status[data-level="warning"] { border-color: var(--warning); background: var(--warning-soft); color: var(--warning); }

  .voice-preset { border-color: var(--line); background: linear-gradient(135deg, var(--surface-soft), var(--panel)); }
  .voice-preset select, .voice-search { border-color: var(--line-strong); background: var(--field); color: var(--ink); }
  .voice-stat, .job-card, .voice-review { border-color: var(--line); background: var(--panel); }
  .voice-stat { background: var(--surface-subtle); }
  .voice-stat.ready strong { color: var(--success); }
  .voice-stat.pending strong { color: var(--warning); }
  .job-card[data-state="completed"] { border-color: var(--success); }
  .job-card[data-state="failed"], .job-card[data-state="partially_failed"] { border-color: var(--danger); }
  .voice-filter :is(button,.button)[aria-current="page"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .voice-review-body p, .voice-next ol { color: var(--ink); }
  .voice-status { background: var(--surface-subtle); color: var(--muted); }
  .voice-status.ready, .voice-status.completed { background: var(--success-soft); color: var(--success); }
  .voice-status.needs_generation, .voice-status.queued, .voice-status.running, .voice-status.generating { background: var(--warning-soft); color: var(--warning); }
  .voice-status.failed, .voice-status.partially_failed { background: var(--danger-soft); color: var(--danger); }
  .voice-play[aria-pressed="true"] { border-color: var(--success); background: var(--success-soft); color: var(--success); }
  .filmstrip-search output { color: var(--ink); }
  .segment-outline a:hover, .segment-outline a[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .review-count { background: var(--accent-soft); color: var(--accent-strong); }
  .review-count[data-empty="true"] { background: var(--surface-subtle); color: var(--muted); }
  .review-empty { border-color: var(--line-strong); }
  .review-composer[data-active="true"], .upload-dropzone[data-drag-active="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }

  .review-workspace { grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr); gap: 1.25rem; }
  .review-filmstrip { position: sticky; top: .75rem; max-height: calc(100dvh - 1.5rem); overflow: auto; border-right: 1px solid var(--line); padding-right: .75rem; scrollbar-gutter: stable; }
  .review-center { gap: 1.25rem; }
  .review-comments { position: static; display: grid; gap: 1.25rem; max-height: none; overflow: visible; padding: 0; border: 0; background: transparent; }
  .review-source { border-color: var(--line); background: var(--panel); }
  .review-source[data-kind="narration"] { border-color: #d4c2ea; background: #f8f2fc; }
  :root[data-theme="dark"] .review-source[data-kind="narration"] { border-color: #67577a; background: #292236; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .review-source[data-kind="narration"] { border-color: #67577a; background: #292236; } }
  .review-source[data-selected="true"] { border-color: var(--accent); box-shadow: 0 0 0 .12rem color-mix(in srgb, var(--accent) 35%, transparent); }
  .review-kind { background: var(--accent-soft); color: var(--accent-strong); }
  .review-source[data-kind="narration"] .review-kind { background: #eadff7; color: #6c448a; }
  :root[data-theme="dark"] .review-source[data-kind="narration"] .review-kind { background: #4a385d; color: #eddcff; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .review-source[data-kind="narration"] .review-kind { background: #4a385d; color: #eddcff; } }
  .review-source-text, .review-card p { color: var(--ink); }
  .review-source-text mark { background: var(--warning-soft); color: var(--ink); }
  .review-composer { border-color: var(--accent); background: var(--surface-soft); }
  .review-selection { background: var(--field); color: var(--muted); }
  .review-card { border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
  .review-card:first-child { border-top: 0; }
  .review-quote { border-color: var(--warm); color: var(--warning) !important; }
  .anchor-state { background: var(--success-soft); color: var(--success); }
  .anchor-state[data-state="moved"] { background: var(--warning-soft); color: var(--warning); }
  .anchor-state[data-state="stale"] { background: var(--danger-soft); color: var(--danger); }
  .review-selection-toolbar { border-color: var(--line-strong); background: var(--panel); box-shadow: var(--floating-shadow); }
  .review-selection-toolbar button, .review-selection-toolbar button:hover { color: var(--ink); }
  .review-selection-icon { background: var(--accent); color: var(--accent-ink); }

  @media (max-width: 72rem) {
    .review-workspace { grid-template-columns: 1fr; }
    .review-filmstrip { position: static; max-height: none; overflow: visible; border-right: 0; padding-right: 0; }
    .review-filmstrip-list { grid-auto-flow: column; grid-auto-columns: minmax(12rem, 14rem); overflow-x: auto; }
  }

  @media (min-width: 72.01rem) {
    .slide-workspace { grid-template-columns: minmax(13rem, 15rem) minmax(34rem, 1fr); }
  }

  @media (max-width: 48rem) {
    .account { width: 100%; flex-wrap: wrap; }
    .account > span { flex: 1 1 100%; }
    .theme-toggle { margin-right: auto; }
    .workspace-head { grid-template-columns: 1fr; }
    .workspace-version { justify-content: flex-start; }
    .workspace-version > .slide-actions { justify-content: flex-start; }
    .workspace-version > .feedback { text-align: left; }
    .card { grid-template-columns: 1fr; gap: .45rem; padding: 1rem .25rem; }
    .card-top, .card h2, .card > .meta, .card > .meta:last-child, .project-statuses, .project-attention { grid-column: 1; grid-row: auto; }
    .card > .meta:last-child { white-space: normal; }
    .mobile-workspace-tabs, .mobile-inspector-tabs { border-color: var(--line); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--shadow); }
    .mobile-workspace-tabs button[aria-selected="true"], .mobile-inspector-tabs button[aria-selected="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
    .tab-badge { background: var(--warning-soft); color: var(--warning); }
  }
`;
