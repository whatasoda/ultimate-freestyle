export const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";

function normalizeBasePath(value: string | undefined) {
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const pagesBasePath = isGitHubPagesBuild
  ? normalizeBasePath(process.env.PAGES_BASE_PATH)
  : "";

export const pagesAssetBase = pagesBasePath ? `${pagesBasePath}/` : "/";
