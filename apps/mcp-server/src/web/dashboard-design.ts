export const DASHBOARD_DESIGN_STYLE = String.raw`
  body { background: var(--bg); color: var(--ink); }
  /* 面の型ごとの骨格。幅・上余白・節の間隔をここだけで決める。
     ページ個別のクラスへ幾何を書き足さない。書き足すと型の違いが散る。 */
  main[data-surface] {
    width: var(--surface-width);
    max-width: none;
    margin-inline: auto;
    padding-top: var(--surface-pad-top);
  }
  main[data-surface] > * + * { margin-top: var(--surface-rhythm); }

  main[data-surface="disclosure"] { --surface-width: min(92vw, 64rem); --surface-pad-top: clamp(2rem, 7vw, 5rem); --surface-rhythm: clamp(2.5rem, 6vw, 4.5rem); }
  main[data-surface="select"]     { --surface-width: min(92vw, 72rem); --surface-pad-top: clamp(1.75rem, 4vw, 3.5rem); --surface-rhythm: 1.25rem; }
  main[data-surface="overview"]   { --surface-width: min(92vw, 72rem); --surface-pad-top: clamp(1.75rem, 4vw, 3.5rem); --surface-rhythm: 1.5rem; }
  main[data-surface="workspace"]  { --surface-width: min(96vw, 100rem); --surface-pad-top: 1rem; --surface-rhythm: .85rem; }
  main[data-surface="review"]     { --surface-width: min(94vw, 88rem); --surface-pad-top: 1rem; --surface-rhythm: 1.25rem; }
  main[data-surface="monitor"]    { --surface-width: min(94vw, 84rem); --surface-pad-top: 1rem; --surface-rhythm: 1.25rem; }

  /* 見出し群は一つのまとまりであって節ではない。節と節の間隔を内側へ適用すると、
     戻る・段階・題名・概要・節ナビの4つの隙間だけで120px消える。 */
  main[data-surface] > :is(.back, .card-top, .eyebrow, .detail-title, .lead)
    + :is(.card-top, .eyebrow, .detail-title, .lead, .project-section-nav, .actions) {
    margin-top: .3rem;
  }
  /* 道具の画面は読み物ではない。上余白を読み幅の基準から詰める。 */
  main[data-surface="select"], main[data-surface="overview"] { --surface-pad-top: clamp(1rem, 2vw, 1.5rem); }
  main[data-surface="overview"] .detail-title { font-size: clamp(1.6rem, 3vw, 2.4rem); }
  /* 見出しと概要は開示面の寸法のまま道具の画面でも使われていた。読ませる面と
     見て決める面では、題名と説明に割ける高さが違う。 */
  main:is([data-surface="select"], [data-surface="overview"], [data-surface="monitor"], [data-surface="review"]) h1 {
    font-size: clamp(1.5rem, 2.6vw, 2.1rem);
  }
  main:is([data-surface="select"], [data-surface="overview"], [data-surface="monitor"], [data-surface="review"]) .lead {
    margin-top: .35rem;
    font-size: .95rem;
    line-height: 1.65;
  }
  body:has(.account) .site-header { padding-block: .65rem; }

  @media (min-width: 72.01rem) {
    main[data-surface="workspace"] { --surface-width: min(98vw, 112rem); }
  }

  /* 作業面は対象一覧・実表示・編集を同時に見せる面である。編集を下段の帯として
     積むと、実表示との重なりが無くなり保存前ライブプレビューの結果が見えない。
     ページ全体を1画面へ収め、3領域をそれぞれ独立してスクロールさせる。 */
  body:has(main[data-surface="workspace"]) {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
  }
  body:has(main[data-surface="workspace"]) > .site-header { flex: 0 0 auto; }
  main[data-surface="workspace"] {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding-block: .55rem .5rem;
  }
  main[data-surface="workspace"] .workspace-head {
    gap: .4rem 1rem;
    /* 2列目を縮められるようにしないと、版と操作の実幅が1列目を0へ潰す。 */
    grid-template-columns: minmax(7rem, 1fr) minmax(0, auto);
  }
  main[data-surface="workspace"] .workspace-head h1 { font-size: clamp(1.3rem, 2.2vw, 1.9rem); }
  /* 作業面の見出しは、段階・題名・レビューへの導線が3行に積まれて85pxあった。
     どれも短いので1行へ並べ、足りなければ折り返す。 */
  main[data-surface="workspace"] .workspace-head > div:first-child {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: .1rem .6rem;
  }
  main[data-surface="workspace"] .workspace-head .eyebrow { margin: 0; }
  main[data-surface="workspace"] .workspace-head h1 { margin: 0; }
  .workspace-head-links { margin: 0; font-size: .8rem; }
  /* 戻る導線は独立した帯にせず見出しの段へ寄せる。 */
  main[data-surface="workspace"] > .back {
    align-self: start;
    margin-bottom: -1.15rem;
    font-size: .8rem;
  }
  main[data-surface="workspace"] > .slide-workspace {
    flex: 1;
    min-height: 0;
    /* align-items: start だと子が行をはみ出して自然な高さで描かれ、
       ドックの上へ重なる。行で高さを配分するため stretch に戻す。 */
    align-items: stretch;
    margin-bottom: 0;
  }

  /* 16:9の実表示は高さで決まる。ドックを下段へ置くと高さを奪い、横は余る。
     広い画面ではドックを右へ置き、余っている幅の側から取る。 */
  @media (min-width: 48.01rem) {
    main[data-surface="workspace"] > .slide-workspace {
      grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr) minmax(15rem, 23rem);
      grid-template-rows: minmax(0, 1fr);
    }
    main[data-surface="workspace"] > .slide-workspace > .inspector {
      grid-column: 3;
      grid-row: 1;
      /* 12列のgridのままだとチップが1/12幅へ潰れ、開いたdetailsの行も確保されず
         後続要素へ重なる。1列に積むだけなのでflexにする。 */
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    main[data-surface="workspace"] > .slide-workspace > .inspector > * { flex: 0 0 auto; }
    /* プレビューを広げる間は一覧とドックを畳む。 */
    body[data-preview-focus="true"] main[data-surface="workspace"] > .slide-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
    body[data-preview-focus="true"] main[data-surface="workspace"] > .slide-workspace > .inspector { grid-column: 1; }
  }
  .slide-workspace > .filmstrip { min-height: 0; overflow: auto; }
  .slide-workspace > .workspace-preview {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }
  /* 枠は幅ではなく残りの高さから決める。width:100%のままだと縦が足りない画面で
     max-heightに切られ、選んだ比率が崩れる。 */
  /* 幅からアスペクト比で高さを決め、残り高さでmax-heightを掛ける。高さ起点にすると
     幅の制約が勝った瞬間に比率が崩れる。 */
  .slide-workspace > .workspace-preview { container-type: size; }
  .slide-workspace > .workspace-preview > .workspace-frame {
    flex: 0 0 auto;
    /* 幅を確定させたままmax-heightを掛けると比率が切られ、高さ起点にすると幅の
       制約で切られる。残り高さから幅を先に決めれば、どちらでも比率が保たれる。 */
    width: min(100%, calc((100cqh - 7.5rem) * var(--workspace-aspect-num, 1.7778)));
    min-height: 0;
    max-height: none;
    margin-inline: auto;
  }

  /* 見出し帯は1行に収める。操作を独立した段へ落とすと作業面の高さを削る。 */
  main[data-surface="workspace"] .workspace-version > .slide-actions {
    flex: 0 0 auto;
    padding-top: 0;
    border-top: 0;
  }
  /* 折り返させると幅が狭い画面で見出し帯が数百px膨らみ、作業面の高さを食う。
     横スクロールへ逃がして高さを固定する。 */
  main[data-surface="workspace"] .workspace-version {
    flex-wrap: nowrap;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: .2rem;
    scrollbar-width: thin;
  }
  main[data-surface="workspace"] .workspace-version > .feedback { flex: 0 0 auto; }
  main[data-surface="workspace"] .workspace-version :is(a, button) { white-space: nowrap; }

  /* 編集ドック。高さを画面の4割で止め、一度に一つの節だけを見せる。
     全設定を積み上げると、実表示が画面外へ押し出される。 */
  .slide-workspace > .inspector {
    max-height: none;
    overflow: auto;
    padding: .7rem .8rem 1rem;
    border-top: 1px solid var(--line-strong);
    border-radius: .8rem .8rem 0 0;
    background: var(--panel);
    box-shadow: var(--shadow-floating);
    scrollbar-gutter: stable;
  }
  .inspector-tabs {
    position: sticky;
    z-index: 2;
    top: -.7rem;
    display: flex;
    flex-wrap: wrap;
    gap: .3rem;
    margin: -.7rem -.8rem .55rem;
    padding: .55rem .8rem;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .inspector-tabs button { flex: 0 0 auto; min-height: 2.4rem; padding: .38rem .6rem; font-size: .76rem; white-space: nowrap; }
  .inspector-tabs button[aria-selected="true"] { background: var(--accent-soft); color: var(--accent-strong); }

  .site-header { padding-block: 1rem; border-bottom: 1px solid var(--line); }
  .brand { color: var(--ink); font-family: ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif; }
  h1, h2, h3, summary, .button, button { text-wrap: balance; }
  /* 日本語ラベルは既定だと語の途中で折れる。文節境界で折り、短い操作名は折らない。 */
  :is(.button, button, summary, .setting-chip, .project-status, .filmstrip-link, label) {
    word-break: auto-phrase;
    line-break: strict;
  }
  :is(.voice-filter, .step-control, .slide-actions, .inspector-tabs) :is(button, .button) {
    white-space: nowrap;
  }
  /* 操作のラベルは縮めない。行が足りないときは説明文の側を折る。
     操作を縮めると2〜3文字ずつの折り返しになり、何の操作か読めなくなる。 */
  :is(.section-head, .workspace-head, .voice-hero, .landing-cta) > :is(a, button, .actions) { flex-shrink: 0; }
  :is(.section-head, .workspace-head, .voice-hero, .landing-cta) > :not(a):not(button):not(.actions) { min-width: 0; }
  .actions > :is(a, button) { flex-shrink: 0; }
  h1, h2, h3 { font-family: ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDPGothic", sans-serif; }
  .eyebrow { color: var(--accent-strong); }
  .lead, .panel p, .panel li, .back, .meta, .hint { color: var(--muted); }
  /* 操作の表現。意味は面と線種だけで分け、強調はサイズと配置で表す。
     塗りを強調に使うと、確定（外向きに決まる）と主動線が同じ見た目になる。 */

  /* 既定は確認。何も変わらない操作が最も多い。 */
  .button, button { border: 1px solid var(--line-strong); background: transparent; color: var(--ink); }
  .button:hover, button:hover { border-color: var(--accent); background: var(--accent-soft); }
  .button:disabled, button:disabled { opacity: .5; cursor: not-allowed; }
  .ghost { border-color: var(--line-strong); background: transparent; color: var(--ink); }
  .ghost:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }

  /* 移動。別の場所へ行くだけなので面も枠も持たない。 */
  a.button, a.ghost, button[data-op="move"] {
    border-color: transparent;
    background: transparent;
    color: var(--accent-strong);
    font-weight: 800;
  }
  a.button:hover, a.ghost:hover, button[data-op="move"]:hover {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  /* 主動線の移動。淡い塗りと大きさで強調する。枠を持たない点で実行と、
     塗りが淡い点で確定と分かれる。 */
  a.button:not(.ghost) {
    min-height: 2.9rem;
    padding-inline: 1.2rem;
    border-color: transparent;
    background: var(--accent-soft);
  }
  a.button:not(.ghost):hover { background: var(--accent); color: var(--on-accent); }

  /* 編集。値が変わり版が上がる。明示保存も構造操作もプリセット適用も同じ意味なので
     同じ形にし、明示保存は「領域の末尾に一つ」という配置の規則で区別する。 */
  [data-op="edit"],
  button[type="submit"]:not([data-op]):not(.danger) {
    border-color: var(--accent);
    background: transparent;
    color: var(--accent-strong);
    font-weight: 800;
  }
  [data-op="edit"]:hover,
  button[type="submit"]:not([data-op]):not(.danger):hover { background: var(--accent-soft); }

  /* 実行。押すと待ち時間が生まれる。確認とも保存とも区別する。 */
  [data-op="run"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); font-weight: 800; }
  [data-op="run"]:hover { background: var(--accent); color: var(--on-accent); }

  /* 依頼。結果はこのアプリの外で起きるので、アクセントを使わず破線で示す。 */
  [data-op="ask"] { border-style: dashed; border-color: var(--line-strong); background: transparent; color: var(--muted); }
  [data-op="ask"]:hover { border-color: var(--ink); background: var(--sunken); color: var(--ink); }

  /* 確定。外向きの状態が変わる。濃い塗りはここだけ。 */
  [data-op="commit"]:not(.danger) { border-color: transparent; background: var(--accent); color: var(--on-accent); font-weight: 800; }
  [data-op="commit"]:not(.danger):hover { background: var(--accent-strong); color: var(--on-accent); }

  /* 破棄。戻せない。他の操作から離し、確認ゲートの内側へ置く。 */
  .danger, .actions .danger, .slide-actions .danger, button.danger, a.danger {
    border-color: var(--failure);
    background: transparent;
    color: var(--failure);
    font-weight: 800;
  }
  .danger:hover { border-color: var(--failure); background: var(--failure-surface); color: var(--failure); }

  /* 公開停止は外向きの状態を戻す確定。破棄ではないが、公開と逆向きだと読めるようにする。 */
  [data-op="commit"].danger { border-color: var(--failure); background: transparent; color: var(--failure); }
  [data-op="commit"].danger:hover { background: var(--failure); color: var(--on-failure); }

  /* 確定のゲート。可逆な操作と同じ面に置くと、押した結果が外へ出ることが読めない。 */
  .commit-zone {
    display: grid;
    gap: .7rem;
    margin-top: 1.35rem;
    padding: 1rem;
    border: 1px solid var(--accent);
    border-radius: .8rem;
    background: var(--surface-accent);
  }
  .commit-zone-label {
    margin: 0;
    color: var(--accent-strong);
    font-size: .78rem;
    font-weight: 850;
  }

  :where(a, button, input, textarea, select, summary):focus-visible { outline-color: var(--accent); }
  input, textarea, select, .editor input, .editor textarea, .editor select,
  .review-composer textarea,
  .review-script textarea, .narration-outline textarea, .filmstrip-search input {
    border-color: var(--line-strong);
    background: var(--field);
    color: var(--ink);
  }
  input::placeholder, textarea::placeholder { color: var(--muted); opacity: .8; }
  .editor label, .upload label, .asset-alt label, .review-composer label { color: var(--ink); }
  .theme-toggle { gap: .45rem; min-height: 2.35rem; padding: .42rem .65rem; font-size: .78rem; }
  .theme-toggle-icon { display: grid; place-items: center; width: 1.15rem; height: 1.15rem; color: var(--accent-strong); font-size: 1rem; }

  .panel, .empty, .inspector-section { border-color: var(--line); background: var(--panel); box-shadow: none; }
  .panel { border-radius: .8rem; }
  /* 基底層は38rem未満で縦積み・左寄せにする。ここを無条件のalign-itemsで
     上書きすると狭い画面だけ中央寄せになるため、同じ条件を付けて戻す。 */
  .section-head { align-items: center; }
  @media (max-width: 38rem) { .section-head { align-items: flex-start; } }
  .stage { border-color: var(--line-strong); background: var(--sunken); color: var(--ink); }
  .hint, .mode-note, .guide-note { border-color: var(--accent); background: var(--surface-accent); color: var(--ink); }
  .connection-guide, .workspace-guide { border-color: var(--line); background: var(--panel); }
  .connection-guide > summary, .workspace-guide > summary { color: var(--ink); }
  .connection-body, .disclosure-body, .inspector-body { background: transparent; }
  .setup-steps li, .workspace-guide-body p { border-color: var(--line); background: var(--sunken); color: var(--ink); }
  .endpoint-box, .copy-box, .upload { border-color: var(--line-strong); background: var(--sunken); }
  .endpoint-box code, .official-links a, .component-outline code { color: var(--accent-strong); }

  .grid { display: grid; grid-template-columns: 1fr; gap: 0; border-block: 1px solid var(--line); }
  .card-link { border-radius: 0; }
  .card-link + .card-link { border-top: 1px solid var(--line); }
  .card { display: grid; grid-template-columns: minmax(10rem, .75fr) minmax(15rem, 1.25fr) auto; gap: .45rem 1.25rem; align-items: center; min-height: 0; padding: 1rem .35rem; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .card-link:hover .card { border-color: transparent; background: var(--surface-accent); transform: none; }
  .card-top { grid-column: 1; grid-row: 1 / span 2; justify-content: flex-start; flex-wrap: wrap; }
  .card h2 { grid-column: 2; margin: 0; font-size: 1.08rem; }
  .card > .meta { grid-column: 2; }
  .card > .meta:last-child { grid-column: 3; grid-row: 1; white-space: nowrap; }
  .project-statuses { grid-column: 2 / -1; margin-top: .2rem; }
  .project-attention { grid-column: 2 / -1; margin: .15rem 0 0; color: var(--caution); }
  .project-status { border-color: var(--line-strong); color: var(--muted); }
  .project-status[data-state="ready"] { border-color: var(--line-strong); background: var(--sunken); color: var(--muted); }
      .project-status[data-kind="publication"][data-state="ready"] { border-color: var(--achieved); background: var(--achieved-surface); color: var(--achieved); }
  .project-status[data-state="attention"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
  .danger-zone { border-color: var(--failure); background: var(--failure-surface); }
  .danger-zone > summary { color: var(--failure); }
  .danger-zone > p, .danger-zone label { color: var(--ink); }
  .danger-zone input { border-color: var(--failure); background: var(--field); color: var(--ink); }
  .danger-zone button.danger { border-color: var(--failure); background: var(--failure); color: var(--on-failure); }

  .journey { border-color: var(--line); background: var(--surface-accent); box-shadow: none; }
  .journey-step { border-color: var(--line); }
  .journey-step[data-complete="true"] { border-color: var(--line-strong); background: var(--sunken); color: var(--ink); }
  .save-state { border-color: var(--line); background: transparent; color: var(--muted); }
  .journey-next { border-left: .2rem solid var(--surface-warm); background: var(--panel); }
  .save-state[data-state="dirty"], .setting-chip[data-state="warning"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
  .save-state[data-state="saving"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }

  .project-section-nav, .voice-filter {
    border-color: var(--line);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    box-shadow: var(--shadow);
  }
  .project-section-nav a { color: var(--muted); }
  .project-section-nav a:hover, .project-section-nav a:focus-visible { background: var(--sunken); color: var(--ink); }
  .project-section-nav a[aria-current="location"] { background: var(--accent-soft); color: var(--accent-strong); }
  .stat-list dd[data-warning="true"], .character-count[data-near-limit="true"] { color: var(--caution); }
  .character-count[data-over-limit="true"] { color: var(--failure); }
  .storage-breakdown summary, .storage-breakdown a, .preflight-action { color: var(--accent-strong); }
  .slide-row:hover { background: var(--surface-accent); }
  .slide-quality-warning { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
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
  .preflight-item::before { background: var(--sunken); color: var(--ink); }
  .preflight-item[data-state="attention"]::before { background: var(--caution-surface); color: var(--caution); }
  .preflight-item[data-state="recommendation"]::before { background: transparent; box-shadow: inset 0 0 0 1px var(--caution-line); color: var(--caution); }
  .preflight-action:hover { background: var(--accent-soft); }
  .publication-history .status-row { border-color: var(--line); background: transparent; }
  .success, .audio-state.ready { color: var(--muted) !important; }
  .warning, .audio-state, .voice-timing[data-state="warning"] { color: var(--caution) !important; }
  .feedback { color: var(--accent-strong); }
  .draft-recovery { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }
  .draft-recovery.conflict { border-color: var(--failure); background: var(--failure-surface); color: var(--failure); }
  .asset, .upload, .upload-preview, .content-structure { border-color: var(--line); background: var(--sunken); }
  .asset { background: var(--panel); }
  .asset img, .upload-dropzone { border-color: var(--line-strong); background: var(--sunken); }
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
  .filmstrip-link:hover { background: var(--sunken); color: var(--ink); }
  .filmstrip-link[data-active="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
  .workspace-preview { background: var(--sunken); }
  .workspace-frame { border-color: var(--line-strong); box-shadow: var(--shadow); }
  .inspector-section { border-radius: .75rem; }
  .inspector-section > summary { background: var(--panel); }
  .inspector-section[open] > summary { background: var(--surface-accent); }
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
    background: var(--accent-soft);
    color: var(--accent-strong);
    box-shadow: none;
  }
  .animation-symbol { background: var(--surface-accent); color: var(--accent-strong); }
  .mode-note, .voice-composed { border-color: var(--accent); background: var(--surface-accent); color: var(--ink); }
  .operation-summary { border-color: var(--accent); background: var(--surface-accent); color: var(--muted); }
  .setting-chip { border-color: var(--line); background: var(--sunken); color: var(--ink); }
  .component-outline li { border-color: var(--line); color: var(--ink); }
  a.component-outline-row:hover, a.component-outline-row[aria-current="true"] { background: var(--accent-soft); color: var(--ink); }
  .component-outline .component-outline { border-color: var(--line-strong); }
  .component-outline .component-outline li, .editor .component-item, .voice-segment, .voice-cue { background: transparent; }
  .component-step { border-color: var(--line); background: var(--sunken); color: var(--muted); }
  .narration-outline li { border-color: var(--line); background: transparent; color: var(--ink); }
  .narration-outline li[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); }
  .narration-outline p, .setting-table dd, .component-detail > summary, .voice-cue-head strong, .voice-composed,
  .quality-list { color: var(--ink); }
  .component-item legend { color: var(--accent-strong); }
  .component-detail { border-color: var(--line); }
  .editor .assembly-pattern { border-color: var(--line); background: var(--field); }
  .editor .assembly-pattern:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .voice-segment, .voice-cue { border-color: var(--line); }
  .voice-segment:target { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
  .voice-howto, .quality-status { border-color: var(--line); background: var(--surface-accent); color: var(--ink); }
  .voice-howto > summary { color: var(--accent-strong); }
  .voice-howto-body { color: var(--ink); }
  .quality-status[data-level="warning"] { border-color: var(--caution); background: var(--caution-surface); color: var(--caution); }

  .voice-preset { border-color: var(--line); background: linear-gradient(135deg, var(--surface-accent), var(--panel)); }
  .voice-preset select, .voice-search { border-color: var(--line-strong); background: var(--field); color: var(--ink); }
  .voice-stat, .job-card, .voice-review { border-color: var(--line); background: var(--panel); }
  .voice-stat { background: var(--sunken); }
  .voice-stat.ready strong { color: var(--ink); }
  .voice-stat.pending strong { color: var(--caution); }
  .job-card[data-state="completed"] { border-color: var(--line-strong); }
  .job-card[data-state="failed"], .job-card[data-state="partially_failed"] { border-color: var(--failure); }
  .voice-filter :is(button,.button)[aria-current="page"] { background: var(--accent-soft); color: var(--accent-strong); }
  .voice-review-body p, .voice-next ol { color: var(--ink); }
  .voice-status { background: var(--sunken); color: var(--muted); }
  .voice-status.ready, .voice-status.completed { background: var(--sunken); color: var(--muted); }
  .voice-status.needs_generation { background: var(--caution-surface); color: var(--caution); }
      .voice-status.queued, .voice-status.running, .voice-status.generating { background: var(--accent-soft); color: var(--accent-strong); }
  .voice-status.failed, .voice-status.partially_failed { background: var(--failure-surface); color: var(--failure); }
  .voice-play[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .filmstrip-search output { color: var(--ink); }
  .segment-outline a:hover, .segment-outline a[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); }
  .review-count { background: var(--accent-soft); color: var(--accent-strong); }
  .review-count[data-empty="true"] { background: var(--sunken); color: var(--muted); }
  .review-empty { border-color: var(--line-strong); }
  .review-composer[data-active="true"], .upload-dropzone[data-drag-active="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }

  .review-workspace { grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr); gap: 1.25rem; }
  .review-filmstrip { position: sticky; top: .75rem; max-height: calc(100dvh - 1.5rem); overflow: auto; border-right: 1px solid var(--line); padding-right: .75rem; scrollbar-gutter: stable; }
  .review-center { gap: 1.25rem; }
  .review-comments { position: static; display: grid; gap: 1.25rem; max-height: none; overflow: visible; padding: 0; border: 0; background: transparent; }
  .review-source { border-color: var(--line); background: var(--panel); }
  .review-source[data-kind="narration"] { border-color: var(--line); border-left: .22rem solid var(--line-strong); background: var(--sunken); }
  .review-source[data-selected="true"] { border-color: var(--accent); box-shadow: 0 0 0 .12rem color-mix(in srgb, var(--accent) 35%, transparent); }
  .review-kind { background: var(--sunken); color: var(--muted); }
  .review-source[data-kind="narration"] .review-kind { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--muted); }
  .review-source-text, .review-card p { color: var(--ink); }
  .review-source-text mark { background: var(--caution-surface); color: var(--ink); }
  .review-composer { border-color: var(--accent); background: var(--surface-accent); }
  /* 指摘は選んだ場所で書く。入力欄がページ下方にあると、広い画面では画面外のまま
     有効になり、どこへ書けばよいか分からない。 */
  .review-composer[data-floating="true"] {
    position: fixed;
    z-index: 40;
    width: min(30rem, calc(100vw - 1.5rem));
    max-height: min(26rem, calc(100dvh - 2rem));
    overflow: auto;
    border-color: var(--accent);
    border-radius: .8rem;
    background: var(--panel);
    box-shadow: var(--shadow-floating);
  }
  .review-composer[data-floating="true"] textarea { min-height: 5.5rem; }
  /* 浮いている間は見出しが冗長。選択箇所と入力欄だけを見せる。 */
  .review-composer[data-floating="true"] > div:first-child { display: none; }
  .review-composer[data-floating="true"] .review-selection { margin-top: 0; }
  .review-selection { background: var(--field); color: var(--muted); }
  .review-card { border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
  .review-card:first-child { border-top: 0; }
  .review-quote { border-color: var(--line-strong); color: var(--muted) !important; }
  .anchor-state { background: var(--sunken); color: var(--muted); }
  .anchor-state[data-state="moved"] { background: var(--caution-surface); color: var(--caution); }
  .anchor-state[data-state="stale"] { background: var(--failure-surface); color: var(--failure); }
  .review-selection-toolbar { border-color: var(--line-strong); background: var(--panel); box-shadow: var(--shadow-floating); }
  .review-selection-toolbar button, .review-selection-toolbar button:hover { color: var(--ink); }
  .review-selection-icon { background: var(--accent); color: var(--on-accent); }

  @media (max-width: 72rem) {
    .review-workspace { grid-template-columns: 1fr; }
    .review-filmstrip { position: static; max-height: none; overflow: visible; border-right: 0; padding-right: 0; }
    .review-filmstrip-list { grid-auto-flow: column; grid-auto-columns: minmax(12rem, 14rem); overflow-x: auto; }
  }

  @media (min-width: 72.01rem) {
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
    .mobile-workspace-tabs, .inspector-tabs { border-color: var(--line); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--shadow); }
    .mobile-workspace-tabs button[aria-selected="true"], .inspector-tabs button[aria-selected="true"] { background: var(--accent-soft); color: var(--accent-strong); }
    .tab-badge { background: var(--caution-surface); color: var(--caution); }
  }
`;
