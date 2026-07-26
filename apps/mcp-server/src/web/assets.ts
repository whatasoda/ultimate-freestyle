export const DASHBOARD_SCRIPT = String.raw`(() => {
  const uploadForm = document.querySelector("[data-image-upload]");
  if (uploadForm instanceof HTMLFormElement) {
    const fileInput = uploadForm.querySelector('input[type="file"]');
    const altInput = uploadForm.querySelector('input[name="alt_text"]');
    const feedback = uploadForm.querySelector("[data-feedback]");
    const submit = uploadForm.querySelector('button[type="submit"]');
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
      if (!file || !(altInput instanceof HTMLInputElement) || !(feedback instanceof HTMLElement)) return;
      if (file.size > 10 * 1024 * 1024) {
        feedback.textContent = "画像は10MiB以下にしてください。";
        return;
      }
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "画像を圧縮して保存しています…";
      try {
        const url = new URL(uploadForm.action);
        url.searchParams.set("filename", file.name);
        url.searchParams.set("alt", altInput.value);
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": file.type,
            "x-csrf-token": uploadForm.dataset.csrf || ""
          },
          body: file
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "画像を保存できませんでした。");
        feedback.textContent = "保存しました。画面を更新します。";
        location.reload();
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : "画像を保存できませんでした。";
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
  }

  for (const button of document.querySelectorAll("[data-image-delete]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      if (!confirm("この画像を削除しますか？")) return;
      button.disabled = true;
      try {
        const response = await fetch(button.dataset.imageDelete || "", {
          method: "DELETE",
          headers: { "x-csrf-token": button.dataset.csrf || "" }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "削除できませんでした。");
        button.closest("[data-asset]")?.remove();
      } catch (error) {
        alert(error instanceof Error ? error.message : "削除できませんでした。");
        button.disabled = false;
      }
    });
  }
})();`;

export function dashboardScriptResponse(): Response {
  return new Response(DASHBOARD_SCRIPT, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
