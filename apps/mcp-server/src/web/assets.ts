export const DASHBOARD_SCRIPT = String.raw`(() => {
  const apiErrorMessage = (result, fallback) => {
    const messages = {
      AUTH_REQUIRED: "ログインの有効期限が切れました。研究一覧からログインし直してください。",
      PROJECT_VERSION_CONFLICT: "別の画面またはAIから先に更新されました。入力内容を退避してから画面を再読み込みしてください。",
      PROJECT_NOT_FOUND: "研究が見つかりません。研究一覧へ戻って選び直してください。",
      SLIDE_NOT_FOUND: "スライドが見つかりません。画面を再読み込みしてください。",
      TEMPLATE_NOT_FOUND: "テンプレートが見つかりません。画面を再読み込みしてください。",
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
    dispatchEvent(new CustomEvent("ultimate-freestyle:version-changed", { detail: { version } }));
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
    const projectFilters = [...document.querySelectorAll("[data-project-filter]")];
    const projectSort = document.querySelector("[data-project-sort]");
    const projectGrid = document.querySelector("[data-project-grid]");
    const resultCount = document.querySelector("[data-project-count]");
    const emptyResult = document.querySelector("[data-project-search-empty]");
    const projectViewKey = "ultimate-freestyle:project-view";
    let savedProjectView = {};
    try { savedProjectView = JSON.parse(localStorage.getItem(projectViewKey) || "{}"); } catch {}
    if (!savedProjectView || typeof savedProjectView !== "object" || Array.isArray(savedProjectView)) savedProjectView = {};
    let activeFilter = ["all", "ready", "missing"].includes(savedProjectView.filter) ? savedProjectView.filter : "all";
    const filterProjects = () => {
      const query = projectSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const card of projectCards) {
        if (!(card instanceof HTMLElement)) continue;
        const matchesText = query === "" || (card.dataset.searchText || "").includes(query);
        const matchesFilter = activeFilter === "all" || card.dataset.presentation === activeFilter;
        const matches = matchesText && matchesFilter;
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      if (resultCount instanceof HTMLElement) resultCount.textContent = visible + "件を表示";
      if (emptyResult instanceof HTMLElement) emptyResult.hidden = visible > 0;
    };
    projectSearch.addEventListener("input", filterProjects);
    projectSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      projectSearch.value = "";
      filterProjects();
      projectSearch.blur();
    });
    for (const button of projectFilters) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.setAttribute("aria-pressed", String(button.dataset.projectFilter === activeFilter));
      button.addEventListener("click", () => {
        activeFilter = button.dataset.projectFilter || "all";
        for (const item of projectFilters) {
          if (item instanceof HTMLButtonElement) item.setAttribute("aria-pressed", String(item === button));
        }
        try { localStorage.setItem(projectViewKey, JSON.stringify({ ...savedProjectView, filter: activeFilter })); } catch {}
        savedProjectView.filter = activeFilter;
        filterProjects();
      });
    }
    if (projectSort instanceof HTMLSelectElement && projectGrid instanceof HTMLElement) {
      const sortProjects = () => {
        const mode = projectSort.value;
        const sorted = [...projectCards].sort((first, second) => {
          if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return 0;
          if (mode === "title") return (first.dataset.title || "").localeCompare(second.dataset.title || "", "ja");
          if (mode === "duration") {
            const durationDifference = Number(second.dataset.duration || 0) - Number(first.dataset.duration || 0);
            if (durationDifference !== 0) return durationDifference;
          } else {
            const updatedDifference = (second.dataset.updated || "").localeCompare(first.dataset.updated || "");
            if (updatedDifference !== 0) return updatedDifference;
          }
          return (first.dataset.title || "").localeCompare(second.dataset.title || "", "ja");
        });
        projectGrid.append(...sorted);
      };
      if (["updated", "title", "duration"].includes(savedProjectView.sort)) projectSort.value = savedProjectView.sort;
      sortProjects();
      projectSort.addEventListener("change", () => {
        savedProjectView.sort = projectSort.value;
        try { localStorage.setItem(projectViewKey, JSON.stringify(savedProjectView)); } catch {}
        sortProjects();
      });
    }
    filterProjects();
  }
  const qualitySweepButton = document.querySelector("[data-quality-sweep]");
  const qualitySweepFrame = document.querySelector("[data-quality-sweep-frame]");
  if (qualitySweepButton instanceof HTMLButtonElement && qualitySweepFrame instanceof HTMLIFrameElement) {
    const qualitySweepProgress = document.querySelector("[data-quality-sweep-progress]");
    const qualitySweepStatus = document.querySelector("[data-quality-sweep-status]");
    const qualitySweepResults = document.querySelector("[data-quality-sweep-results]");
    const qualitySweepPreview = document.querySelector("[data-quality-sweep-preview]");
    const qualitySweepCancel = document.querySelector("[data-quality-sweep-cancel]");
    let slides = [];
    try { slides = JSON.parse(qualitySweepButton.dataset.slides || "[]"); } catch {}
    let sweepIndex = 0;
    let sweepStep = 0;
    let sweepRunning = false;
    let sweepIssueCount = 0;
    let completedCheckpoints = 0;
    let currentSlideFindings = [];
    let sweepTimer;
    const totalCheckpoints = slides.reduce((total, slide) => total + Number(slide.max_step || 0) + 1, 0);
    const appendSweepResult = (slide, message, warning = true) => {
      if (!(qualitySweepResults instanceof HTMLOListElement)) return;
      const item = document.createElement("li");
      if (!warning) item.classList.add("success");
      if (slide?.href) {
        const link = document.createElement("a");
        link.href = slide.href;
        link.textContent = slide.number + ". " + slide.title;
        item.append(link, document.createTextNode(" — " + message));
      } else item.textContent = message;
      qualitySweepResults.append(item);
    };
    const finishQualitySweep = () => {
      sweepRunning = false;
      clearTimeout(sweepTimer);
      setButtonBusy(qualitySweepButton, false);
      qualitySweepButton.textContent = "もう一度チェック";
      if (qualitySweepCancel instanceof HTMLButtonElement) qualitySweepCancel.hidden = true;
      if (qualitySweepStatus instanceof HTMLElement) {
        qualitySweepStatus.textContent = sweepIssueCount
          ? sweepIssueCount + "枚に確認事項があります。"
          : "全" + slides.length + "枚・" + totalCheckpoints + "段階が発表枠内に収まっています。";
        qualitySweepStatus.classList.toggle("warning", sweepIssueCount > 0);
        qualitySweepStatus.classList.toggle("success", sweepIssueCount === 0);
      }
      if (sweepIssueCount === 0) appendSweepResult(null, "全段階で見切れ、過剰な自動縮小、文字コントラスト不足は見つかりませんでした。", false);
    };
    const requestSweepPosition = () => {
      const slide = slides[sweepIndex];
      if (!slide) { finishQualitySweep(); return; }
      qualitySweepFrame.contentWindow?.postMessage({ type: "ultimate-freestyle:set-position", slide: sweepIndex + 1, step: sweepStep }, location.origin);
      waitForSweepResult();
    };
    const advanceQualitySweep = () => {
      completedCheckpoints += 1;
      if (qualitySweepProgress instanceof HTMLProgressElement) qualitySweepProgress.value = completedCheckpoints;
      const slide = slides[sweepIndex];
      if (sweepStep < Number(slide?.max_step || 0)) {
        sweepStep += 1;
      } else {
        if (currentSlideFindings.length) {
          sweepIssueCount += 1;
          appendSweepResult(slide, [...new Set(currentSlideFindings)].join(" / ") + "。個別画面で配色・組版・文章量を調整してください。");
        }
        currentSlideFindings = [];
        sweepIndex += 1;
        sweepStep = 0;
      }
      if (qualitySweepStatus instanceof HTMLElement) qualitySweepStatus.textContent = completedCheckpoints + " / " + totalCheckpoints + "段階を確認";
      if (sweepIndex >= slides.length) finishQualitySweep();
      else requestSweepPosition();
    };
    const waitForSweepResult = () => {
      clearTimeout(sweepTimer);
      sweepTimer = setTimeout(() => {
        if (!sweepRunning) return;
        currentSlideFindings.push("STEP " + sweepStep + ": 描画結果を取得できませんでした");
        advanceQualitySweep();
      }, 5000);
    };
    addEventListener("message", (event) => {
      if (!sweepRunning || event.origin !== location.origin || event.source !== qualitySweepFrame.contentWindow) return;
      const data = event.data;
      const slide = slides[sweepIndex];
      if (!data || data.type !== "ultimate-freestyle:render-diagnostics" || data.slide_id !== slide?.id || Number(data.step) !== sweepStep) return;
      clearTimeout(sweepTimer);
      const overflows = Array.isArray(data.overflows) ? data.overflows : [];
      const compressed = Array.isArray(data.fits)
        ? data.fits.filter((item) => Number.isFinite(item?.fit_scale) && item.fit_scale < 0.7)
        : [];
      const contrasts = Array.isArray(data.contrasts)
        ? data.contrasts.filter((item) => Number.isFinite(item?.ratio) && Number.isFinite(item?.required) && item.ratio < item.required)
        : [];
      if (overflows.length || compressed.length || contrasts.length) {
        const details = [
          overflows.length ? "見切れ" + overflows.length + "か所" : "",
          compressed.length ? "70%未満の縮小" + compressed.length + "か所" : "",
          contrasts.length ? "文字コントラスト不足" + contrasts.length + "か所" : ""
        ].filter(Boolean).join("、");
        currentSlideFindings.push("STEP " + sweepStep + ": " + details);
      }
      advanceQualitySweep();
    });
    qualitySweepButton.addEventListener("click", () => {
      if (sweepRunning || slides.length === 0) return;
      sweepRunning = true;
      sweepIndex = 0;
      sweepStep = 0;
      sweepIssueCount = 0;
      completedCheckpoints = 0;
      currentSlideFindings = [];
      setButtonBusy(qualitySweepButton, true);
      qualitySweepButton.textContent = "確認中…";
      if (qualitySweepCancel instanceof HTMLButtonElement) qualitySweepCancel.hidden = false;
      if (qualitySweepResults instanceof HTMLOListElement) qualitySweepResults.replaceChildren();
      if (qualitySweepProgress instanceof HTMLProgressElement) {
        qualitySweepProgress.hidden = false;
        qualitySweepProgress.value = 0;
      }
      if (qualitySweepStatus instanceof HTMLElement) {
        qualitySweepStatus.textContent = "発表枠を準備しています…";
        qualitySweepStatus.classList.remove("warning", "success");
      }
      if (qualitySweepPreview instanceof HTMLElement) qualitySweepPreview.hidden = false;
      const url = new URL(qualitySweepButton.dataset.frameUrl || "", location.origin);
      url.searchParams.set("quality_run", String(Date.now()));
      qualitySweepFrame.src = url.toString();
      waitForSweepResult();
    });
    if (qualitySweepCancel instanceof HTMLButtonElement) {
      qualitySweepCancel.addEventListener("click", () => {
        if (!sweepRunning) return;
        sweepRunning = false;
        clearTimeout(sweepTimer);
        qualitySweepFrame.removeAttribute("src");
        qualitySweepCancel.hidden = true;
        setButtonBusy(qualitySweepButton, false);
        qualitySweepButton.textContent = "最初からチェック";
        if (qualitySweepStatus instanceof HTMLElement) {
          qualitySweepStatus.textContent = completedCheckpoints + " / " + totalCheckpoints + "段階で中断しました。途中結果は下に残しています。";
          qualitySweepStatus.classList.remove("success", "warning");
        }
      });
    }
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
  const contentCapacityField = slideEditor instanceof HTMLFormElement ? slideEditor.elements.namedItem("content_markdown") : null;
  let currentPreviewTypography = {};
  try { currentPreviewTypography = JSON.parse(typographyEditor?.dataset.effectiveTypography || "{}"); } catch {}
  const updateContentStructure = () => {
    if (!(contentCapacityField instanceof HTMLTextAreaElement)) return;
    const structure = document.querySelector("[data-content-structure]");
    if (!(structure instanceof HTMLElement)) return;
    const text = contentCapacityField.value;
    const lines = text.split(/\r?\n/);
    const headings = lines.filter((line) => /^\s*#{1,6}\s+\S/.test(line)).length;
    const lists = lines.filter((line) => /^\s*(?:[-*+] |\d+\. )\S/.test(line)).length;
    const paragraphs = text.split(/\n\s*\n/).filter((block) => {
      const value = block.trim();
      return value && !/^(?:#{1,6}\s|[-*+]\s|\d+\.\s)/.test(value);
    }).length;
    const spokenCharacters = text.replace(/[#*_>\x60|\[\]()!-]/g, "").replace(/\s/g, "").length;
    const readingSeconds = Math.max(0, Math.ceil(spokenCharacters / 6));
    const readingLabel = readingSeconds < 60 ? "約" + readingSeconds + "秒" : "約" + Math.floor(readingSeconds / 60) + "分" + String(readingSeconds % 60).padStart(2, "0") + "秒";
    for (const [name, value] of [["headings", "見出し " + headings], ["paragraphs", "段落 " + paragraphs], ["lists", "箇条書き " + lists], ["reading", "音読 " + readingLabel]]) {
      const target = structure.querySelector('[data-content-stat="' + name + '"]');
      if (target instanceof HTMLElement) target.textContent = value;
    }
    const readingLayout = structure.querySelector("[data-reading-layout]");
    const preset = String(currentPreviewTypography.preset || "standard");
    if (readingLayout instanceof HTMLButtonElement) readingLayout.hidden = text.length < 320 || ["article", "columns", "dense"].includes(preset);
  };
  const updateCharacterCounter = (field, counter) => {
    const recommended = Number(field.dataset.recommendedLimit || 0);
    counter.textContent = recommended > 0
      ? field.value.length.toLocaleString() + "字 · 推奨目安 " + recommended.toLocaleString() + "字"
      : field.value.length.toLocaleString() + " / " + Number(field.maxLength).toLocaleString() + "字";
    counter.dataset.nearLimit = String(recommended > 0 ? field.value.length >= recommended * .85 : field.value.length >= field.maxLength * 0.9);
    counter.dataset.overLimit = String(recommended > 0 && field.value.length > recommended);
  };
  const updateRecommendedBodyLimit = (typography) => {
    if (!(contentCapacityField instanceof HTMLTextAreaElement) || !(slideEditor instanceof HTMLFormElement)) return;
    const data = new FormData(slideEditor);
    const presetFactors = { statement: .55, standard: 1, article: 1.45, columns: 1.5, dense: 1.75 };
    const preset = String(typography.preset || "standard");
    const bodyScale = Math.max(.5, Number(typography.body_scale) || 1);
    const lineHeight = Math.max(1, Number(typography.line_height) || 1.5);
    const columns = Math.max(1, Number(typography.columns) || 1);
    const base = slideFrame instanceof HTMLIFrameElement && slideFrame.dataset.aspectRatio === "4:3" ? 460 : 600;
    const sidebarFactor = String(data.get("sidebar_markdown") || "") === "" ? 1 : .78;
    const limit = Math.round(Math.min(1600, Math.max(180, base * sidebarFactor * (presetFactors[preset] || 1) * Math.pow(1 / bodyScale, 1.6) * (1.5 / lineHeight) * (1 + (columns - 1) * .08))) / 10) * 10;
    contentCapacityField.dataset.recommendedLimit = String(limit);
    const counter = contentCapacityField.nextElementSibling;
    if (counter instanceof HTMLElement && counter.classList.contains("character-count")) updateCharacterCounter(contentCapacityField, counter);
    updateContentStructure();
  };
  let draftFrameTimer;
  let draftTypographyTimer;
  let draftTemplateTimer;
  let draftAppearanceTimer;
  let draftNarrationTimer;
  let draftSceneTimer;
  let setWorkspaceStep = () => {};
  const syncSlideDraft = () => {
    if (!(slideEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(slideEditor);
    updateRecommendedBodyLimit(currentPreviewTypography);
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
    const durationInput = slideEditor.elements.namedItem("duration_seconds");
    const durationStatus = document.querySelector("[data-workspace-duration]");
    const durationLabel = durationStatus?.querySelector("[data-workspace-duration-label]");
    const durationBreakdown = slideEditor.querySelector("[data-duration-breakdown]");
    if (
      durationInput instanceof HTMLInputElement &&
      durationStatus instanceof HTMLElement &&
      durationLabel instanceof HTMLElement
    ) {
      const baseTotal = Number(durationStatus.dataset.totalDuration);
      const baseSlide = Number(durationStatus.dataset.slideDuration);
      const updateDurationStatus = () => {
        const nextSlide = Number(durationInput.value);
        if (!Number.isFinite(nextSlide)) return;
        const total = Math.max(0, baseTotal - baseSlide + nextSlide);
        const minutes = Math.floor(total / 60);
        const seconds = String(Math.floor(total % 60)).padStart(2, "0");
        const overLimit = total > 20 * 60;
        durationStatus.dataset.state = overLimit ? "warning" : "ok";
        durationLabel.textContent = minutes + "分" + seconds + "秒" + (overLimit ? " · 20分超過" : "");
        if (durationBreakdown instanceof HTMLElement) {
          const stepCount = Number(slideEditor.dataset.stepCount || 1);
          durationBreakdown.textContent = "読み上げを含むスライド全体の目安です。" + stepCount + "段階では1段階あたり約" + (nextSlide / stepCount).toFixed(1) + "秒です。";
        }
      };
      durationInput.addEventListener("input", updateDurationStatus);
    }
  }
  const readingLayout = document.querySelector("[data-reading-layout]");
  if (readingLayout instanceof HTMLButtonElement && typographyEditor instanceof HTMLFormElement) {
    readingLayout.addEventListener("click", () => {
      const preset = typographyEditor.elements.namedItem("preset");
      if (!(preset instanceof HTMLSelectElement)) return;
      const section = typographyEditor.closest("details.inspector-section");
      if (section instanceof HTMLDetailsElement) section.open = true;
      preset.value = "article";
      preset.dispatchEvent(new Event("input", { bubbles: true }));
      typographyEditor.scrollIntoView({ block: "center", behavior: "smooth" });
      preset.focus({ preventScroll: true });
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
    currentPreviewTypography = typography;
    updateRecommendedBodyLimit(typography);
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
        layoutStatus.textContent = "テンプレートをプレビューへ反映しています…";
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
    for (const form of document.querySelectorAll("[data-segment-preview]")) {
      if (!(form instanceof HTMLFormElement)) continue;
      const data = new FormData(form);
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:preview-narration-segment",
        slide_id: form.dataset.slideId || "",
        at: Number(data.has("at") ? data.get("at") : form.dataset.segmentAt || 0),
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
  for (const form of document.querySelectorAll("[data-segment-preview]")) form.addEventListener("input", scheduleNarrationDraft);
  const newSegmentStep = document.querySelector("[data-narration-segment-create] select[name=at]");
  if (newSegmentStep instanceof HTMLSelectElement) {
    newSegmentStep.addEventListener("change", () => setWorkspaceStep(Number(newSegmentStep.value)));
  }
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
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
      const path = (field.dataset.componentPath || field.name).split(".");
      let owner = component;
      for (const segment of path.slice(0, -1)) {
        if (!owner || typeof owner !== "object") break;
        const key = Number.isInteger(Number(segment)) ? Number(segment) : segment;
        if (!owner[key] || typeof owner[key] !== "object") owner[key] = {};
        owner = owner[key];
      }
      if (!owner || typeof owner !== "object") continue;
      const key = path.at(-1);
      if (key === undefined) continue;
      if (field.dataset.componentOptional === "true" && field.value.trim() === "") {
        delete owner[key];
        continue;
      }
      owner[key] = field instanceof HTMLInputElement && field.type === "checkbox"
        ? field.checked
        : field.dataset.componentNumber === "true"
        ? Number(field.value)
        : field.dataset.nullable === "true" && field.value.trim() === ""
        ? null
        : field.value;
    }
    const frameToggle = form.querySelector("[data-component-frame-toggle]");
    if (frameToggle instanceof HTMLInputElement && !frameToggle.checked) component.frame = null;
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
      letter_spacing_em: numberValue(data, "letter_spacing_em"),
      make_default: data.has("make_default")
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
    if (form.matches("[data-narration-segment-create]")) Object.assign(body, {
      at: numberValue(data, "at"),
      text: String(data.get("text") || "")
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
  const versionedForms = [...document.querySelectorAll("[data-versioned-form]")];
  for (const [formIndex, form] of versionedForms.entries()) {
    if (!(form instanceof HTMLFormElement)) continue;
    const draftKey = "ultimate-freestyle:form-draft:" + location.pathname + ":" + new URL(form.action).pathname + ":" + formIndex;
    let draftTimer;
    const draftFields = () => [...form.elements].flatMap((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name || ["submit", "button", "file", "hidden"].includes(field.type)) return [];
      return [{ name: field.name, value: field.value, checked: field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : null }];
    });
    const persistDraft = () => {
      if (form.dataset.dirty !== "true") return;
      try { sessionStorage.setItem(draftKey, JSON.stringify({ version: Number(form.dataset.version), fields: draftFields() })); } catch {}
    };
    const removeDraft = () => {
      clearTimeout(draftTimer);
      try { sessionStorage.removeItem(draftKey); } catch {}
    };
    form.addEventListener("input", () => {
      form.dataset.dirty = "true";
      clearTimeout(draftTimer);
      draftTimer = setTimeout(persistDraft, 180);
      syncSaveState();
    });
    addEventListener("ultimate-freestyle:version-changed", persistDraft);
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
        form.dataset.dirty = "false";
        removeDraft();
        syncPageVersion(result.version);
        if (form.matches("[data-template-create], [data-narration-segment-create]")) {
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
    let restored = false;
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft?.version === Number(form.dataset.version) && Array.isArray(draft.fields)) {
        for (const saved of draft.fields) {
          const field = form.elements.namedItem(String(saved.name || ""));
          if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
          if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = saved.checked === true;
          else field.value = String(saved.value ?? "");
        }
        restored = true;
      } else if (draft !== null) sessionStorage.removeItem(draftKey);
    } catch { removeDraft(); }
    if (restored) {
      const notice = document.createElement("p");
      notice.className = "draft-recovery";
      notice.append(document.createTextNode("更新前の未保存入力を復元しました。"));
      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "ghost";
      discard.textContent = "復元内容を破棄";
      discard.addEventListener("click", () => { removeDraft(); location.reload(); });
      notice.append(discard);
      form.prepend(notice);
      form.dataset.dirty = "true";
      form.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  for (const button of document.querySelectorAll("[data-narration-segment-delete]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement)) return;
      if (!confirm("この読み上げ区間を削除しますか？生成済み音声も発表から外れます。")) return;
      setButtonBusy(button, true);
      feedback.textContent = "読み上げ区間を削除しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(button.dataset.deleteUrl || "", {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": button.dataset.csrf || ""
          },
          body: JSON.stringify({ expected_version: Number(form.dataset.version) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "読み上げ区間を削除できませんでした。"));
        form.dataset.dirty = "false";
        feedback.textContent = "読み上げ区間を削除しました。画面を更新します…";
        feedback.classList.add("success");
        location.reload();
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "読み上げ区間を削除できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  const syncSceneComponentDrafts = () => {
    if (!(slideFrame instanceof HTMLIFrameElement)) return;
    for (const form of document.querySelectorAll("[data-scene-component-editor]")) {
      if (!(form instanceof HTMLFormElement)) continue;
      let assetUrls = {};
      try { assetUrls = JSON.parse(form.dataset.assetUrls || "{}"); } catch {}
      slideFrame.contentWindow?.postMessage({
        type: "ultimate-freestyle:preview-scene-component",
        slide_id: slideEditor instanceof HTMLFormElement ? slideEditor.dataset.slideId || "" : "",
        component: sceneComponentFromForm(form),
        asset_urls: assetUrls
      }, location.origin);
    }
  };
  for (const form of document.querySelectorAll("[data-scene-component-editor]")) {
    const frameToggle = form.querySelector("[data-component-frame-toggle]");
    const frameFields = [...form.querySelectorAll("[data-component-frame-field]")].filter((field) => field instanceof HTMLInputElement);
    const frameFeedback = form.querySelector("[data-component-frame-feedback]");
    const validateFrame = () => {
      if (!(frameToggle instanceof HTMLInputElement)) return;
      for (const field of frameFields) field.setCustomValidity("");
      if (!frameToggle.checked) {
        if (frameFeedback instanceof HTMLElement) frameFeedback.textContent = "";
        return;
      }
      const values = Object.fromEntries(frameFields.map((field) => [field.dataset.componentPath || "", Number(field.value)]));
      const horizontalOverflow = values["frame.x"] + values["frame.width"] > 100;
      const verticalOverflow = values["frame.y"] + values["frame.height"] > 100;
      const width = frameFields.find((field) => field.dataset.componentPath === "frame.width");
      const height = frameFields.find((field) => field.dataset.componentPath === "frame.height");
      if (horizontalOverflow) width?.setCustomValidity("左位置と幅の合計を100%以内にしてください。");
      if (verticalOverflow) height?.setCustomValidity("上位置と高さの合計を100%以内にしてください。");
      if (frameFeedback instanceof HTMLElement) {
        frameFeedback.textContent = horizontalOverflow || verticalOverflow
          ? "スライド枠を越えています。位置または大きさを小さくしてください。"
          : "スライド枠内に収まっています。";
        frameFeedback.classList.toggle("warning", horizontalOverflow || verticalOverflow);
        frameFeedback.classList.toggle("success", !horizontalOverflow && !verticalOverflow);
      }
    };
    const syncFrameControls = () => {
      if (!(frameToggle instanceof HTMLInputElement)) return;
      const frameControls = form.querySelector("[data-component-frame-controls]");
      if (frameControls instanceof HTMLElement) frameControls.dataset.enabled = String(frameToggle.checked);
      for (const field of form.querySelectorAll("[data-component-frame-field]")) {
        if (field instanceof HTMLInputElement) field.disabled = !frameToggle.checked;
      }
      validateFrame();
    };
    frameToggle?.addEventListener("input", syncFrameControls);
    for (const preset of form.querySelectorAll("[data-component-frame-preset]")) {
      if (!(preset instanceof HTMLButtonElement) || !(frameToggle instanceof HTMLInputElement)) continue;
      preset.addEventListener("click", () => {
        const values = (preset.dataset.componentFramePreset || "").split(",").map(Number);
        if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return;
        frameToggle.checked = true;
        syncFrameControls();
        frameFields.forEach((field, index) => { field.value = String(values[index]); });
        validateFrame();
        frameFields.at(-1)?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const styleReset = form.querySelector("[data-component-style-reset]");
    if (styleReset instanceof HTMLButtonElement) {
      styleReset.addEventListener("click", () => {
        const fields = [...form.querySelectorAll("[data-component-style-field]")].filter((field) => field instanceof HTMLInputElement || field instanceof HTMLSelectElement);
        for (const field of fields) field.value = "";
        fields.at(-1)?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    syncFrameControls();
    form.addEventListener("input", () => {
      validateFrame();
      clearTimeout(draftSceneTimer);
      draftSceneTimer = setTimeout(syncSceneComponentDrafts, 120);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "表示パーツの変更をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  for (const color of document.querySelectorAll("[data-component-color-preview]")) {
    if (!(color instanceof HTMLInputElement) || color.type !== "color") continue;
    const form = color.closest("form");
    const text = form?.querySelector('[data-component-path="' + color.dataset.componentColorPreview + '"]');
    if (!(form instanceof HTMLFormElement) || !(text instanceof HTMLInputElement)) continue;
    color.addEventListener("input", () => {
      text.value = color.value;
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    text.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) color.value = text.value;
    });
  }

  for (const field of document.querySelectorAll('textarea[maxlength], input[maxlength]:not([type]):not([data-component-color-hex]), input[type="text"][maxlength]:not([data-color-text]):not([data-component-color-hex])')) {
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) continue;
    const counter = document.createElement("span");
    counter.className = "character-count";
    counter.setAttribute("aria-hidden", "true");
    const updateCounter = () => updateCharacterCounter(field, counter);
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
      } else if (action === "table") {
        replacement = "| 比較項目 | 条件A | 条件B |\n| --- | --- | --- |\n| 結果 |  |  |";
        selectionStart = start + replacement.indexOf("結果");
        selectionEnd = selectionStart + 2;
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

  for (const button of document.querySelectorAll("[data-visual-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const select = form?.elements.namedItem("visual_preset");
      if (!(select instanceof HTMLSelectElement)) return;
      select.value = button.dataset.visualPick || select.value;
      let palette = {};
      try { palette = JSON.parse(button.dataset.visualPalette || "{}"); } catch {}
      for (const [name, value] of Object.entries(palette)) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement && input.type === "color" && typeof value === "string") {
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-font-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const value = button.dataset.fontPick || "";
      if (!(form instanceof HTMLFormElement) || value === "") return;
      for (const name of ["body_font", "heading_font"]) {
        const select = form.elements.namedItem(name);
        if (select instanceof HTMLSelectElement) select.value = value;
      }
      for (const item of form.querySelectorAll("[data-font-pick]")) {
        if (item instanceof HTMLButtonElement) item.setAttribute("aria-pressed", String(item === button));
      }
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-cover-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const layout = form.elements.namedItem("cover_layout");
      const role = form.elements.namedItem("role");
      if (layout instanceof HTMLSelectElement) layout.value = button.dataset.coverPick || layout.value;
      if (role instanceof HTMLSelectElement) role.value = "cover";
      for (const item of form.querySelectorAll("[data-cover-pick]")) {
        if (item instanceof HTMLButtonElement) item.setAttribute("aria-pressed", String(item === button));
      }
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-narration-display-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const display = form.elements.namedItem("display");
      if (display instanceof HTMLSelectElement) display.value = button.dataset.narrationDisplayPick || display.value;
      for (const item of form.querySelectorAll("[data-narration-display-pick]")) {
        if (item instanceof HTMLButtonElement) item.setAttribute("aria-pressed", String(item === button));
      }
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-region-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const layout = form.elements.namedItem("region_layout");
      if (layout instanceof HTMLSelectElement) layout.value = button.dataset.regionPick || layout.value;
      for (const item of form.querySelectorAll("[data-region-pick]")) {
        if (item instanceof HTMLButtonElement) item.setAttribute("aria-pressed", String(item === button));
      }
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-animation-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const target = button.dataset.animationTarget || "enter_animation";
      const select = form.elements.namedItem(target);
      if (!(select instanceof HTMLSelectElement)) return;
      select.value = button.dataset.animationPick || "";
      syncPicker(form, '[data-animation-pick][data-animation-target="' + target + '"]', "animationPick", select.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-tone-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const select = form?.elements.namedItem("tone");
      if (!(form instanceof HTMLFormElement) || !(select instanceof HTMLSelectElement)) return;
      select.value = button.dataset.tonePick || select.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-loading-style-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const select = form?.elements.namedItem("loading_style");
      if (!(form instanceof HTMLFormElement) || !(select instanceof HTMLSelectElement)) return;
      select.value = button.dataset.loadingStylePick || select.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  for (const button of document.querySelectorAll("[data-animation-replay]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const select = form?.elements.namedItem(button.dataset.animationReplay || "enter_animation");
      if (select instanceof HTMLSelectElement) select.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const text of document.querySelectorAll("[data-color-text]")) {
    if (!(text instanceof HTMLInputElement)) continue;
    const form = text.closest("form");
    const color = form?.elements.namedItem(text.dataset.colorText || "");
    if (!(color instanceof HTMLInputElement) || color.type !== "color") continue;
    text.addEventListener("input", () => {
      const valid = /^#[0-9a-f]{6}$/i.test(text.value);
      text.setAttribute("aria-invalid", String(!valid));
      if (!valid) return;
      color.value = text.value;
      color.dispatchEvent(new Event("input", { bubbles: true }));
    });
    color.addEventListener("input", () => {
      text.value = color.value;
      text.setAttribute("aria-invalid", "false");
    });
  }

  const syncPicker = (form, selector, datasetKey, selected) => {
    for (const item of form.querySelectorAll(selector)) {
      if (!(item instanceof HTMLButtonElement)) continue;
      item.setAttribute("aria-pressed", String((item.dataset[datasetKey] || "") === selected));
    }
  };
  for (const form of document.querySelectorAll("form")) {
    if (!(form instanceof HTMLFormElement)) continue;
    form.addEventListener("change", (event) => {
      const field = event.target;
      if (!(field instanceof HTMLSelectElement)) return;
      if (field.name === "visual_preset") {
        syncPicker(form, "[data-visual-pick]", "visualPick", field.value);
      } else if (field.name === "cover_layout") {
        syncPicker(form, "[data-cover-pick]", "coverPick", field.value);
      } else if (field.name === "display") {
        syncPicker(form, "[data-narration-display-pick]", "narrationDisplayPick", field.value);
      } else if (field.name === "region_layout") {
        syncPicker(form, "[data-region-pick]", "regionPick", field.value);
      } else if (field.name === "enter_animation") {
        syncPicker(form, '[data-animation-pick][data-animation-target="enter_animation"]', "animationPick", field.value);
      } else if (field.name === "tone") {
        syncPicker(form, "[data-tone-pick]", "tonePick", field.value);
      } else if (field.name === "loading_style") {
        syncPicker(form, "[data-loading-style-pick]", "loadingStylePick", field.value);
      } else if (field.name === "body_font" || field.name === "heading_font") {
        const body = form.elements.namedItem("body_font");
        const heading = form.elements.namedItem("heading_font");
        const selected = body instanceof HTMLSelectElement && heading instanceof HTMLSelectElement && body.value === heading.value
          ? body.value
          : "";
        syncPicker(form, "[data-font-pick]", "fontPick", selected);
      }
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

  for (const button of document.querySelectorAll("[data-template-delete]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement)) return;
      const dirty = document.querySelector('[data-dirty="true"]') !== null;
      const prefix = dirty ? "未保存の入力は破棄されます。\n" : "";
      if (!confirm(prefix + "「" + (button.dataset.templateName || "このテンプレート") + "」を削除しますか？使用中のスライドは発表全体の既定、既定自身なら組み込みスタイルへ戻ります。")) return;
      setButtonBusy(button, true);
      feedback.textContent = "テンプレートを削除しています…";
      feedback.classList.remove("warning", "success");
      try {
        const response = await fetch(button.dataset.deleteUrl || "", {
          method: "DELETE",
          headers: { "content-type": "application/json", "x-csrf-token": form.dataset.csrf || "" },
          body: JSON.stringify({ expected_version: Number(form.dataset.version) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "テンプレートを削除できませんでした。"));
        for (const dirtyForm of document.querySelectorAll('[data-dirty="true"]')) {
          if (dirtyForm instanceof HTMLElement) dirtyForm.dataset.dirty = "false";
        }
        feedback.textContent = "削除しました。研究詳細へ戻ります…";
        feedback.classList.add("success");
        location.href = result.next_url;
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "テンプレートを削除できませんでした。");
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
    setWorkspaceStep = updateStep;
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
    const diagnosticTarget = (id, preferredPath = "") => {
      let sectionName = "structure";
      let target = null;
      if (id.startsWith("node:")) {
        const componentId = id.slice(5);
        target = [...document.querySelectorAll("[data-scene-component-editor]")].find((form) => form instanceof HTMLFormElement && form.dataset.componentId === componentId) || null;
      } else if (id === "flow:main" || id === "flow:sidebar") {
        sectionName = preferredPath ? "design" : "content";
        target = preferredPath ? document.querySelector("[data-template-editor]") : document.querySelector("[data-slide-editor]");
      } else if (id === "narration") {
        sectionName = "narration";
        target = document.querySelector("[data-narration-settings-editor]");
      }
      const section = document.querySelector('[data-inspector-section="' + sectionName + '"]');
      return { section, target: target || section };
    };
    const appendDiagnostic = (item, message, preferredPath = "") => {
      if (!(qualityList instanceof HTMLElement)) return;
      const row = document.createElement("li");
      row.dataset.layoutWarning = "true";
      row.append(document.createTextNode(message));
      const { section, target } = diagnosticTarget(item.id, preferredPath);
      if (section instanceof HTMLDetailsElement && target instanceof HTMLElement) {
        const preferredField = preferredPath
          ? target.querySelector('[data-component-path="' + preferredPath + '"]') || (target instanceof HTMLFormElement ? target.elements.namedItem(item.id === "flow:sidebar" ? "muted" : "foreground") : null)
          : null;
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
          const field = preferredField || target.querySelector("textarea, input, select");
          if (field instanceof HTMLElement) field.focus({ preventScroll: true });
        });
        row.append(button);
        if (preferredField instanceof HTMLInputElement && /^#[0-9a-f]{6}$/i.test(String(item.suggested_foreground || ""))) {
          const suggestion = document.createElement("button");
          suggestion.type = "button";
          suggestion.className = "ghost";
          suggestion.textContent = "推奨色を入力";
          suggestion.addEventListener("click", () => {
            section.open = true;
            const componentDetail = target.closest("details.component-detail");
            if (componentDetail instanceof HTMLDetailsElement) componentDetail.open = true;
            preferredField.value = item.suggested_foreground;
            preferredField.dispatchEvent(new Event("input", { bubbles: true }));
            preferredField.scrollIntoView({ block: "center", behavior: "smooth" });
            preferredField.focus();
          });
          row.append(suggestion);
        }
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
      const contrasts = Array.isArray(data.contrasts)
        ? data.contrasts.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.ratio) && Number.isFinite(item.required) && item.ratio < item.required)
        : [];
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = overflows.length
          ? overflows.length + "か所で文字が収まりません。品質確認から対象を確認してください。"
          : compressed.length
            ? compressed.length + "か所の文字を70%未満まで縮小しています。組版か文章量を見直してください。"
          : contrasts.length
            ? contrasts.length + "か所で文字と背景のコントラストが不足しています。配色を見直してください。"
          : "このSTEPの文字は" + (slideFrame.dataset.aspectRatio || "16:9") + "の枠内に収まっています。";
        layoutStatus.dataset.level = overflows.length || compressed.length || contrasts.length ? "warning" : "ok";
      }
      if (qualityList instanceof HTMLElement) {
        qualityList.querySelectorAll("[data-layout-warning]").forEach((item) => item.remove());
        for (const item of overflows) {
          appendDiagnostic(item, item.region + "「" + item.id + "」が横" + Math.ceil(item.overflow_x) + "px・縦" + Math.ceil(item.overflow_y) + "px超過しています。");
        }
        for (const item of compressed) {
          appendDiagnostic(item, item.region + "「" + item.id + "」を" + Math.round(item.fit_scale * 100) + "%まで自動縮小しています。");
        }
        for (const item of contrasts) {
          appendDiagnostic(item, item.region + "「" + item.id + "」の文字コントラストは" + item.ratio.toFixed(1) + ":1" + (item.estimated ? "（背景模様を除く概算）" : "") + "です（目安" + item.required.toFixed(1) + ":1以上）。", "style.foreground");
        }
      }
      if (qualitySummary instanceof HTMLElement) {
        const baseCount = Number(qualitySummary.dataset.baseCount || 0);
        const total = baseCount + overflows.length + compressed.length + contrasts.length;
        qualitySummary.dataset.level = total ? "warning" : "ok";
        qualitySummary.textContent = overflows.length
          ? total + "件の確認事項があります（うち見切れ" + overflows.length + "件）。"
          : compressed.length
            ? total + "件の確認事項があります（うち過剰な自動縮小" + compressed.length + "件）。"
          : contrasts.length
            ? total + "件の確認事項があります（うち文字コントラスト不足" + contrasts.length + "件）。"
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

  const segmentInheritedTuning = (form) => {
    let effective = {};
    try { effective = JSON.parse(form.dataset.effectiveTuning || "{}"); } catch {}
    let profileTunings = {};
    try { profileTunings = JSON.parse(form.dataset.profileTunings || "{}"); } catch {}
    const profileSelect = form.elements.namedItem("voice_profile_id");
    return profileSelect instanceof HTMLSelectElement
      ? profileTunings[profileSelect.value] || effective
      : effective;
  };
  const segmentTuningValue = (form, name) => {
    const inherited = segmentInheritedTuning(form);
    const field = form.elements.namedItem("tuning_" + name);
    const value = field instanceof HTMLInputElement ? field.value.trim() : "";
    const fallback = inherited[name] ?? (name === "speedScale" ? 1 : 0);
    return value === "" || !Number.isFinite(Number(value)) ? Number(fallback) : Number(value);
  };
  const updateSegmentDuration = (form) => {
    const output = form.querySelector("[data-segment-duration]");
    const text = form.elements.namedItem("text");
    if (!(output instanceof HTMLElement) || !(text instanceof HTMLTextAreaElement)) return;
    const inherited = segmentInheritedTuning(form);
    for (const field of form.querySelectorAll('input[name^="tuning_"]')) {
      if (!(field instanceof HTMLInputElement)) continue;
      const key = field.name.slice("tuning_".length);
      field.placeholder = "実効 " + (inherited[key] ?? "-");
    }
    const stepDuration = Number(form.dataset.stepDuration || 0);
    const estimated = Math.max(1.5, text.value.length / (7 * segmentTuningValue(form, "speedScale")));
    const previewButton = form.querySelector("[data-segment-speech-preview]");
    if (previewButton instanceof HTMLButtonElement) previewButton.disabled = text.value.trim() === "";
    output.textContent = "概算 " + estimated.toFixed(1) + "秒 / STEP目安 " + stepDuration.toFixed(1) + "秒";
    output.dataset.state = estimated > stepDuration * 1.15 ? "warning" : "ok";
  };
  for (const form of document.querySelectorAll("[data-segment-preview]")) {
    if (!(form instanceof HTMLFormElement)) continue;
    updateSegmentDuration(form);
    form.addEventListener("input", () => updateSegmentDuration(form));
  }

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
      const form = button.closest("[data-segment-preview]");
      if (!(form instanceof HTMLFormElement)) return;
      const data = new FormData(form);
      const utterance = new SpeechSynthesisUtterance(String(data.get("text") || ""));
      utterance.lang = "ja-JP";
      utterance.rate = Math.min(2, Math.max(0.5, segmentTuningValue(form, "speedScale")));
      utterance.pitch = Math.min(2, Math.max(0.5, 1 + segmentTuningValue(form, "pitchScale") * 2));
      utterance.volume = Math.min(1, Math.max(0, segmentTuningValue(form, "volumeScale")));
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
    const speakerSelect = voicePage.querySelector("[data-voice-speaker]");
    const profileSelect = voicePage.querySelector("[data-voice-profile]");
    const setupFeedback = voicePage.querySelector("[data-voice-setup-feedback]");
    const profileTuningForm = voicePage.querySelector("[data-voice-profile-tuning]");
    const generateButton = voicePage.querySelector("[data-voice-generate]");
    const generateFeedback = voicePage.querySelector("[data-voice-generate-feedback]");
    const jobCard = voicePage.querySelector("[data-voice-job]");
    const terminalStatuses = new Set(["completed", "partially_failed", "failed", "cancelled"]);
    let voiceCatalog = [];
    if (profileSelect instanceof HTMLSelectElement) {
      try { voiceCatalog = JSON.parse(profileSelect.dataset.voiceCatalog || "[]"); } catch {}
    }
    const rebuildVoiceStyles = (selectedId) => {
      if (!(speakerSelect instanceof HTMLSelectElement) || !(profileSelect instanceof HTMLSelectElement)) return;
      const profiles = voiceCatalog.filter((profile) => profile.speakerName === speakerSelect.value);
      profileSelect.replaceChildren(...profiles.map((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.styleName;
        return option;
      }));
      if (selectedId && profiles.some((profile) => profile.id === selectedId)) profileSelect.value = selectedId;
    };
    if (speakerSelect instanceof HTMLSelectElement) {
      speakerSelect.addEventListener("change", () => {
        rebuildVoiceStyles();
        const style = profileSelect instanceof HTMLSelectElement
          ? profileSelect.selectedOptions[0]?.textContent || "スタイル"
          : "スタイル";
        if (setupFeedback instanceof HTMLElement) {
          setupFeedback.textContent = speakerSelect.value + "・" + style + "を選択しました。保存すると発表全体へ適用されます。";
          setupFeedback.classList.remove("success", "warning");
        }
      });
    }
    if (profileSelect instanceof HTMLSelectElement) {
      profileSelect.addEventListener("change", () => {
        const selected = voiceCatalog.find((profile) => profile.id === profileSelect.value);
        if (setupFeedback instanceof HTMLElement && selected) {
          setupFeedback.textContent = selected.label + "を選択しました。保存すると発表全体へ適用されます。";
          setupFeedback.classList.remove("success", "warning");
        }
      });
    }
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
        const selectedLabel = speakerSelect instanceof HTMLSelectElement && profileSelect instanceof HTMLSelectElement
          ? speakerSelect.value + "・" + (profileSelect.selectedOptions[0]?.textContent || "選択した声")
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
      const tuningReset = profileTuningForm.querySelector("[data-voice-profile-tuning-reset]");
      profileTuningForm.addEventListener("input", () => { profileTuningForm.dataset.dirty = "true"; });
      if (tuningReset instanceof HTMLButtonElement) {
        tuningReset.addEventListener("click", () => {
          let defaults = {};
          try { defaults = JSON.parse(profileTuningForm.dataset.defaultTuning || "{}"); } catch {}
          for (const [key, value] of Object.entries(defaults)) {
            const input = profileTuningForm.elements.namedItem("tuning_" + key);
            if (input instanceof HTMLInputElement) input.value = String(value);
          }
          profileTuningForm.dispatchEvent(new Event("input", { bubbles: true }));
          if (tuningFeedback instanceof HTMLElement) {
            tuningFeedback.textContent = "VOICEVOX標準値へ戻しました。仮試聴してから保存してください。";
            tuningFeedback.classList.remove("warning", "success");
          }
        });
      }
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
      if (!(button instanceof HTMLButtonElement) || !(profileSelect instanceof HTMLSelectElement) || !(speakerSelect instanceof HTMLSelectElement)) continue;
      button.addEventListener("click", () => {
        const profileId = button.dataset.voicePick || "voicevox-style-3";
        const profile = voiceCatalog.find((item) => item.id === profileId);
        if (!profile) return;
        speakerSelect.value = profile.speakerName;
        rebuildVoiceStyles(profileId);
        const selected = profile.label || (profile.speakerName + "・" + profile.styleName);
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
        let tuning = {};
        try { tuning = JSON.parse(button.dataset.effectiveTuning || "{}"); } catch {}
        utterance.lang = "ja-JP";
        utterance.rate = Math.min(2, Math.max(0.5, Number(tuning.speedScale ?? 1)));
        utterance.pitch = Math.min(2, Math.max(0.5, 1 + Number(tuning.pitchScale ?? 0) * 2));
        utterance.volume = Math.min(1, Math.max(0, Number(tuning.volumeScale ?? 1)));
        if (activePreviewFeedback instanceof HTMLElement) activePreviewFeedback.textContent = "話速・高さ・音量を近似して再生しています…";
        utterance.onend = () => stopPreview("仮試聴が終わりました。");
        utterance.onerror = () => stopPreview("ブラウザ音声を再生できませんでした。");
        speechSynthesis.speak(utterance);
      });
    }
    const segmentFilters = [...voicePage.querySelectorAll("[data-voice-filter]")];
    const voiceSearch = voicePage.querySelector("[data-voice-search]");
    const voiceFilterEmpty = voicePage.querySelector("[data-voice-filter-empty]");
    const voiceVisible = voicePage.querySelector("[data-voice-visible]");
    const voiceSegments = [...voicePage.querySelectorAll("[data-voice-segment]")];
    let activeVoiceFilter = "all";
    const filterVoiceSegments = () => {
      const query = voiceSearch instanceof HTMLInputElement
        ? voiceSearch.value.trim().toLocaleLowerCase("ja")
        : "";
      let visible = 0;
      for (const segment of voiceSegments) {
        if (!(segment instanceof HTMLElement)) continue;
        const state = segment.dataset.state || "";
        const matchesState = activeVoiceFilter === "all" || state === activeVoiceFilter ||
          (activeVoiceFilter === "needs_generation" && ["queued", "running", "generating", "failed"].includes(state));
        const matchesText = query === "" || (segment.dataset.searchText || "").includes(query);
        segment.hidden = !(matchesState && matchesText);
        if (!segment.hidden) visible += 1;
      }
      if (voiceFilterEmpty instanceof HTMLElement) voiceFilterEmpty.hidden = visible > 0;
      if (voiceVisible instanceof HTMLOutputElement) voiceVisible.textContent = visible + " / " + voiceSegments.length + "件表示";
    };
    for (const filterButton of segmentFilters) {
      if (!(filterButton instanceof HTMLButtonElement)) continue;
      filterButton.addEventListener("click", () => {
        activeVoiceFilter = filterButton.dataset.voiceFilter || "all";
        for (const button of segmentFilters) {
          if (button instanceof HTMLButtonElement) button.setAttribute("aria-pressed", String(button === filterButton));
        }
        filterVoiceSegments();
      });
    }
    if (voiceSearch instanceof HTMLInputElement) {
      voiceSearch.addEventListener("input", filterVoiceSegments);
      voiceSearch.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        voiceSearch.value = "";
        filterVoiceSegments();
        voiceSearch.blur();
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
    const dropzone = uploadForm.querySelector("[data-upload-dropzone]");
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
    if (dropzone instanceof HTMLElement && fileInput instanceof HTMLInputElement) {
      for (const eventName of ["dragenter", "dragover"]) {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          if (event instanceof DragEvent && event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          dropzone.dataset.dragActive = "true";
        });
      }
      dropzone.addEventListener("dragleave", (event) => {
        if (event.relatedTarget instanceof Node && dropzone.contains(event.relatedTarget)) return;
        dropzone.dataset.dragActive = "false";
      });
      dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dropzone.dataset.dragActive = "false";
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
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
