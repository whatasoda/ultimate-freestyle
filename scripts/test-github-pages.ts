import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/client");

async function build(basePath: string) {
  const process = Bun.spawn(["bun", "run", "build:pages"], {
    cwd: root,
    env: { ...Bun.env, PAGES_BASE_PATH: basePath },
    stdout: "inherit",
    stderr: "inherit"
  });
  assert.equal(
    await process.exited,
    0,
    `GitHub Pages build failed for base path "${basePath}"`
  );
}

async function verify(basePath: string) {
  const [home, presentation, manifest, assetNames] = await Promise.all([
    readFile(resolve(output, "index.html"), "utf8"),
    readFile(resolve(output, "present/starter/index.html"), "utf8"),
    readFile(resolve(root, "dist/server/vinext-prerender.json"), "utf8"),
    readdir(resolve(output, "assets"))
  ]);
  const assetPrefix = `${basePath}/assets/`;

  assert.match(home, new RegExp(`href=["']${assetPrefix.replace("/", "\\/")}`));
  assert.match(
    presentation,
    new RegExp(`href=["']${assetPrefix.replace("/", "\\/")}`)
  );
  assert.match(manifest, /"path": "\/present\/starter"/);
  const presentationBundle = assetNames.find(
    (name) => name.startsWith("Presentation-") && name.endsWith(".js")
  );
  assert.ok(presentationBundle, "Presentation client bundle was not generated");
  const clientCode = await readFile(
    resolve(output, "assets", presentationBundle),
    "utf8"
  );
  if (basePath) assert.match(clientCode, new RegExp(basePath));
}

for (const basePath of ["", "/example-research"]) {
  console.log(`\nChecking GitHub Pages output: ${basePath || "custom domain"}`);
  await build(basePath);
  await verify(basePath);
}

console.log("\nGitHub Pages output is valid for both URL forms.");
