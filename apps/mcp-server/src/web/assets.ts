export const DASHBOARD_SCRIPT = String.raw`(() => {
  const editor = document.querySelector("[data-project-editor]");
  if (editor instanceof HTMLFormElement) {
    const feedback = editor.querySelector("[data-editor-feedback]");
    const versionLabel = editor.querySelector("[data-editor-version]");
    const submit = editor.querySelector('button[type="submit"]');
    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(feedback instanceof HTMLElement)) return;
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "変更を保存しています…";
      const data = new FormData(editor);
      const nullableText = (name) => String(data.get(name) || "");
      try {
        const response = await fetch(editor.action, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": editor.dataset.csrf || ""
          },
          body: JSON.stringify({
            expected_version: Number(editor.dataset.version),
            title: String(data.get("title") || ""),
            stage: String(data.get("stage") || ""),
            summary: nullableText("summary"),
            question: nullableText("question"),
            hypothesis: nullableText("hypothesis"),
            method: nullableText("method")
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "保存できませんでした。");
        editor.dataset.version = String(result.version);
        if (versionLabel instanceof HTMLElement) versionLabel.textContent = "v" + result.version;
        const previewButton = document.querySelector("[data-create-preview]");
        if (previewButton instanceof HTMLButtonElement) previewButton.dataset.version = String(result.version);
        feedback.textContent = "v" + result.version + " として保存しました。";
        feedback.classList.add("success");
        const publishButton = document.querySelector("[data-publish-preview]");
        if (publishButton instanceof HTMLButtonElement) publishButton.disabled = true;
        const publishFeedback = document.querySelector("[data-publish-feedback]");
        if (publishFeedback instanceof HTMLElement) {
          publishFeedback.textContent = "下書きが変わったため、新しいプレビューの確認が必要です。";
          publishFeedback.classList.add("warning");
        }
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : "保存できませんでした。";
        feedback.classList.remove("success");
      } finally {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
  }

  const slideEditor = document.querySelector("[data-slide-editor]");
  const narrationEditor = document.querySelector("[data-narration-editor]");
  const slideFrame = document.querySelector("[data-slide-frame]");
  const frameLoading = document.querySelector("[data-frame-loading]");
  const setFrameLoading = (loading) => {
    if (frameLoading instanceof HTMLElement) frameLoading.hidden = !loading;
  };
  if (slideFrame instanceof HTMLIFrameElement) {
    slideFrame.addEventListener("load", () => setFrameLoading(false));
    try {
      if (slideFrame.contentDocument?.readyState === "complete") setFrameLoading(false);
    } catch {}
  }
  const syncSlideVersion = (version) => {
    const value = String(version);
    if (slideEditor instanceof HTMLFormElement) slideEditor.dataset.version = value;
    if (narrationEditor instanceof HTMLFormElement) narrationEditor.dataset.version = value;
    for (const label of document.querySelectorAll("[data-workspace-version], [data-slide-version], [data-narration-version]")) {
      if (label instanceof HTMLElement) label.textContent = "v" + value;
    }
  };
  const refreshSlideFrame = (version) => {
    if (!(slideFrame instanceof HTMLIFrameElement)) return;
    const frameUrl = new URL(slideFrame.src);
    frameUrl.searchParams.set("refresh", String(version));
    setFrameLoading(true);
    slideFrame.src = frameUrl.toString();
  };
  if (slideEditor instanceof HTMLFormElement) {
    const feedback = slideEditor.querySelector("[data-slide-feedback]");
    const submit = slideEditor.querySelector('button[type="submit"]');
    slideEditor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(feedback instanceof HTMLElement)) return;
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "このスライドを保存しています…";
      feedback.classList.remove("success", "warning");
      const data = new FormData(slideEditor);
      try {
        const response = await fetch(slideEditor.action, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": slideEditor.dataset.csrf || ""
          },
          body: JSON.stringify({
            expected_version: Number(slideEditor.dataset.version),
            title: String(data.get("title") || ""),
            duration_seconds: Number(data.get("duration_seconds")),
            tone: String(data.get("tone") || ""),
            content_markdown: String(data.get("content_markdown") || ""),
            sidebar_markdown: String(data.get("sidebar_markdown") || "")
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "保存できませんでした。");
        syncSlideVersion(result.version);
        feedback.textContent = "v" + result.version + " として保存し、実表示を更新しました。";
        feedback.classList.add("success");
        refreshSlideFrame(result.version);
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : "保存できませんでした。";
        feedback.classList.add("warning");
      } finally {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
  }

  if (narrationEditor instanceof HTMLFormElement) {
    const feedback = narrationEditor.querySelector("[data-narration-feedback]");
    const submit = narrationEditor.querySelector('button[type="submit"]');
    narrationEditor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(feedback instanceof HTMLElement)) return;
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "読み上げ文を保存しています…";
      feedback.classList.remove("success", "warning");
      const segments = [...narrationEditor.querySelectorAll("[data-narration-text]")]
        .filter((input) => input instanceof HTMLTextAreaElement)
        .map((input) => ({
          at: Number(input.dataset.narrationAt),
          text: input.value
        }));
      try {
        const response = await fetch(narrationEditor.action, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": narrationEditor.dataset.csrf || ""
          },
          body: JSON.stringify({
            expected_version: Number(narrationEditor.dataset.version),
            segments
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "読み上げ文を保存できませんでした。");
        syncSlideVersion(result.version);
        feedback.textContent = "v" + result.version + " として保存し、実表示を更新しました。";
        feedback.classList.add("success");
        refreshSlideFrame(result.version);
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : "読み上げ文を保存できませんでした。";
        feedback.classList.add("warning");
      } finally {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
  }

  const stepOutput = document.querySelector("[data-step-output]");
  const stepButtons = [...document.querySelectorAll("[data-step-direction]")];
  if (
    slideEditor instanceof HTMLFormElement &&
    slideFrame instanceof HTMLIFrameElement &&
    stepOutput instanceof HTMLOutputElement
  ) {
    const maxStep = Number(slideEditor.dataset.maxStep || 0);
    let currentStep = 0;
    const updateStep = (nextStep) => {
      currentStep = Math.min(Math.max(nextStep, 0), maxStep);
      stepOutput.value = "STEP " + currentStep + " / " + maxStep;
      const frameUrl = new URL(slideFrame.src);
      frameUrl.searchParams.set("step", String(currentStep));
      setFrameLoading(true);
      slideFrame.src = frameUrl.toString();
      for (const button of stepButtons) {
        if (!(button instanceof HTMLButtonElement)) continue;
        button.disabled =
          button.dataset.stepDirection === "previous"
            ? currentStep === 0
            : currentStep === maxStep;
      }
    };
    for (const button of stepButtons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => {
        updateStep(currentStep + (button.dataset.stepDirection === "previous" ? -1 : 1));
      });
    }
    updateStep(0);
  }

  const previewButton = document.querySelector("[data-create-preview]");
  const publishButton = document.querySelector("[data-publish-preview]");
  const publishFeedback = document.querySelector("[data-publish-feedback]");
  if (previewButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    previewButton.addEventListener("click", async () => {
      previewButton.disabled = true;
      publishFeedback.textContent = "現在の下書きから固定プレビューを生成しています…";
      publishFeedback.classList.remove("warning", "success");
      const previewWindow = window.open("", "_blank");
      try {
        const response = await fetch(previewButton.dataset.createPreview || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": previewButton.dataset.csrf || ""
          },
          body: JSON.stringify({ expected_version: Number(previewButton.dataset.version) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "プレビューを作成できませんでした。");
        publishFeedback.textContent = "プレビューを作成しました。表示を確認してから公開してください。";
        publishFeedback.classList.add("success");
        if (publishButton instanceof HTMLButtonElement) {
          publishButton.dataset.revision = result.revision.revision_id;
          publishButton.disabled = false;
        }
        if (previewWindow) previewWindow.location.href = result.preview_url;
        else window.open(result.preview_url, "_blank", "noopener");
      } catch (error) {
        previewWindow?.close();
        publishFeedback.textContent = error instanceof Error ? error.message : "プレビューを作成できませんでした。";
        publishFeedback.classList.add("warning");
      } finally {
        previewButton.disabled = false;
      }
    });
  }

  if (publishButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    publishButton.addEventListener("click", async () => {
      if (!confirm("確認したこのプレビューを公開しますか？")) return;
      publishButton.disabled = true;
      publishFeedback.textContent = "公開版を切り替えています…";
      publishFeedback.classList.remove("warning", "success");
      try {
        const response = await fetch(publishButton.dataset.publishPreview || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": publishButton.dataset.csrf || ""
          },
          body: JSON.stringify({ revision_id: publishButton.dataset.revision || "" })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "公開できませんでした。");
        publishFeedback.textContent = "公開しました: " + result.public_url;
        publishFeedback.classList.add("success");
        publishButton.disabled = false;
      } catch (error) {
        publishFeedback.textContent = error instanceof Error ? error.message : "公開できませんでした。";
        publishFeedback.classList.add("warning");
        publishButton.disabled = false;
      }
    });
  }

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
      "cache-control": "public, max-age=60, must-revalidate",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
