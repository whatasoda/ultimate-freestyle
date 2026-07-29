export const DASHBOARD_SCRIPT = String.raw`(() => {
  const apiErrorMessage = (result, fallback) => {
    const messages = {
      AUTH_REQUIRED: "ログインの有効期限が切れました。研究一覧からログインし直してください。",
      PROJECT_VERSION_CONFLICT: "別の画面またはAIから先に更新されました。入力内容を退避してから画面を再読み込みしてください。",
      PROJECT_NOT_FOUND: "研究が見つかりません。研究一覧へ戻って選び直してください。",
      SLIDE_NOT_FOUND: "スライドが見つかりません。画面を再読み込みしてください。",
      TEMPLATE_NOT_FOUND: "templateが見つかりません。画面を再読み込みしてください。",
      VOICE_PROFILE_NOT_FOUND: "選んだ声が見つかりません。声を選び直してください。",
      VOICE_JOB_NOT_FOUND: "音声生成の状況が見つかりません。音声仕上げ画面を再読み込みしてください。",
      ASSET_IN_USE: "この画像はスライドで使用中です。スライドから外してから削除してください。",
      ASSET_NOT_FOUND: "画像が見つかりません。画面を再読み込みしてください。"
    };
    const code = result?.error?.code;
    return (code && messages[code]) || result?.error?.message || fallback;
  };
  const caughtErrorMessage = (error, fallback) => error instanceof TypeError
    ? "サーバーと通信できませんでした。接続を確認して、もう一度お試しください。"
    : error instanceof Error ? error.message : fallback;
  const colorContrast = (first, second) => {
    const luminance = (hex) => {
      const channels = [1, 3, 5].map((index) => {
        const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const values = [luminance(first), luminance(second)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  };
  const setButtonBusy = (button, busy) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = busy;
    if (busy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  };
  const saveState = document.querySelector("[data-save-state]");
  const syncSaveState = () => {
    if (!(saveState instanceof HTMLElement)) return;
    const dirtyCount = document.querySelectorAll('[data-dirty="true"]').length;
    saveState.dataset.state = dirtyCount > 0 ? "dirty" : "saved";
    saveState.textContent = dirtyCount > 0 ? "未保存 " + dirtyCount + "件" : "保存済み";
  };
  const showSavingState = () => {
    if (!(saveState instanceof HTMLElement)) return;
    saveState.dataset.state = "saving";
    saveState.textContent = "保存中…";
  };
  const syncPageVersion = (version) => {
    const value = String(version);
    for (const form of document.querySelectorAll("[data-versioned-form], [data-project-editor]")) {
      if (form instanceof HTMLFormElement) form.dataset.version = value;
    }
    for (const label of document.querySelectorAll("[data-workspace-version], [data-version-label], [data-editor-version]")) {
      if (label instanceof HTMLElement) label.textContent = "v" + value;
    }
    const previewButton = document.querySelector("[data-create-preview]");
    if (previewButton instanceof HTMLButtonElement) previewButton.dataset.version = value;
  };
  const markDraftChanged = () => {
    const publishButton = document.querySelector("[data-publish-preview]");
    if (publishButton instanceof HTMLButtonElement) {
      publishButton.disabled = true;
      publishButton.dataset.publishedCurrent = "false";
      publishButton.textContent = "確認した版を公開";
    }
    const previewStatus = document.querySelector("[data-preview-status]");
    if (previewStatus instanceof HTMLElement && !previewStatus.textContent.includes("要再生成")) {
      previewStatus.textContent += " · 要再生成";
    }
    const publishFeedback = document.querySelector("[data-publish-feedback]");
    if (publishFeedback instanceof HTMLElement) {
      publishFeedback.textContent = "下書きが変わったため、新しいプレビューの確認が必要です。";
      publishFeedback.classList.add("warning");
      publishFeedback.classList.remove("success");
    }
  };
  const projectSearch = document.querySelector("[data-project-search]");
  if (projectSearch instanceof HTMLInputElement) {
    const projectCards = [...document.querySelectorAll("[data-project-card]")];
    const resultCount = document.querySelector("[data-project-count]");
    const emptyResult = document.querySelector("[data-project-search-empty]");
    const filterProjects = () => {
      const query = projectSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const card of projectCards) {
        if (!(card instanceof HTMLElement)) continue;
        const matches = query === "" || (card.dataset.searchText || "").includes(query);
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      if (resultCount instanceof HTMLElement) resultCount.textContent = visible + "件を表示";
      if (emptyResult instanceof HTMLElement) emptyResult.hidden = visible > 0;
    };
    projectSearch.addEventListener("input", filterProjects);
  }
  const editor = document.querySelector("[data-project-editor]");
  if (editor instanceof HTMLFormElement) {
    const feedback = editor.querySelector("[data-editor-feedback]");
    const versionLabel = editor.querySelector("[data-editor-version]");
    const submit = editor.querySelector('button[type="submit"]');
    editor.addEventListener("input", () => { editor.dataset.dirty = "true"; syncSaveState(); });
    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(feedback instanceof HTMLElement)) return;
      setButtonBusy(submit, true);
      showSavingState();
      feedback.textContent = "変更を保存しています…";
      feedback.classList.remove("success", "warning");
      const data = new FormData(editor);
      const nullableText = (name) => String(data.get(name) || "");
      const textList = (name) => String(data.get(name) || "")
        .split(/\n+/)
        .map((value) => value.trim())
        .filter(Boolean);
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
            method: nullableText("method"),
            findings: textList("findings"),
            limitations: textList("limitations")
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "保存できませんでした。"));
        syncPageVersion(result.version);
        editor.dataset.dirty = "false";
        if (versionLabel instanceof HTMLElement) versionLabel.textContent = "v" + result.version;
        feedback.textContent = "v" + result.version + " として保存しました。";
        feedback.classList.add("success");
        markDraftChanged();
        setTimeout(() => location.reload(), 500);
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "保存できませんでした。");
        feedback.classList.remove("success");
        feedback.classList.add("warning");
      } finally {
        setButtonBusy(submit, false);
        syncSaveState();
      }
    });
  }

  const slideEditor = document.querySelector("[data-slide-editor]");
  const typographyEditor = document.querySelector("[data-typography-editor]");
  const templateEditor = document.querySelector("[data-template-editor]");
  const appearanceEditor = document.querySelector("[data-appearance-editor]");
  const narrationSettingsEditor = document.querySelector("[data-narration-settings-editor]");
  const slideFrame = document.querySelector("[data-slide-frame]");
  const frameLoading = document.querySelector("[data-frame-loading]");
  let draftFrameTimer;
  let draftTypographyTimer;
  let draftTemplateTimer;
  let draftAppearanceTimer;
  let draftNarrationTimer;
  let draftSceneTimer;
  const syncSlideDraft = () => {
    if (!(slideEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(slideEditor);
    slideFrame.contentWindow?.postMessage({
      type: "ultimate-freestyle:preview-fields",
      slide_id: slideEditor.dataset.slideId || "",
      title: String(data.get("title") || ""),
      content_markdown: String(data.get("content_markdown") || ""),
      sidebar_markdown: String(data.get("sidebar_markdown") || "")
    }, location.origin);
  };
  if (slideEditor instanceof HTMLFormElement) {
    slideEditor.addEventListener("input", () => {
      clearTimeout(draftFrameTimer);
      draftFrameTimer = setTimeout(syncSlideDraft, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "入力内容をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  const syncTypographyDraft = () => {
    if (!(typographyEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(typographyEditor);
    let presets = {};
    try { presets = JSON.parse(typographyEditor.dataset.typographyPresets || "{}"); } catch {}
    const preset = String(data.get("preset") || "standard");
    const typography = { ...(presets[preset] || {}), preset };
    for (const [field, key] of [
      ["columns", "columns"],
      ["body_scale", "body_scale"],
      ["heading_scale", "heading_scale"],
      ["typography_line_height", "line_height"],
      ["paragraph_spacing_em", "paragraph_spacing_em"],
      ["column_gap_em", "column_gap_em"]
    ]) {
      const value = String(data.get(field) ?? "").trim();
      if (value !== "" && Number.isFinite(Number(value))) typography[key] = Number(value);
    }
    for (const key of ["text_align", "vertical_align"]) {
      const value = String(data.get(key) || "");
      if (value) typography[key] = value;
    }
    slideFrame.contentWindow?.postMessage({
      type: "ultimate-freestyle:preview-typography",
      slide_id: typographyEditor.dataset.slideId || "",
      typography
    }, location.origin);
  };
  if (typographyEditor instanceof HTMLFormElement) {
    typographyEditor.addEventListener("input", () => {
      clearTimeout(draftTypographyTimer);
      draftTypographyTimer = setTimeout(syncTypographyDraft, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "組版をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  const syncTemplateDraft = () => {
    if (!(templateEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(templateEditor);
    const typographyData = typographyEditor instanceof HTMLFormElement ? new FormData(typographyEditor) : null;
    const mainContrast = colorContrast(String(data.get("background")), String(data.get("foreground")));
    const sidebarContrast = colorContrast(String(data.get("surface")), String(data.get("muted")));
    const contrastStatus = templateEditor.querySelector("[data-contrast-status]");
    if (contrastStatus instanceof HTMLElement) {
      const readable = mainContrast >= 4.5 && sidebarContrast >= 4.5;
      contrastStatus.textContent = "本文 " + mainContrast.toFixed(1) + ":1 · 補足 " + sidebarContrast.toFixed(1) + ":1" + (readable ? " — 標準文字の目安4.5:1以上です。" : " — 4.5:1未満の組み合わせを見直してください。");
      contrastStatus.dataset.level = readable ? "ok" : "warning";
    }
    slideFrame.contentWindow?.postMessage({
      type: "ultimate-freestyle:preview-template",
      slide_id: templateEditor.dataset.slideId || "",
      template: {
        region_layout: String(data.get("region_layout") || "sidebar-right"),
        sidebar_width_percent: Number(data.get("sidebar_width_percent")),
        background: String(data.get("background") || "#111827"),
        surface: String(data.get("surface") || "#05080d"),
        foreground: String(data.get("foreground") || "#f8fafc"),
        muted: String(data.get("muted") || "#a9b5c7"),
        accent: String(data.get("accent") || "#ffcf32"),
        accent_secondary: String(data.get("accent_secondary") || "#ffcf32"),
        border: String(data.get("border") || "#334155"),
        corner_radius_px: Number(data.get("corner_radius_px")),
        spacing_scale: Number(data.get("spacing_scale")),
        font_scale: Number(data.get("font_scale")),
        enter_animation: String(data.get("enter_animation") || "fade"),
        visual_preset: String(data.get("visual_preset") || "studio"),
        body_font: String(data.get("body_font") || "system-sans"),
        heading_font: String(data.get("heading_font") || "system-sans"),
        density: String(data.get("density") || "comfortable"),
        motion_style: String(data.get("motion_style") || "calm"),
        body_weight: Number(data.get("body_weight")),
        heading_weight: Number(data.get("heading_weight")),
        line_height: Number(data.get("line_height")),
        letter_spacing_em: Number(data.get("letter_spacing_em")),
        apply_line_height: typographyData?.get("preset") === "standard" && String(typographyData.get("typography_line_height") || "") === ""
      }
    }, location.origin);
  };
  if (templateEditor instanceof HTMLFormElement) {
    templateEditor.addEventListener("input", () => {
      clearTimeout(draftTemplateTimer);
      draftTemplateTimer = setTimeout(syncTemplateDraft, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "templateをプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  const syncAppearanceDraft = () => {
    if (!(appearanceEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(appearanceEditor);
    let templates = {};
    try { templates = JSON.parse(appearanceEditor.dataset.previewTemplates || "{}"); } catch {}
    const templateId = String(data.get("template_id") || "");
    const template = templates[templateId] || templates[""] || {};
    slideFrame.contentWindow?.postMessage({
      type: "ultimate-freestyle:preview-appearance",
      slide_id: appearanceEditor.dataset.slideId || "",
      role: String(data.get("role") || "content"),
      cover_layout: String(data.get("cover_layout") || "center"),
      tone: String(data.get("tone") || "dark"),
      enter_animation: String(data.get("enter_animation") || template.enter_animation || "fade"),
      template
    }, location.origin);
  };
  if (appearanceEditor instanceof HTMLFormElement) {
    appearanceEditor.addEventListener("input", () => {
      clearTimeout(draftAppearanceTimer);
      draftAppearanceTimer = setTimeout(syncAppearanceDraft, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "スライド外観をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  const syncNarrationDrafts = () => {
    if (!(slideFrame instanceof HTMLIFrameElement)) return;
    if (narrationSettingsEditor instanceof HTMLFormElement) {
      const data = new FormData(narrationSettingsEditor);
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:preview-narration-settings",
        slide_id: narrationSettingsEditor.dataset.slideId || "",
        display: String(data.get("display") || "commentary"),
        speaker: String(data.get("speaker") || ""),
        appearance: {
          placement: String(data.get("placement") || "bottom"),
          size: String(data.get("size") || "normal"),
          text_align: String(data.get("text_align") || "start"),
          speaker_visible: data.has("speaker_visible"),
          progress_visible: data.has("progress_visible"),
          text_scale: Number(data.get("text_scale")),
          max_lines: Number(data.get("max_lines"))
        }
      }, location.origin);
    }
    for (const form of document.querySelectorAll("[data-segment-editor]")) {
      if (!(form instanceof HTMLFormElement)) continue;
      const data = new FormData(form);
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:preview-narration-segment",
        slide_id: form.dataset.slideId || "",
        at: Number(form.dataset.segmentAt || 0),
        text: String(data.get("text") || ""),
        speaker: String(data.get("speaker") || "")
      }, location.origin);
    }
  };
  const scheduleNarrationDraft = () => {
    clearTimeout(draftNarrationTimer);
    draftNarrationTimer = setTimeout(syncNarrationDrafts, 120);
    const layoutStatus = document.querySelector("[data-layout-status]");
    if (layoutStatus instanceof HTMLElement) {
      layoutStatus.textContent = "読み上げ枠をプレビューへ反映しています…";
      layoutStatus.dataset.level = "";
    }
  };
  narrationSettingsEditor?.addEventListener("input", scheduleNarrationDraft);
  for (const form of document.querySelectorAll("[data-segment-editor]")) form.addEventListener("input", scheduleNarrationDraft);
  const setFrameLoading = (loading) => {
    if (frameLoading instanceof HTMLElement) frameLoading.hidden = !loading;
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
  const sceneComponentFromForm = (form) => {
    let component = {};
    try { component = JSON.parse(form.dataset.component || "{}"); } catch {}
    for (const field of form.querySelectorAll("[data-component-field]")) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
      const path = (field.dataset.componentPath || field.name).split(".");
      let owner = component;
      for (const segment of path.slice(0, -1)) {
        if (!owner || typeof owner !== "object") break;
        owner = owner[Number.isInteger(Number(segment)) ? Number(segment) : segment];
      }
      if (!owner || typeof owner !== "object") continue;
      const key = path.at(-1);
      if (key === undefined) continue;
      owner[key] = field.dataset.componentNumber === "true"
        ? Number(field.value)
        : field.dataset.nullable === "true" && field.value.trim() === ""
        ? null
        : field.value;
    }
    return component;
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
      enter_animation: String(data.get("enter_animation") || "") || null,
      role: String(data.get("role") || "content"),
      cover_layout: String(data.get("cover_layout") || "center")
    });
    if (form.matches("[data-typography-editor]")) Object.assign(body, {
      typography: {
        preset: String(data.get("preset") || "standard"),
        columns: optionalNumberValue(data, "columns"),
        body_scale: optionalNumberValue(data, "body_scale"),
        heading_scale: optionalNumberValue(data, "heading_scale"),
        line_height: optionalNumberValue(data, "typography_line_height"),
        paragraph_spacing_em: optionalNumberValue(data, "paragraph_spacing_em"),
        column_gap_em: optionalNumberValue(data, "column_gap_em"),
        text_align: String(data.get("text_align") || "") || undefined,
        vertical_align: String(data.get("vertical_align") || "") || undefined
      }
    });
    if (form.matches("[data-scene-component-editor]")) {
      Object.assign(body, { component: sceneComponentFromForm(form) });
    }
    if (form.matches("[data-deck-editor]")) Object.assign(body, {
      aspect_ratio: String(data.get("aspect_ratio") || "16:9"),
      loading_screen: {
        enabled: data.has("loading_enabled"),
        style: String(data.get("loading_style") || "pulse"),
        message: String(data.get("loading_message") || ""),
        show_progress: data.has("loading_show_progress"),
        minimum_duration_ms: numberValue(data, "loading_minimum_duration_ms")
      }
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
      accent_secondary: String(data.get("accent_secondary") || ""),
      border: String(data.get("border") || ""),
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
    if (form.matches("[data-template-create]")) Object.assign(body, {
      template_id: String(data.get("template_id") || ""),
      name: String(data.get("name") || ""),
      visual_preset: String(data.get("visual_preset") || "studio"),
      source_template_id: String(data.get("source_template_id") || "") || null,
      make_default: data.has("make_default")
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
    form.addEventListener("input", () => { form.dataset.dirty = "true"; syncSaveState(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = form.querySelector("[data-form-feedback]");
      const submitButtons = [...form.querySelectorAll('button[type="submit"]')];
      const nextUrl = event.submitter instanceof HTMLButtonElement
        ? event.submitter.dataset.saveNext
        : undefined;
      if (!(feedback instanceof HTMLElement)) return;
      for (const button of submitButtons) {
        setButtonBusy(button, true);
      }
      showSavingState();
      feedback.textContent = "変更を保存しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(form.action, {
          method: form.dataset.method || "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": form.dataset.csrf || ""
          },
          body: JSON.stringify(serializeVersionedForm(form))
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "保存できませんでした。"));
        syncPageVersion(result.version);
        form.dataset.dirty = "false";
        if (form.matches("[data-template-create]")) {
          location.reload();
          return;
        }
        feedback.textContent = "v" + result.version + " として保存し、実表示を更新しました。";
        feedback.classList.add("success");
        if (form.matches("[data-segment-editor]") && result.voice_generation_required) {
          const audioState = form.querySelector(".audio-state");
          if (audioState instanceof HTMLElement) {
            audioState.textContent = "再生成が必要";
            audioState.classList.remove("ready");
          }
          feedback.textContent = "v" + result.version + " として保存しました。VOICEVOX音声を再生成してください。";
          feedback.classList.remove("success");
          feedback.classList.add("warning");
        }
        markDraftChanged();
        if (nextUrl) {
          location.href = nextUrl;
          return;
        }
        refreshSlideFrame(result.version);
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "保存できませんでした。");
        feedback.classList.add("warning");
      } finally {
        for (const button of submitButtons) {
          setButtonBusy(button, false);
        }
        syncSaveState();
      }
    });
  }

  const syncSceneComponentDrafts = () => {
    if (!(slideFrame instanceof HTMLIFrameElement)) return;
    for (const form of document.querySelectorAll("[data-scene-component-editor]")) {
      if (!(form instanceof HTMLFormElement)) continue;
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:preview-scene-component",
        slide_id: slideEditor instanceof HTMLFormElement ? slideEditor.dataset.slideId || "" : "",
        component: sceneComponentFromForm(form)
      }, location.origin);
    }
  };
  for (const form of document.querySelectorAll("[data-scene-component-editor]")) {
    form.addEventListener("input", () => {
      clearTimeout(draftSceneTimer);
      draftSceneTimer = setTimeout(syncSceneComponentDrafts, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "componentの文言をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }

  for (const field of document.querySelectorAll('textarea[maxlength], input[maxlength]:not([type]), input[type="text"][maxlength]')) {
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) continue;
    const counter = document.createElement("span");
    counter.className = "character-count";
    counter.setAttribute("aria-hidden", "true");
    const updateCounter = () => {
      counter.textContent = field.value.length.toLocaleString() + " / " + Number(field.maxLength).toLocaleString() + "字";
      counter.dataset.nearLimit = String(field.value.length >= field.maxLength * 0.9);
    };
    field.insertAdjacentElement("afterend", counter);
    field.addEventListener("input", updateCounter);
    updateCounter();
  }

  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
    const target = event.target;
    const form = target instanceof Element ? target.closest("form") : null;
    if (!(form instanceof HTMLFormElement) || form.dataset.dirty !== "true") return;
    if (!form.matches("[data-versioned-form], [data-project-editor]")) return;
    event.preventDefault();
    form.requestSubmit();
  });

  for (const button of document.querySelectorAll("[data-markdown-action]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const field = form?.elements.namedItem(button.dataset.markdownTarget || "");
      if (!(field instanceof HTMLTextAreaElement)) return;
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const selected = field.value.slice(start, end);
      const action = button.dataset.markdownAction;
      let replacement = selected;
      let selectionStart = start;
      let selectionEnd = end;
      if (action === "bold") {
        const content = selected || "強調する文";
        replacement = "**" + content + "**";
        selectionStart = start + 2;
        selectionEnd = selectionStart + content.length;
      } else {
        const prefix = action === "heading" ? "## " : action === "number" ? "1. " : "- ";
        const lineStart = field.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const lines = field.value.slice(lineStart, end).split("\n");
        replacement = lines.map((line) => prefix + line).join("\n");
        field.setRangeText(replacement, lineStart, end, "end");
        selectionStart = lineStart;
        selectionEnd = lineStart + replacement.length;
        field.focus();
        field.setSelectionRange(selectionStart, selectionEnd);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      field.setRangeText(replacement, start, end, "end");
      field.focus();
      field.setSelectionRange(selectionStart, selectionEnd);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const activeFilmstripSlide = document.querySelector('.filmstrip-link[data-active="true"]');
  if (activeFilmstripSlide instanceof HTMLElement) {
    activeFilmstripSlide.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const filmstripSearch = document.querySelector("[data-filmstrip-search]");
  if (filmstripSearch instanceof HTMLInputElement) {
    const filmstripSlides = [...document.querySelectorAll("[data-filmstrip-slide]")];
    const filmstripEmpty = document.querySelector("[data-filmstrip-empty]");
    const filterFilmstrip = () => {
      const query = filmstripSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const link of filmstripSlides) {
        if (!(link instanceof HTMLElement)) continue;
        const matches = query === "" || (link.dataset.searchText || "").includes(query);
        link.hidden = !matches;
        if (matches) visible += 1;
      }
      if (filmstripEmpty instanceof HTMLElement) filmstripEmpty.hidden = visible > 0;
    };
    filmstripSearch.addEventListener("input", filterFilmstrip);
    filmstripSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      filmstripSearch.value = "";
      filterFilmstrip();
      filmstripSearch.blur();
    });
  }

  for (const button of document.querySelectorAll("[data-slide-action]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const action = button.dataset.slideAction || "";
      const feedback = document.querySelector("[data-slide-action-feedback]");
      const versionedForm = document.querySelector("[data-versioned-form]");
      if (!(feedback instanceof HTMLElement) || !(versionedForm instanceof HTMLFormElement)) return;
      const dirty = document.querySelector('[data-dirty="true"]') !== null;
      const message = action === "delete"
        ? dirty
          ? "未保存の入力を破棄し、このスライドを削除しますか？"
          : "このスライドを削除しますか？この操作は元に戻せません。"
        : dirty
          ? "未保存の入力を破棄してスライド構成を変更しますか？"
          : "";
      if (message && !confirm(message)) return;
      setButtonBusy(button, true);
      feedback.textContent = action === "duplicate"
        ? "スライドを複製しています…"
        : action === "delete"
          ? "スライドを削除しています…"
          : "スライドを移動しています…";
      feedback.classList.remove("success", "warning");
      try {
        const body = {
          expected_version: Number(versionedForm.dataset.version),
          action
        };
        if (action === "move") body.position = Number(button.dataset.position);
        const response = await fetch(button.dataset.actionUrl || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": button.dataset.csrf || ""
          },
          body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "スライドを操作できませんでした。"));
        feedback.textContent = "構成を更新しました。画面を切り替えます…";
        feedback.classList.add("success");
        for (const form of document.querySelectorAll('[data-dirty="true"]')) {
          if (form instanceof HTMLElement) form.dataset.dirty = "false";
        }
        location.href = result.next_url;
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "スライドを操作できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  const inspectorStateKey = "ultimate-freestyle:workspace-inspector";
  let inspectorState = {};
  try { inspectorState = JSON.parse(localStorage.getItem(inspectorStateKey) || "{}"); } catch {}
  for (const details of document.querySelectorAll("[data-inspector-section]")) {
    if (!(details instanceof HTMLDetailsElement)) continue;
    const section = details.dataset.inspectorSection || "";
    if (typeof inspectorState[section] === "boolean") details.open = inspectorState[section];
    details.addEventListener("toggle", () => {
      inspectorState[section] = details.open;
      try { localStorage.setItem(inspectorStateKey, JSON.stringify(inspectorState)); } catch {}
    });
  }

  const previewFocusButton = document.querySelector("[data-preview-focus]");
  if (previewFocusButton instanceof HTMLButtonElement) {
    const previewFocusKey = "ultimate-freestyle:workspace-preview-focus";
    const setPreviewFocus = (enabled) => {
      document.body.dataset.previewFocus = String(enabled);
      previewFocusButton.setAttribute("aria-pressed", String(enabled));
      previewFocusButton.textContent = enabled ? "編集欄を戻す" : "プレビューを広げる";
      try { localStorage.setItem(previewFocusKey, String(enabled)); } catch {}
    };
    let initialPreviewFocus = false;
    try { initialPreviewFocus = localStorage.getItem(previewFocusKey) === "true"; } catch {}
    setPreviewFocus(initialPreviewFocus);
    previewFocusButton.addEventListener("click", () => {
      setPreviewFocus(document.body.dataset.previewFocus !== "true");
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
      syncNarrationDrafts();
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
    const syncFramePosition = () => {
      const step = stepOutput instanceof HTMLOutputElement
        ? Number(stepOutput.value.match(/STEP (\d+)/)?.[1] || 0)
        : 0;
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:set-position",
        slide: Number(new URL(slideFrame.src).searchParams.get("slide") || 1),
        step
      }, location.origin);
    };
    slideFrame.addEventListener("load", () => {
      setFrameLoading(false);
      syncFramePosition();
      syncSlideDraft();
      syncTypographyDraft();
      syncTemplateDraft();
      syncAppearanceDraft();
      syncNarrationDrafts();
      syncSceneComponentDrafts();
    });
    const layoutStatus = document.querySelector("[data-layout-status]");
    const qualitySummary = document.querySelector("[data-quality-summary]");
    const qualityList = document.querySelector("[data-quality-list]");
    const diagnosticTarget = (id) => {
      let sectionName = "structure";
      let target = null;
      if (id.startsWith("node:")) {
        const componentId = id.slice(5);
        target = [...document.querySelectorAll("[data-scene-component-editor]")].find((form) => form instanceof HTMLFormElement && form.dataset.componentId === componentId) || null;
      } else if (id === "flow:main" || id === "flow:sidebar") {
        sectionName = "content";
        target = document.querySelector("[data-slide-editor]");
      } else if (id === "narration") {
        sectionName = "narration";
        target = document.querySelector("[data-narration-settings-editor]");
      }
      const section = document.querySelector('[data-inspector-section="' + sectionName + '"]');
      return { section, target: target || section };
    };
    const appendDiagnostic = (item, message) => {
      if (!(qualityList instanceof HTMLElement)) return;
      const row = document.createElement("li");
      row.dataset.layoutWarning = "true";
      row.append(document.createTextNode(message));
      const { section, target } = diagnosticTarget(item.id);
      if (section instanceof HTMLDetailsElement && target instanceof HTMLElement) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost";
        button.dataset.diagnosticFix = "true";
        button.textContent = "修正欄へ";
        button.addEventListener("click", () => {
          section.open = true;
          const componentDetail = target.closest("details.component-detail");
          if (componentDetail instanceof HTMLDetailsElement) componentDetail.open = true;
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          const field = target.querySelector("textarea, input, select");
          if (field instanceof HTMLElement) field.focus({ preventScroll: true });
        });
        row.append(button);
      }
      qualityList.append(row);
    };
    addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== slideFrame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "ultimate-freestyle:render-diagnostics" || !Array.isArray(data.overflows)) return;
      const overflows = data.overflows.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.overflow_x) && Number.isFinite(item.overflow_y));
      const compressed = Array.isArray(data.fits)
        ? data.fits.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.fit_scale) && item.fit_scale < 0.7)
        : [];
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = overflows.length
          ? overflows.length + "か所で文字が収まりません。品質確認から対象を確認してください。"
          : compressed.length
            ? compressed.length + "か所の文字を70%未満まで縮小しています。組版か文章量を見直してください。"
          : "このSTEPの文字は" + (slideFrame.dataset.aspectRatio || "16:9") + "の枠内に収まっています。";
        layoutStatus.dataset.level = overflows.length || compressed.length ? "warning" : "ok";
      }
      if (qualityList instanceof HTMLElement) {
        qualityList.querySelectorAll("[data-layout-warning]").forEach((item) => item.remove());
        for (const item of overflows) {
          appendDiagnostic(item, item.region + "「" + item.id + "」が横" + Math.ceil(item.overflow_x) + "px・縦" + Math.ceil(item.overflow_y) + "px超過しています。");
        }
        for (const item of compressed) {
          appendDiagnostic(item, item.region + "「" + item.id + "」を" + Math.round(item.fit_scale * 100) + "%まで自動縮小しています。");
        }
      }
      if (qualitySummary instanceof HTMLElement) {
        const baseCount = Number(qualitySummary.dataset.baseCount || 0);
        const total = baseCount + overflows.length + compressed.length;
        qualitySummary.dataset.level = total ? "warning" : "ok";
        qualitySummary.textContent = overflows.length
          ? total + "件の確認事項があります（うち見切れ" + overflows.length + "件）。"
          : compressed.length
            ? total + "件の確認事項があります（うち過剰な自動縮小" + compressed.length + "件）。"
          : baseCount
            ? baseCount + "件の確認事項があります。"
            : "保存データ上の確認事項はありません。";
      }
    });
    try {
      if (slideFrame.contentDocument?.readyState === "complete") {
        setFrameLoading(false);
        queueMicrotask(syncFramePosition);
      }
    } catch {}
  }

  for (const button of document.querySelectorAll("[data-copy-text]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const feedback = button.parentElement?.querySelector("[data-copy-feedback]");
      try {
        await navigator.clipboard.writeText(button.dataset.copyText || "");
        if (feedback instanceof HTMLElement) feedback.textContent = button.dataset.copySuccess || "AIに貼り付ける文をコピーしました。";
      } catch {
        if (feedback instanceof HTMLElement) feedback.textContent = "コピーできませんでした。文を選択してコピーしてください。";
      }
    });
  }

  addEventListener("beforeunload", (event) => {
    if (!document.querySelector('[data-dirty="true"]')) return;
    event.preventDefault();
    event.returnValue = "";
  });
  syncSaveState();

  for (const button of document.querySelectorAll("[data-segment-speech-preview]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
        const feedback = button.closest("form")?.querySelector("[data-form-feedback]");
        if (feedback instanceof HTMLElement) feedback.textContent = "このブラウザでは音声の仮試聴を利用できません。";
        return;
      }
      if (button.getAttribute("aria-pressed") === "true") {
        speechSynthesis.cancel();
        button.setAttribute("aria-pressed", "false");
        button.textContent = "ブラウザで仮試聴";
        return;
      }
      speechSynthesis.cancel();
      for (const other of document.querySelectorAll("[data-segment-speech-preview]")) {
        if (other instanceof HTMLButtonElement) {
          other.setAttribute("aria-pressed", "false");
          other.textContent = "ブラウザで仮試聴";
        }
      }
      const form = button.closest("[data-segment-editor]");
      if (!(form instanceof HTMLFormElement)) return;
      const data = new FormData(form);
      let effective = {};
      try { effective = JSON.parse(form.dataset.effectiveTuning || "{}"); } catch {}
      const tuningValue = (name, fallback) => {
        const value = String(data.get("tuning_" + name) ?? "").trim();
        return value === "" || !Number.isFinite(Number(value)) ? Number(fallback) : Number(value);
      };
      const utterance = new SpeechSynthesisUtterance(String(data.get("text") || ""));
      utterance.lang = "ja-JP";
      utterance.rate = Math.min(2, Math.max(0.5, tuningValue("speedScale", effective.speedScale ?? 1)));
      utterance.pitch = Math.min(2, Math.max(0.5, 1 + tuningValue("pitchScale", effective.pitchScale ?? 0) * 2));
      utterance.volume = Math.min(1, Math.max(0, tuningValue("volumeScale", effective.volumeScale ?? 1)));
      const japaneseVoice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ja"));
      if (japaneseVoice) utterance.voice = japaneseVoice;
      const finish = () => {
        button.setAttribute("aria-pressed", "false");
        button.textContent = "ブラウザで仮試聴";
      };
      utterance.addEventListener("end", finish, { once: true });
      utterance.addEventListener("error", finish, { once: true });
      button.setAttribute("aria-pressed", "true");
      button.textContent = "試聴を停止";
      speechSynthesis.speak(utterance);
    });
  }

  const voicePage = document.querySelector("[data-voice-page]");
  if (voicePage instanceof HTMLElement) {
    const csrf = voicePage.dataset.csrf || "";
    const setupButton = voicePage.querySelector("[data-voice-setup]");
    const profileSelect = voicePage.querySelector("[data-voice-profile]");
    const setupFeedback = voicePage.querySelector("[data-voice-setup-feedback]");
    const profileTuningForm = voicePage.querySelector("[data-voice-profile-tuning]");
    const generateButton = voicePage.querySelector("[data-voice-generate]");
    const generateFeedback = voicePage.querySelector("[data-voice-generate-feedback]");
    const jobCard = voicePage.querySelector("[data-voice-job]");
    const terminalStatuses = new Set(["completed", "partially_failed", "failed", "cancelled"]);
    const jobLabels = {
      queued: "生成待ち",
      starting: "音声エンジン準備中",
      starting_engine: "音声エンジン準備中",
      running: "音声を生成中",
      synthesizing: "音声を生成中",
      encoding: "MP3へ変換中",
      storing: "音声を保存中",
      attaching: "発表へ反映中",
      completed: "生成完了",
      partially_failed: "一部の生成に失敗",
      failed: "生成に失敗",
      cancelled: "キャンセル済み"
    };
    const safeStatusUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        return url.origin === location.origin ? url.toString() : null;
      } catch {
        return null;
      }
    };
    const updateJob = (job) => {
      if (!(jobCard instanceof HTMLElement) || !job || typeof job.status !== "string") return;
      const total = Number(job.total_segments || 0);
      const completed = Number(job.completed_segments || 0);
      const failed = Number(job.failed_segments || 0);
      const cached = Number(job.cached_segments || 0);
      const status = job.status;
      const label = jobLabels[status] || status;
      jobCard.dataset.state = status;
      const labelNode = jobCard.querySelector("[data-job-label]");
      const statusNode = jobCard.querySelector("[data-job-status]");
      const progress = jobCard.querySelector("[data-job-progress]");
      const totalNode = jobCard.querySelector("[data-job-total]");
      const completedNode = jobCard.querySelector("[data-job-completed]");
      const failedNode = jobCard.querySelector("[data-job-failed]");
      const cachedNode = jobCard.querySelector("[data-job-cached]");
      const feedback = jobCard.querySelector("[data-job-feedback]");
      if (labelNode instanceof HTMLElement) labelNode.textContent = label;
      if (statusNode instanceof HTMLElement) {
        statusNode.textContent = label;
        statusNode.className = "voice-status " + status;
      }
      if (progress instanceof HTMLProgressElement) {
        progress.max = Math.max(1, total);
        progress.value = Math.min(total, completed + failed);
      }
      if (totalNode instanceof HTMLElement) totalNode.textContent = String(total);
      if (completedNode instanceof HTMLElement) completedNode.textContent = String(completed);
      if (failedNode instanceof HTMLElement) failedNode.textContent = String(failed);
      if (cachedNode instanceof HTMLElement) cachedNode.textContent = String(cached);
      if (feedback instanceof HTMLElement) {
        feedback.textContent = status === "completed"
          ? "生成が完了しました。音声一覧を更新します…"
          : status === "failed" || status === "partially_failed"
            ? "生成できなかった区間があります。画面を更新して失敗分を再実行できます。"
            : "画面を閉じても生成は続きます。";
        feedback.classList.toggle("warning", status === "failed" || status === "partially_failed");
        feedback.classList.toggle("success", status === "completed");
      }
      if (generateButton instanceof HTMLButtonElement) {
        generateButton.disabled = true;
        generateButton.textContent = terminalStatuses.has(status)
          ? "結果を反映しています"
          : "生成中です";
      }
    };
    let pollTimer;
    let pollFailures = 0;
    const pollJob = async (statusUrl) => {
      const url = safeStatusUrl(statusUrl);
      if (url === null) return;
      clearTimeout(pollTimer);
      try {
        const response = await fetch(url, { headers: { accept: "application/json" } });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "生成状況を取得できませんでした。"));
        const job = result.job || result;
        pollFailures = 0;
        updateJob(job);
        if (terminalStatuses.has(job.status)) {
          setTimeout(() => location.reload(), job.status === "completed" ? 800 : 1200);
          return;
        }
        pollTimer = setTimeout(() => pollJob(url), document.hidden ? 8000 : 2500);
      } catch (error) {
        pollFailures += 1;
        const feedback = jobCard?.querySelector("[data-job-feedback]");
        if (feedback instanceof HTMLElement) {
          feedback.textContent = "生成は継続しています。通信を確認して再接続します…";
          feedback.classList.add("warning");
        }
        pollTimer = setTimeout(() => pollJob(url), Math.min(15000, 2000 * 2 ** pollFailures));
      }
    };
    if (setupButton instanceof HTMLButtonElement) {
      const initialProfileId = profileSelect instanceof HTMLSelectElement ? profileSelect.value : "";
      setupButton.addEventListener("click", async () => {
        const selectedLabel = profileSelect instanceof HTMLSelectElement
          ? profileSelect.selectedOptions[0]?.textContent || "選択した声"
          : "選択した声";
        const changingConfiguredVoice = voicePage.dataset.voiceConfigured === "true" &&
          profileSelect instanceof HTMLSelectElement && profileSelect.value !== initialProfileId;
        if (changingConfiguredVoice && !confirm("既定の声を「" + selectedLabel + "」へ変更しますか？生成済みの区間は新しい声で再生成が必要になります。")) return;
        setupButton.disabled = true;
        if (setupFeedback instanceof HTMLElement) setupFeedback.textContent = selectedLabel + "を設定しています…";
        try {
          const response = await fetch(setupButton.dataset.voiceSetup || "", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({
              expected_version: Number(voicePage.dataset.version),
              profile_id: profileSelect instanceof HTMLSelectElement ? profileSelect.value : "voicevox-style-3"
            })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "声を設定できませんでした。"));
          if (setupFeedback instanceof HTMLElement) {
            setupFeedback.textContent = "設定しました。音声の状態を更新します…";
            setupFeedback.classList.add("success");
          }
          setTimeout(() => location.reload(), 500);
        } catch (error) {
          setupButton.disabled = false;
          if (setupFeedback instanceof HTMLElement) {
            setupFeedback.textContent = caughtErrorMessage(error, "声を設定できませんでした。");
            setupFeedback.classList.add("warning");
          }
        }
      });
    }
    if (profileTuningForm instanceof HTMLFormElement) {
      const tuningFeedback = profileTuningForm.querySelector("[data-voice-profile-tuning-feedback]");
      const tuningSubmit = profileTuningForm.querySelector('button[type="submit"]');
      const tuningPreview = profileTuningForm.querySelector("[data-voice-profile-tuning-preview]");
      profileTuningForm.addEventListener("input", () => { profileTuningForm.dataset.dirty = "true"; });
      if (tuningPreview instanceof HTMLButtonElement) {
        tuningPreview.addEventListener("click", () => {
          if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
            if (tuningFeedback instanceof HTMLElement) tuningFeedback.textContent = "このブラウザでは音声の仮試聴を利用できません。";
            return;
          }
          if (tuningPreview.getAttribute("aria-pressed") === "true") {
            speechSynthesis.cancel();
            tuningPreview.setAttribute("aria-pressed", "false");
            tuningPreview.textContent = "ブラウザで仮試聴";
            if (tuningFeedback instanceof HTMLElement) tuningFeedback.textContent = "仮試聴を停止しました。";
            return;
          }
          speechSynthesis.cancel();
          const data = new FormData(profileTuningForm);
          const clampValue = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value)));
          const utterance = new SpeechSynthesisUtterance("これは最自由研究の読み上げテストです。聞き取りやすい速さと高さを確認してください。");
          utterance.lang = "ja-JP";
          utterance.rate = clampValue(data.get("tuning_speedScale"), 0.5, 2);
          utterance.pitch = clampValue(1 + Number(data.get("tuning_pitchScale")) * 2, 0.5, 2);
          utterance.volume = clampValue(data.get("tuning_volumeScale"), 0, 1);
          const finish = () => {
            tuningPreview.setAttribute("aria-pressed", "false");
            tuningPreview.textContent = "ブラウザで仮試聴";
          };
          utterance.addEventListener("end", finish, { once: true });
          utterance.addEventListener("error", finish, { once: true });
          tuningPreview.setAttribute("aria-pressed", "true");
          tuningPreview.textContent = "仮試聴を停止";
          if (tuningFeedback instanceof HTMLElement) tuningFeedback.textContent = "話速・高さ・音量をブラウザ音声で近似しています…";
          speechSynthesis.speak(utterance);
        });
      }
      profileTuningForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!(tuningFeedback instanceof HTMLElement)) return;
        const readyCount = Number(voicePage.dataset.voiceReady || 0);
        if (readyCount > 0 && !confirm("既定のトーンを変更しますか？生成済みの" + readyCount + "区間は再生成が必要になります。")) return;
        setButtonBusy(tuningSubmit, true);
        tuningFeedback.textContent = "既定のトーンを保存しています…";
        tuningFeedback.classList.remove("warning", "success");
        const data = new FormData(profileTuningForm);
        const tuning = {};
        for (const key of ["speedScale", "pitchScale", "intonationScale", "volumeScale", "pauseLengthScale", "prePhonemeLength", "postPhonemeLength"]) {
          tuning[key] = Number(data.get("tuning_" + key));
        }
        try {
          const response = await fetch(profileTuningForm.action, {
            method: "PATCH",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({ expected_version: Number(voicePage.dataset.version), tuning })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "既定のトーンを保存できませんでした。"));
          profileTuningForm.dataset.dirty = "false";
          tuningFeedback.textContent = "保存しました。VOICEVOX音声の生成状態を更新します…";
          tuningFeedback.classList.add("success");
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          tuningFeedback.textContent = caughtErrorMessage(error, "既定のトーンを保存できませんでした。");
          tuningFeedback.classList.add("warning");
          setButtonBusy(tuningSubmit, false);
        }
      });
    }
    for (const button of voicePage.querySelectorAll("[data-voice-pick]")) {
      if (!(button instanceof HTMLButtonElement) || !(profileSelect instanceof HTMLSelectElement)) continue;
      button.addEventListener("click", () => {
        profileSelect.value = button.dataset.voicePick || "voicevox-style-3";
        const selected = profileSelect.selectedOptions[0]?.textContent || "選択した声";
        if (setupFeedback instanceof HTMLElement) {
          setupFeedback.textContent = selected + "を選択しました。保存すると発表全体へ適用されます。";
          setupFeedback.classList.remove("success", "warning");
        }
        profileSelect.focus();
      });
    }
    if (generateButton instanceof HTMLButtonElement) {
      generateButton.addEventListener("click", async () => {
        generateButton.disabled = true;
        if (generateFeedback instanceof HTMLElement) {
          generateFeedback.textContent = "生成jobを登録しています…";
          generateFeedback.classList.remove("warning", "success");
        }
        try {
          const response = await fetch(generateButton.dataset.voiceGenerate || "", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({
              expected_version: Number(voicePage.dataset.version),
              idempotency_key: crypto.randomUUID()
            })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "音声生成を開始できませんでした。"));
          const job = result.job || result;
          const statusUrl = result.status_url || job.status_url;
          updateJob({ ...job, status_url: statusUrl });
          if (jobCard instanceof HTMLElement) jobCard.dataset.statusUrl = statusUrl || "";
          if (generateFeedback instanceof HTMLElement) {
            generateFeedback.textContent = "生成を受け付けました。進捗は自動で更新されます。";
            generateFeedback.classList.add("success");
          }
          if (statusUrl) pollJob(statusUrl);
        } catch (error) {
          generateButton.disabled = false;
          if (generateFeedback instanceof HTMLElement) {
            generateFeedback.textContent = caughtErrorMessage(error, "音声生成を開始できませんでした。");
            generateFeedback.classList.add("warning");
          }
        }
      });
    }
    if (jobCard instanceof HTMLElement && !terminalStatuses.has(jobCard.dataset.state || "")) {
      const initialStatusUrl = jobCard.dataset.statusUrl;
      if (initialStatusUrl) pollJob(initialStatusUrl);
    }
    let activePlayer = null;
    let activePreviewButton = null;
    let activePreviewFeedback = null;
    const stopPreview = (message = "") => {
      if (activePlayer) { activePlayer.pause(); activePlayer.removeAttribute("src"); activePlayer.load(); activePlayer = null; }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      if (activePreviewButton instanceof HTMLButtonElement) {
        activePreviewButton.setAttribute("aria-pressed", "false");
        activePreviewButton.textContent = activePreviewButton.dataset.audioUrl ? "生成音声を試聴" : "ブラウザ音声で仮試聴";
      }
      if (activePreviewFeedback instanceof HTMLElement) activePreviewFeedback.textContent = message;
      activePreviewButton = null;
      activePreviewFeedback = null;
    };
    for (const button of voicePage.querySelectorAll("[data-voice-preview]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => {
        if (activePreviewButton === button) { stopPreview("試聴を停止しました。"); return; }
        stopPreview();
        activePreviewButton = button;
        activePreviewFeedback = button.closest("[data-voice-segment]")?.querySelector("[data-voice-preview-feedback]") || null;
        if (activePreviewFeedback instanceof HTMLElement) activePreviewFeedback.textContent = "再生しています…";
        button.setAttribute("aria-pressed", "true");
        button.textContent = "停止";
        const audioUrl = safeStatusUrl(button.dataset.audioUrl || "");
        if (audioUrl !== null && button.dataset.audioUrl) {
          const player = new Audio(audioUrl);
          activePlayer = player;
          player.addEventListener("ended", () => stopPreview("試聴が終わりました。"), { once: true });
          player.addEventListener("error", () => stopPreview("生成音声を再生できませんでした。ページを再読み込みしてお試しください。"), { once: true });
          player.play().catch(() => stopPreview("ブラウザが音声再生を許可しませんでした。もう一度ボタンを押してください。"));
          return;
        }
        if (!("speechSynthesis" in window)) { stopPreview("このブラウザでは音声の仮試聴を利用できません。"); return; }
        const utterance = new SpeechSynthesisUtterance(button.dataset.voiceText || "");
        utterance.lang = "ja-JP";
        utterance.onend = () => stopPreview("仮試聴が終わりました。");
        utterance.onerror = () => stopPreview("ブラウザ音声を再生できませんでした。");
        speechSynthesis.speak(utterance);
      });
    }
    const segmentFilters = [...voicePage.querySelectorAll("[data-voice-filter]")];
    const voiceFilterEmpty = voicePage.querySelector("[data-voice-filter-empty]");
    for (const filterButton of segmentFilters) {
      if (!(filterButton instanceof HTMLButtonElement)) continue;
      filterButton.addEventListener("click", () => {
        const filter = filterButton.dataset.voiceFilter || "all";
        for (const button of segmentFilters) {
          if (button instanceof HTMLButtonElement) button.setAttribute("aria-pressed", String(button === filterButton));
        }
        let visible = 0;
        for (const segment of voicePage.querySelectorAll("[data-voice-segment]")) {
          if (!(segment instanceof HTMLElement)) continue;
          const state = segment.dataset.state || "";
          const matches = filter === "all" || state === filter ||
            (filter === "needs_generation" && ["queued", "running", "generating"].includes(state));
          segment.hidden = !matches;
          if (matches) visible += 1;
        }
        if (voiceFilterEmpty instanceof HTMLElement) voiceFilterEmpty.hidden = visible > 0;
      });
    }
    addEventListener("pagehide", () => stopPreview(), { once: true });
  }

  const previewButton = document.querySelector("[data-create-preview]");
  const publishButton = document.querySelector("[data-publish-preview]");
  const publishFeedback = document.querySelector("[data-publish-feedback]");
  const previewStatus = document.querySelector("[data-preview-status]");
  const publishedStatus = document.querySelector("[data-published-status]");
  const previewLink = document.querySelector("[data-preview-link]");
  const publicLink = document.querySelector("[data-public-link]");
  const copyPublicButton = document.querySelector("[data-copy-public]");
  const copyPublicFeedback = document.querySelector("[data-copy-public-feedback]");
  if (previewButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    previewButton.addEventListener("click", async () => {
      previewButton.disabled = true;
      publishFeedback.textContent = "現在の下書きから固定プレビューを生成しています…";
      publishFeedback.classList.remove("warning", "success");
      const previewWindow = window.open("", "_blank");
      if (previewWindow) {
        previewWindow.document.documentElement.lang = "ja";
        previewWindow.document.title = "プレビューを準備中 — 最自由研究";
        const waiting = previewWindow.document.createElement("main");
        waiting.setAttribute("aria-live", "polite");
        waiting.textContent = "固定プレビューを準備しています…";
        Object.assign(previewWindow.document.body.style, {
          margin: "0",
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#090f18",
          color: "#eef3fa",
          fontFamily: 'Inter, "Noto Sans JP", system-ui, sans-serif',
          fontSize: "clamp(1rem, 3vw, 1.4rem)"
        });
        previewWindow.document.body.append(waiting);
      }
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
        if (!response.ok) throw new Error(apiErrorMessage(result, "プレビューを作成できませんでした。"));
        publishFeedback.textContent = "プレビューを作成しました。文字の見切れ、読み上げ、自動送り、最後の終了画面まで確認してください。";
        publishFeedback.classList.add("success");
        if (publishButton instanceof HTMLButtonElement) {
          publishButton.dataset.revision = result.revision.revision_id;
          publishButton.disabled = publishButton.dataset.durationValid !== "true" || publishButton.dataset.publishedCurrent === "true";
        }
        if (previewStatus instanceof HTMLElement) {
          previewStatus.textContent = "v" + result.revision.project_version + " · " + result.revision.renderer_version;
        }
        if (previewLink instanceof HTMLAnchorElement) {
          previewLink.href = result.preview_url;
          previewLink.hidden = false;
        }
        if (previewWindow) previewWindow.location.href = result.preview_url;
        else window.open(result.preview_url, "_blank", "noopener");
      } catch (error) {
        previewWindow?.close();
        publishFeedback.textContent = caughtErrorMessage(error, "プレビューを作成できませんでした。");
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
        if (!response.ok) throw new Error(apiErrorMessage(result, "公開できませんでした。"));
        publishFeedback.textContent = "公開しました: " + result.public_url;
        publishFeedback.classList.add("success");
        if (publishedStatus instanceof HTMLElement && result.publication?.published) {
          publishedStatus.textContent = "v" + result.publication.published.project_version + " · " + result.publication.published.renderer_version;
        }
        if (publicLink instanceof HTMLAnchorElement && result.public_url) {
          publicLink.href = result.public_url;
          publicLink.hidden = false;
        }
        publishButton.dataset.publishedCurrent = "true";
        publishButton.textContent = "この版は公開済み";
        if (copyPublicButton instanceof HTMLButtonElement) copyPublicButton.hidden = false;
      } catch (error) {
        publishFeedback.textContent = caughtErrorMessage(error, "公開できませんでした。");
        publishFeedback.classList.add("warning");
        publishButton.disabled = false;
      }
    });
  }
  if (copyPublicButton instanceof HTMLButtonElement && publicLink instanceof HTMLAnchorElement) {
    copyPublicButton.addEventListener("click", async () => {
      if (publicLink.hidden || publicLink.getAttribute("href") === "#") return;
      try {
        await navigator.clipboard.writeText(new URL(publicLink.href, location.origin).href);
        if (copyPublicFeedback instanceof HTMLElement) copyPublicFeedback.textContent = "公開URLをコピーしました。";
      } catch {
        if (copyPublicFeedback instanceof HTMLElement) copyPublicFeedback.textContent = "コピーできませんでした。公開ページを開いてURLをコピーしてください。";
      }
    });
  }

  const uploadForm = document.querySelector("[data-image-upload]");
  if (uploadForm instanceof HTMLFormElement) {
    const fileInput = uploadForm.querySelector('input[type="file"]');
    const altInput = uploadForm.querySelector('input[name="alt_text"]');
    const feedback = uploadForm.querySelector("[data-feedback]");
    const submit = uploadForm.querySelector('button[type="submit"]');
    const preview = uploadForm.querySelector("[data-upload-preview]");
    const previewImage = uploadForm.querySelector("[data-upload-preview-image]");
    const previewName = uploadForm.querySelector("[data-upload-preview-name]");
    const previewMeta = uploadForm.querySelector("[data-upload-preview-meta]");
    const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    let previewObjectUrl;
    const updateImagePreview = () => {
      if (!(fileInput instanceof HTMLInputElement) || !(feedback instanceof HTMLElement)) return;
      const file = fileInput.files?.[0];
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = undefined;
      if (!file) {
        if (preview instanceof HTMLElement) preview.hidden = true;
        fileInput.setCustomValidity("");
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
        return;
      }
      const error = !acceptedImageTypes.has(file.type)
        ? "JPEG、PNG、静止WebPのいずれかを選んでください。"
        : file.size > 10 * 1024 * 1024
          ? "画像は10MiB以下にしてください。"
          : "";
      fileInput.setCustomValidity(error);
      feedback.textContent = error;
      feedback.classList.toggle("warning", error !== "");
      if (error) {
        if (preview instanceof HTMLElement) preview.hidden = true;
        if (submit instanceof HTMLButtonElement) submit.disabled = true;
        return;
      }
      previewObjectUrl = URL.createObjectURL(file);
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      feedback.textContent = "画像の解像度を確認しています…";
      if (previewImage instanceof HTMLImageElement) {
        const objectUrl = previewObjectUrl;
        previewImage.onload = () => {
          if (previewObjectUrl !== objectUrl) return;
          const width = previewImage.naturalWidth;
          const height = previewImage.naturalHeight;
          const megapixels = width * height / 1_000_000;
          const dimensionError = width > 10_000 || height > 10_000 || width * height > 40_000_000
            ? "画像の解像度が上限を超えています。最大40メガピクセル・一辺10000pxです。"
            : "";
          fileInput.setCustomValidity(dimensionError);
          feedback.textContent = dimensionError;
          feedback.classList.toggle("warning", dimensionError !== "");
          if (previewMeta instanceof HTMLElement) {
            previewMeta.textContent = width + " × " + height + "px · " + megapixels.toFixed(1) + "MP · " + (file.size / 1024 / 1024).toFixed(2) + "MiB · 保存時に最大2560pxへ圧縮";
          }
          if (submit instanceof HTMLButtonElement) submit.disabled = dimensionError !== "";
        };
        previewImage.onerror = () => {
          if (previewObjectUrl !== objectUrl) return;
          fileInput.setCustomValidity("画像を読み込めませんでした。破損していないファイルを選んでください。");
          feedback.textContent = fileInput.validationMessage;
          feedback.classList.add("warning");
          if (submit instanceof HTMLButtonElement) submit.disabled = true;
        };
        previewImage.src = objectUrl;
      }
      if (previewName instanceof HTMLElement) previewName.textContent = file.name;
      if (previewMeta instanceof HTMLElement) previewMeta.textContent = (file.size / 1024 / 1024).toFixed(2) + "MiB · 解像度を確認中";
      if (preview instanceof HTMLElement) preview.hidden = false;
    };
    if (fileInput instanceof HTMLInputElement) fileInput.addEventListener("change", updateImagePreview);
    addEventListener("pagehide", () => { if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl); }, { once: true });
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
      if (!file || !(altInput instanceof HTMLInputElement) || !(feedback instanceof HTMLElement)) return;
      if (!acceptedImageTypes.has(file.type) || file.size > 10 * 1024 * 1024 || !fileInput.checkValidity()) {
        fileInput.reportValidity();
        return;
      }
      setButtonBusy(submit, true);
      feedback.textContent = "画像を圧縮して保存しています…";
      feedback.classList.remove("warning", "success");
      const longUploadTimer = setTimeout(() => {
        feedback.textContent = "大きな画像を圧縮しています。この画面を閉じずにお待ちください…";
      }, 5000);
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
        if (!response.ok) throw new Error(apiErrorMessage(result, "画像を保存できませんでした。"));
        feedback.textContent = "保存しました。画面を更新します。";
        feedback.classList.add("success");
        location.reload();
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "画像を保存できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(submit, false);
      } finally {
        clearTimeout(longUploadTimer);
      }
    });
  }

  for (const form of document.querySelectorAll("[data-image-alt]")) {
    if (!(form instanceof HTMLFormElement)) continue;
    const input = form.querySelector('input[name="alt_text"]');
    const submit = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector("[data-alt-feedback]");
    form.addEventListener("input", () => { form.dataset.dirty = "true"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(input instanceof HTMLInputElement) || !(feedback instanceof HTMLElement)) return;
      setButtonBusy(submit, true);
      feedback.textContent = "説明を保存しています…";
      feedback.classList.remove("warning", "success");
      try {
        const response = await fetch(form.action, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": form.dataset.csrf || ""
          },
          body: JSON.stringify({ alt_text: input.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "説明を保存できませんでした。"));
        form.dataset.dirty = "false";
        const asset = form.closest("[data-asset]");
        const image = asset?.querySelector("img");
        const deleteButton = asset?.querySelector("[data-image-delete]");
        if (image instanceof HTMLImageElement) image.alt = result.asset.alt_text;
        if (deleteButton instanceof HTMLButtonElement) {
          deleteButton.dataset.imageLabel = result.asset.alt_text || result.asset.original_filename;
        }
        feedback.textContent = "説明を保存しました。";
        feedback.classList.add("success");
        setTimeout(() => location.reload(), 600);
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "説明を保存できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(submit, false);
      }
    });
  }

  for (const button of document.querySelectorAll("[data-image-delete]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      if (!confirm("「" + (button.dataset.imageLabel || "この画像") + "」を削除しますか？")) return;
      const originalLabel = button.textContent;
      const feedback = button.parentElement?.querySelector("[data-delete-feedback]");
      setButtonBusy(button, true);
      button.textContent = "削除中…";
      if (feedback instanceof HTMLElement) feedback.textContent = "画像を削除しています…";
      try {
        const response = await fetch(button.dataset.imageDelete || "", {
          method: "DELETE",
          headers: { "x-csrf-token": button.dataset.csrf || "" }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "削除できませんでした。"));
        const asset = button.closest("[data-asset]");
        const assetGrid = asset?.parentElement;
        if (feedback instanceof HTMLElement) feedback.textContent = "削除しました。";
        asset?.remove();
        if (assetGrid instanceof HTMLElement && !assetGrid.querySelector("[data-asset]")) {
          const empty = document.createElement("p");
          empty.className = "prose";
          empty.textContent = "まだ画像がありません。";
          assetGrid.replaceWith(empty);
        }
      } catch (error) {
        if (feedback instanceof HTMLElement) {
          feedback.textContent = caughtErrorMessage(error, "削除できませんでした。");
          feedback.classList.add("warning");
        }
        button.textContent = originalLabel;
        setButtonBusy(button, false);
      }
    });
  }
})();`;

export function dashboardScriptResponse(): Response {
  return new Response(DASHBOARD_SCRIPT, {
    headers: {
      "cache-control": "no-cache, must-revalidate",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
