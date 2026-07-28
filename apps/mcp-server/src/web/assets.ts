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
  const slideFrame = document.querySelector("[data-slide-frame]");
  const frameLoading = document.querySelector("[data-frame-loading]");
  const setFrameLoading = (loading) => {
    if (frameLoading instanceof HTMLElement) frameLoading.hidden = !loading;
  };
  const syncSlideVersion = (version) => {
    const value = String(version);
    for (const form of document.querySelectorAll("[data-versioned-form]")) {
      if (form instanceof HTMLFormElement) form.dataset.version = value;
    }
    for (const label of document.querySelectorAll("[data-workspace-version], [data-version-label]")) {
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
  const numberValue = (data, name) => Number(data.get(name));
  const optionalNumberValue = (data, name) => {
    const value = String(data.get(name) ?? "").trim();
    return value === "" ? undefined : Number(value);
  };
  const serializeVersionedForm = (form) => {
    const data = new FormData(form);
    const body = { expected_version: Number(form.dataset.version) };
    if (form.matches("[data-slide-editor]")) Object.assign(body, {
      title: String(data.get("title") || ""),
      duration_seconds: numberValue(data, "duration_seconds"),
      content_markdown: String(data.get("content_markdown") || ""),
      sidebar_markdown: String(data.get("sidebar_markdown") || "")
    });
    if (form.matches("[data-appearance-editor]")) Object.assign(body, {
      tone: String(data.get("tone") || ""),
      template_id: String(data.get("template_id") || "") || null,
      enter_animation: String(data.get("enter_animation") || "") || null
    });
    if (form.matches("[data-template-editor]")) Object.assign(body, {
      name: String(data.get("name") || ""),
      region_layout: String(data.get("region_layout") || ""),
      sidebar_width_percent: numberValue(data, "sidebar_width_percent"),
      background: String(data.get("background") || ""),
      surface: String(data.get("surface") || ""),
      foreground: String(data.get("foreground") || ""),
      muted: String(data.get("muted") || ""),
      accent: String(data.get("accent") || ""),
      corner_radius_px: numberValue(data, "corner_radius_px"),
      spacing_scale: numberValue(data, "spacing_scale"),
      font_scale: numberValue(data, "font_scale"),
      enter_animation: String(data.get("enter_animation") || ""),
      reveal_animation: String(data.get("reveal_animation") || ""),
      visual_preset: String(data.get("visual_preset") || ""),
      body_font: String(data.get("body_font") || ""),
      heading_font: String(data.get("heading_font") || ""),
      density: String(data.get("density") || ""),
      motion_style: String(data.get("motion_style") || ""),
      body_weight: numberValue(data, "body_weight"),
      heading_weight: numberValue(data, "heading_weight"),
      line_height: numberValue(data, "line_height"),
      letter_spacing_em: numberValue(data, "letter_spacing_em")
    });
    if (form.matches("[data-narration-settings-editor]")) Object.assign(body, {
      display: String(data.get("display") || ""),
      speaker: String(data.get("speaker") || "").trim() || null,
      appearance: {
        placement: String(data.get("placement") || ""),
        size: String(data.get("size") || ""),
        text_align: String(data.get("text_align") || ""),
        speaker_visible: data.has("speaker_visible"),
        progress_visible: data.has("progress_visible"),
        text_scale: numberValue(data, "text_scale"),
        max_lines: numberValue(data, "max_lines")
      }
    });
    if (form.matches("[data-segment-editor]")) {
      const tuning = {};
      for (const key of ["speedScale", "pitchScale", "intonationScale", "volumeScale", "pauseLengthScale", "prePhonemeLength", "postPhonemeLength"]) {
        const value = optionalNumberValue(data, "tuning_" + key);
        if (value !== undefined) tuning[key] = value;
      }
      Object.assign(body, {
        text: String(data.get("text") || ""),
        speaker: String(data.get("speaker") || "").trim() || null,
        voice_profile_id: String(data.get("voice_profile_id") || "") || null,
        voice_tuning: Object.keys(tuning).length ? tuning : null
      });
    }
    return body;
  };
  for (const form of document.querySelectorAll("[data-versioned-form]")) {
    if (!(form instanceof HTMLFormElement)) continue;
    form.addEventListener("input", () => { form.dataset.dirty = "true"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = form.querySelector("[data-form-feedback]");
      const submit = form.querySelector('button[type="submit"]');
      if (!(feedback instanceof HTMLElement)) return;
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "変更を保存しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(form.action, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": form.dataset.csrf || ""
          },
          body: JSON.stringify(serializeVersionedForm(form))
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "保存できませんでした。");
        syncSlideVersion(result.version);
        form.dataset.dirty = "false";
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
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:set-position",
        slide: Number(new URL(slideFrame.src).searchParams.get("slide") || 1),
        step: currentStep
      }, location.origin);
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

  if (slideFrame instanceof HTMLIFrameElement) {
    slideFrame.addEventListener("load", () => {
      setFrameLoading(false);
      const step = stepOutput instanceof HTMLOutputElement
        ? Number(stepOutput.value.match(/STEP (\d+)/)?.[1] || 0)
        : 0;
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:set-position",
        slide: Number(new URL(slideFrame.src).searchParams.get("slide") || 1),
        step
      }, location.origin);
    });
    const layoutStatus = document.querySelector("[data-layout-status]");
    const qualitySummary = document.querySelector("[data-quality-summary]");
    const qualityList = document.querySelector("[data-quality-list]");
    addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== slideFrame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "ultimate-freestyle:render-diagnostics" || !Array.isArray(data.overflows)) return;
      const overflows = data.overflows.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.overflow_x) && Number.isFinite(item.overflow_y));
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = overflows.length
          ? overflows.length + "か所で文字が収まりません。品質確認から対象を確認してください。"
          : "このSTEPの文字は16:9の枠内に収まっています。";
        layoutStatus.dataset.level = overflows.length ? "warning" : "ok";
      }
      if (qualityList instanceof HTMLElement) {
        qualityList.querySelectorAll("[data-layout-warning]").forEach((item) => item.remove());
        for (const item of overflows) {
          const row = document.createElement("li");
          row.dataset.layoutWarning = "true";
          row.textContent = item.region + "「" + item.id + "」が横" + Math.ceil(item.overflow_x) + "px・縦" + Math.ceil(item.overflow_y) + "px超過しています。";
          qualityList.append(row);
        }
      }
      if (qualitySummary instanceof HTMLElement && overflows.length) {
        qualitySummary.dataset.level = "warning";
        qualitySummary.textContent = "実表示に" + overflows.length + "件の見切れがあります。";
      }
    });
    try {
      if (slideFrame.contentDocument?.readyState === "complete") setFrameLoading(false);
    } catch {}
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
