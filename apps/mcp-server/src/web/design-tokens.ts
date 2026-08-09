type TokenMap = Record<string, string>;

const LIGHT: TokenMap = {
  bg: "#f6f7f5",
  panel: "#ffffff",
  sunken: "#eef1f2",
  field: "#ffffff",
  "surface-accent": "#e4f0f8",
  "surface-warm": "#fff3e8",

  line: "#dae1e6",
  "line-strong": "#b3c1cb",

  ink: "#16283b",
  muted: "#57697a",

  accent: "#146ba0",
  "accent-strong": "#0f5480",
  "accent-soft": "#e0eff8",
  "on-accent": "#ffffff",

  caution: "#8a5a12",
  "caution-surface": "#fdf2d8",
  "caution-line": "#c9922f",

  failure: "#a63a44",
  "failure-surface": "#fce9ea",
  "failure-line": "#cf6a73",
  "on-failure": "#ffffff",

  achieved: "#1c7358",
  "achieved-surface": "#dcf1e9",
  "achieved-line": "#3f9a7d",

  "shadow-color": "#29455b",
  shadow: "0 .8rem 2.2rem #29455b12",
  "shadow-floating": "0 1rem 3rem #17283d26"
};

const DARK: TokenMap = {
  bg: "#0e1a24",
  panel: "#16242f",
  sunken: "#0b1620",
  field: "#0f1d28",
  "surface-accent": "#14334a",
  "surface-warm": "#322619",

  line: "#2c3f4f",
  "line-strong": "#4a6274",

  ink: "#e8f0f7",
  muted: "#9cb0bf",

  accent: "#55b2e2",
  "accent-strong": "#86d0f4",
  "accent-soft": "#143549",
  "on-accent": "#08202d",

  caution: "#e6bb6b",
  "caution-surface": "#382e17",
  "caution-line": "#85692a",

  failure: "#ed858f",
  "failure-surface": "#3d1f25",
  "failure-line": "#8c4850",
  "on-failure": "#2a1418",

  achieved: "#5fc2a6",
  "achieved-surface": "#12332b",
  "achieved-line": "#346e5d",

  "shadow-color": "#000000",
  shadow: "0 .8rem 2.2rem #00000024",
  "shadow-floating": "0 1rem 3rem #00000066"
};

function declarations(tokens: TokenMap, scheme: "light" | "dark"): string {
  const entries = Object.entries(tokens).map(
    ([name, value]) => `    --${name}: ${value};`
  );
  return [`    color-scheme: ${scheme};`, ...entries].join("\n");
}

// 同じ宣言をlight、OS設定のdark、手動選択のdarkの3箇所へ出す必要があるが、
// 手書きで3つ並べると1色の変更に3箇所の同期が要り、必ずずれる。値の正本は
// 上のLIGHT／DARKだけに置き、CSSブロックは生成する。
export const DESIGN_TOKEN_STYLE = `
  :root {
${declarations(LIGHT, "light")}
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${declarations(DARK, "dark")}
    }
  }

  :root[data-theme="dark"] {
${declarations(DARK, "dark")}
  }
`;

export const DESIGN_TOKEN_NAMES = Object.keys(LIGHT);
