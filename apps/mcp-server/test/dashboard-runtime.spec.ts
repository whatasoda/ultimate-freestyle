import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { DASHBOARD_SCRIPT } from "../src/web/assets";

// 配信JSはWorkersにもnodeにもDOMが無いため、これまでソース文字列をgrepして
// 「その式が書かれていること」だけ確かめていた。式があっても動くとは限らず、変数名を
// 変えただけで落ちる一方で壊れても気づけない。ここではDOMを与えて実際に走らせる。
// tsconfigはWorkers向けでlibにDOMを含まないため、happy-dom側の型だけで書く。
function boot(body: string, storage: Record<string, string> = {}) {
  const window = new Window({ url: "https://saijiyu-kenkyu.2764.moe/dashboard" });
  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, value);
  }
  window.document.body.innerHTML = body;
  window.eval(DASHBOARD_SCRIPT);
  return window;
}

const THEME_KEY = "ultimate-freestyle:dashboard-theme";
const THEME_TOGGLE = `<button data-dashboard-theme-toggle><span data-dashboard-theme-label>ダーク</span></button>`;

describe("dashboard runtime", () => {
  it("runs without throwing on a page that has none of its targets", () => {
    expect(() => boot("<main></main>")).not.toThrow();
  });

  // 切り替えボタンを持たない面（発表rendererの編集frameなど）ではテーマへ触らない。
  it("leaves the theme alone when the page has no toggle", () => {
    const window = boot("<main></main>");
    expect(window.document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("flips the theme when the toggle is pressed and remembers it", () => {
    const window = boot(THEME_TOGGLE);
    const root = window.document.documentElement;
    const initial = root.getAttribute("data-theme");
    expect(initial === "light" || initial === "dark").toBe(true);

    window.document.querySelector("[data-dashboard-theme-toggle]")?.dispatchEvent(
      new window.Event("click", { bubbles: true })
    );

    const flipped = root.getAttribute("data-theme");
    expect(flipped).not.toBe(initial);
    expect(window.localStorage.getItem(THEME_KEY)).toBe(flipped);
  });

  it("restores the remembered theme on the next load", () => {
    const window = boot(THEME_TOGGLE, { [THEME_KEY]: "light" });
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  // 保存はfetchの結果で版が上がる。版の表示とフォームのdata-versionが揃わないと、
  // 次の保存が必ず競合する。内部関数を直接叩かず、利用者と同じくフォームを送って確かめる。
  it("lifts every form and label to the version the server returned", async () => {
    const window = boot(`
      <form data-versioned-form action="/api/projects/p1/fields" data-version="4" data-csrf="t">
        <input name="title" value="新しい題名">
        <button type="submit">保存</button>
        <p data-form-feedback></p>
      </form>
      <form data-project-editor action="/api/projects/p1/fields" data-version="4" data-csrf="t"></form>
      <span data-version-label>v4</span>
      <span data-editor-version>v4</span>
      <button data-create-preview data-version="4"></button>
    `);
    let sent: { url: string; body: string } | null = null;
    window.fetch = (async (url: string, init: { body: string }) => {
      sent = { url: String(url), body: String(init?.body ?? "") };
      return new window.Response(JSON.stringify({ ok: true, version: 5, updated_at: "2026-09-06T00:00:00.000Z" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as never;

    window.document.querySelector("form")?.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sent).not.toBeNull();
    expect(JSON.parse(sent!.body).expected_version).toBe(4);
    for (const form of window.document.querySelectorAll("form")) {
      expect(form.getAttribute("data-version")).toBe("5");
    }
    for (const label of window.document.querySelectorAll("[data-version-label], [data-editor-version]")) {
      expect(label.textContent).toBe("v5");
    }
    expect(window.document.querySelector("[data-create-preview]")?.getAttribute("data-version")).toBe("5");
  });

  // 保存が通ると下書きが進むので、確認済みの版を指していた公開操作は閉じる。
  it("closes the publish gate after a successful save", async () => {
    const window = boot(`
      <form data-versioned-form action="/api/projects/p1/fields" data-version="4" data-csrf="t">
        <input name="title" value="題名">
        <button type="submit">保存</button>
        <p data-form-feedback></p>
      </form>
      <button data-publish-preview data-preview-current="true" data-preview-reviewed="true">確認した版を公開</button>
      <button data-review-preview data-review-available="true">終了画面を確認</button>
    `);
    window.fetch = (async () =>
      new window.Response(JSON.stringify({ ok: true, version: 5 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as never;

    window.document.querySelector("form")?.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    const publish = window.document.querySelector("[data-publish-preview]");
    expect(publish?.hasAttribute("disabled")).toBe(true);
    expect(publish?.getAttribute("data-preview-current")).toBe("false");

    const review = window.document.querySelector("[data-review-preview]");
    expect(review?.hasAttribute("disabled")).toBe(true);
  });
});
