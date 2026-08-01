export const DASHBOARD_ASSET_VERSION = "177";

export const DASHBOARD_SCRIPT = String.raw`(() => {
  const slideRoleLabels = { cover: "表紙", section: "章扉", content: "本文", comparison: "比較", result: "結果", closing: "結び" };
  const panelTreatmentLabels = { flat: "素のまま", soft: "やわらかい面", outline: "線で囲む", raised: "浮き上がる", glass: "ガラス" };
  const fragmentIdFromHash = (hash) => {
    const value = hash.startsWith("#") ? hash.slice(1) : hash;
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const revealFragmentTarget = (target) => {
    if (!(target instanceof HTMLElement)) return;
    let details = target instanceof HTMLDetailsElement ? target : target.closest("details");
    while (details instanceof HTMLDetailsElement) {
      details.open = true;
      details = details.parentElement?.closest("details") || null;
    }
  };
  if (location.hash.length > 1) {
    const fragmentTarget = document.getElementById(fragmentIdFromHash(location.hash));
    if (fragmentTarget instanceof HTMLElement) {
      revealFragmentTarget(fragmentTarget);
      if (fragmentTarget.tabIndex === -1) {
        requestAnimationFrame(() => fragmentTarget.focus({ preventScroll: true }));
      }
    }
  }
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    if (!(link instanceof HTMLAnchorElement) || link.hash.length <= 1) continue;
    link.addEventListener("click", () => {
      const target = document.getElementById(fragmentIdFromHash(link.hash));
      if (target instanceof HTMLElement) revealFragmentTarget(target);
    });
  }
  const projectSectionLinks = [...document.querySelectorAll(".project-section-nav a[href^='#']")];
  let currentProjectSectionId = "";
  const setCurrentProjectSection = (id) => {
    if (currentProjectSectionId === id) return;
    currentProjectSectionId = id;
    for (const link of projectSectionLinks) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      if (link.hash === "#" + id) {
        link.setAttribute("aria-current", "location");
        link.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
        });
      } else link.removeAttribute("aria-current");
    }
  };
  for (const link of projectSectionLinks) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener("click", () => {
      const target = document.querySelector(link.hash);
      if (target instanceof HTMLElement) requestAnimationFrame(() => {
        setCurrentProjectSection(target.id);
        target.focus({ preventScroll: true });
      });
    });
  }
  if (projectSectionLinks.length > 0 && "IntersectionObserver" in window) {
    const visibleSections = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleSections.set(entry.target.id, entry.boundingClientRect.top);
        else visibleSections.delete(entry.target.id);
      }
      const current = [...visibleSections].sort((first, second) => Math.abs(first[1]) - Math.abs(second[1]))[0];
      if (current) setCurrentProjectSection(current[0]);
    }, { rootMargin: "-15% 0px -70% 0px" });
    for (const link of projectSectionLinks) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      const target = document.querySelector(link.hash);
      if (target instanceof HTMLElement) observer.observe(target);
    }
  }
  const apiErrorMessage = (result, fallback) => {
    const messages = {
      AUTH_REQUIRED: "ログインの有効期限が切れました。研究一覧からログインし直してください。",
      PROJECT_VERSION_CONFLICT: "別の画面またはAIから先に更新されました。入力はこのブラウザに退避しました。再読み込み後に現在版へ適用できます。",
      PROJECT_NOT_FOUND: "研究が見つかりません。研究一覧へ戻って選び直してください。",
      SLIDE_NOT_FOUND: "スライドが見つかりません。画面を再読み込みしてください。",
      TEMPLATE_NOT_FOUND: "テンプレートが見つかりません。画面を再読み込みしてください。",
      VOICE_PROFILE_NOT_FOUND: "選んだ声が見つかりません。声を選び直してください。",
      VOICE_JOB_NOT_FOUND: "音声生成の状況が見つかりません。音声仕上げ画面を再読み込みしてください。",
      ASSET_IN_USE: "この画像はスライドで使用中です。スライドから外してから削除してください。",
      ASSET_NOT_FOUND: "画像が見つかりません。画面を再読み込みしてください。",
      PROJECT_TOO_LARGE: "研究データが512 KiBの保存上限を超えます。文章や不要なスライドを減らしてから保存してください。"
    };
    const code = result?.error?.code;
    if (code === "PROJECT_TOO_LARGE" && result?.error?.details) {
      const details = result.error.details;
      const current = Number.isFinite(details.current_bytes) ? Math.ceil(details.current_bytes / 1024) + " KiBから" : "";
      const proposed = Number.isFinite(details.proposed_bytes) ? Math.ceil(details.proposed_bytes / 1024) + " KiB" : "上限超過";
      const exceeded = Number.isFinite(details.exceeded_by_bytes) ? Math.ceil(details.exceeded_by_bytes / 1024) + " KiB超過" : "";
      return messages[code] + " " + current + proposed + "へ増えます" + (exceeded ? "（" + exceeded + "）" : "") + "。";
    }
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
  const publicationActionSelector = "[data-create-preview], [data-review-preview], [data-publish-preview], [data-unpublish], [data-publish-rollback]";
  const publicationBaseDisabled = (button) => {
    if (button.matches("[data-create-preview]")) return button.dataset.canPreview !== "true";
    if (button.matches("[data-review-preview]")) return button.dataset.reviewAvailable !== "true";
    if (button.matches("[data-publish-preview]")) {
      return button.dataset.durationValid !== "true" || button.dataset.previewCurrent !== "true" || button.dataset.previewReviewed !== "true" || button.dataset.publishedCurrent === "true";
    }
    return false;
  };
  const syncPublicationDirtyState = (dirtyCount) => {
    const panel = document.querySelector("[data-publication]");
    const notice = document.querySelector("[data-publication-dirty]");
    const blocked = dirtyCount > 0;
    if (panel instanceof HTMLElement) panel.dataset.dirtyBlocked = String(blocked);
    if (notice instanceof HTMLElement) {
      notice.hidden = !blocked;
      notice.textContent = blocked ? "未保存の変更が" + dirtyCount + "件あります。先に保存してから固定プレビュー・公開を操作してください。" : "";
    }
    for (const button of document.querySelectorAll(publicationActionSelector)) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.disabled = blocked || publicationBaseDisabled(button);
    }
  };
  const guardPublicationAction = () => {
    const dirtyForms = [...document.querySelectorAll('[data-dirty="true"]')];
    if (dirtyForms.length === 0) return false;
    syncPublicationDirtyState(dirtyForms.length);
    const first = dirtyForms[0];
    if (first instanceof HTMLElement) {
      first.scrollIntoView({ block: "center", behavior: "smooth" });
      const field = first.querySelector("input:not([type=hidden]), textarea, select");
      if (field instanceof HTMLElement) field.focus({ preventScroll: true });
    }
    return true;
  };
  const reloadPublicationWhenSafe = (feedback) => {
    setTimeout(() => {
      if (document.querySelector('[data-dirty="true"]') === null) location.reload();
      else if (feedback instanceof HTMLElement) {
        feedback.textContent += " 未保存の入力を保護するため自動再読み込みを止めました。保存後に画面を再読み込みすると履歴も更新されます。";
        feedback.classList.add("warning");
      }
    }, 700);
  };
  const saveState = document.querySelector("[data-save-state]");
  const syncMobilePreviewBadge = () => {
    const previewBadge = document.querySelector("[data-mobile-preview-badge]");
    if (previewBadge instanceof HTMLElement) previewBadge.hidden = document.body.dataset.mobilePreviewPending !== "true";
  };
  const markMobilePreviewPending = (awaitDiagnostics = false) => {
    document.body.dataset.mobilePreviewPending = "true";
    if (awaitDiagnostics) document.body.dataset.mobilePreviewAwaiting = "true";
    syncMobilePreviewBadge();
  };
  const confirmMobilePreview = () => {
    document.body.dataset.mobilePreviewPending = "false";
    document.body.dataset.mobilePreviewAwaiting = "false";
    syncMobilePreviewBadge();
  };
  const syncSaveState = () => {
    const dirtyCount = document.querySelectorAll('[data-dirty="true"]').length;
    if (saveState instanceof HTMLElement) {
      saveState.dataset.state = dirtyCount > 0 ? "dirty" : "saved";
      saveState.textContent = dirtyCount > 0 ? "未保存 " + dirtyCount + "件" : "保存済み";
      if (dirtyCount > 0) markMobilePreviewPending(document.body.dataset.mobilePane === "preview");
    }
    syncPublicationDirtyState(dirtyCount);
    syncMobilePreviewBadge();
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
      publishButton.dataset.previewCurrent = "false";
      publishButton.dataset.previewReviewed = "false";
      publishButton.dataset.publishedCurrent = "false";
      publishButton.textContent = "確認した版を公開";
    }
    const reviewButton = document.querySelector("[data-review-preview]");
    if (reviewButton instanceof HTMLButtonElement) {
      reviewButton.dataset.reviewAvailable = "false";
      reviewButton.disabled = true;
      reviewButton.textContent = "終了画面の到達待ち";
    }
    const reviewStatus = document.querySelector("[data-preview-review-status]");
    if (reviewStatus instanceof HTMLElement) reviewStatus.textContent = "対象なし";
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
    const projectSearchKey = "ultimate-freestyle:project-search:" + (projectSearch.dataset.projectSearchUser || "unknown");
    let savedProjectView = {};
    try { savedProjectView = JSON.parse(localStorage.getItem(projectViewKey) || "{}"); } catch {}
    if (!savedProjectView || typeof savedProjectView !== "object" || Array.isArray(savedProjectView)) savedProjectView = {};
    let activeFilter = ["all", "ready", "published", "attention", "missing"].includes(savedProjectView.filter) ? savedProjectView.filter : "all";
    const filterProjects = () => {
      const query = projectSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const card of projectCards) {
        if (!(card instanceof HTMLElement)) continue;
        const matchesText = query === "" || (card.dataset.searchText || "").includes(query);
        const matchesFilter = activeFilter === "all" ||
          (activeFilter === "attention"
            ? card.dataset.needsAttention === "true"
            : ["ready", "missing"].includes(activeFilter)
              ? card.dataset.presentation === activeFilter
              : card.dataset.projectState === activeFilter);
        const matches = matchesText && matchesFilter;
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      if (resultCount instanceof HTMLElement) resultCount.textContent = visible + "件を表示";
      if (emptyResult instanceof HTMLElement) emptyResult.hidden = visible > 0;
    };
    try { projectSearch.value = sessionStorage.getItem(projectSearchKey) || ""; } catch {}
    projectSearch.addEventListener("input", () => {
      try { sessionStorage.setItem(projectSearchKey, projectSearch.value); } catch {}
      filterProjects();
    });
    projectSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      projectSearch.value = "";
      try { sessionStorage.removeItem(projectSearchKey); } catch {}
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
    let sweepResults = [];
    let sweepTimer;
    let sweepFrameMode = "unloaded";
    const totalCheckpoints = slides.reduce((total, slide) => total + Number(slide.max_step || 0) + 1, 0);
    const presentationSlideCount = slides.filter((slide) => slide.id !== "__prelude__").length;
    const includesPrelude = slides.some((slide) => slide.id === "__prelude__");
    const sweepStorageKey = "ultimate-freestyle:quality-sweep:" + (qualitySweepButton.dataset.projectId || "") + ":v" + (qualitySweepButton.dataset.projectVersion || "");
    const renderSweepResult = (result) => {
      if (!(qualitySweepResults instanceof HTMLOListElement)) return;
      const item = document.createElement("li");
      if (!result.warning) item.classList.add("success");
      if (result.href) {
        const link = document.createElement("a");
        link.href = result.href;
        link.textContent = result.label;
        item.append(link, document.createTextNode(" — " + result.message));
      } else item.textContent = result.message;
      qualitySweepResults.append(item);
    };
    const appendSweepResult = (slide, message, warning = true) => {
      const result = { slide_id: slide?.id || "__all__", href: slide?.href || "", label: slide?.href ? slide.number + ". " + slide.title : "", message, warning };
      sweepResults.push(result);
      renderSweepResult(result);
    };
    const persistQualitySweep = (state) => {
      try {
        sessionStorage.setItem(sweepStorageKey, JSON.stringify({ state, completed_checkpoints: completedCheckpoints, total_checkpoints: totalCheckpoints, issue_count: sweepIssueCount, results: sweepResults }));
      } catch {}
    };
    const saveQualitySweep = async (state) => {
      try {
        const response = await fetch(qualitySweepButton.dataset.reportUrl || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": qualitySweepButton.dataset.csrf || ""
          },
          body: JSON.stringify({
            project_version: Number(qualitySweepButton.dataset.projectVersion),
            renderer_version: qualitySweepButton.dataset.rendererVersion || "",
            status: state,
            completed_checkpoints: completedCheckpoints,
            total_checkpoints: totalCheckpoints,
            issue_count: sweepIssueCount,
            results: sweepResults
              .filter((result) => result.warning && result.slide_id)
              .slice(0, 60)
              .map((result) => ({
                slide_id: String(result.slide_id).slice(0, 64),
                message: String(result.message).slice(0, 300),
                warning: true
              }))
          })
        });
        if (!response.ok && qualitySweepStatus instanceof HTMLElement) {
          qualitySweepStatus.textContent += " 結果を共有保存できませんでした。";
          qualitySweepStatus.classList.add("warning");
        } else if (response.ok) {
          const sharedState = document.querySelector("[data-rendered-quality-state]");
          if (sharedState instanceof HTMLElement) {
            sharedState.textContent = sweepIssueCount ? "要確認 " + sweepIssueCount + "件" : "確認済み";
          }
        }
      } catch {
        if (qualitySweepStatus instanceof HTMLElement) {
          qualitySweepStatus.textContent += " 結果を共有保存できませんでした。";
          qualitySweepStatus.classList.add("warning");
        }
      }
    };
    const finishQualitySweep = () => {
      sweepRunning = false;
      clearTimeout(sweepTimer);
      setButtonBusy(qualitySweepButton, false);
      qualitySweepButton.textContent = "もう一度チェック";
      if (qualitySweepCancel instanceof HTMLButtonElement) qualitySweepCancel.hidden = true;
      if (qualitySweepStatus instanceof HTMLElement) {
        qualitySweepStatus.textContent = sweepIssueCount
          ? sweepIssueCount + "項目に確認事項があります。"
          : (includesPrelude ? "0ページ目と" : "") + "全" + presentationSlideCount + "枚・" + totalCheckpoints + "段階が発表枠内に収まっています。";
        qualitySweepStatus.classList.toggle("warning", sweepIssueCount > 0);
        qualitySweepStatus.classList.toggle("success", sweepIssueCount === 0);
      }
      if (sweepIssueCount === 0) appendSweepResult(null, "全段階で見切れ、過剰な自動縮小、配色の確認事項は見つかりませんでした。", false);
      persistQualitySweep("completed");
      void saveQualitySweep("completed");
    };
    const requestSweepPosition = () => {
      const slide = slides[sweepIndex];
      if (!slide) { finishQualitySweep(); return; }
      if (slide.id === "__prelude__") {
        if (sweepFrameMode !== "prelude") {
          const url = new URL(qualitySweepButton.dataset.frameUrl || "", location.origin);
          url.searchParams.set("prelude", "1");
          url.searchParams.set("quality_run", String(Date.now()));
          sweepFrameMode = "prelude";
          qualitySweepFrame.src = url.toString();
        }
        waitForSweepResult();
        return;
      }
      if (sweepFrameMode !== "slides") {
        const url = new URL(qualitySweepButton.dataset.frameUrl || "", location.origin);
        url.searchParams.set("slide", String(sweepIndex + (includesPrelude ? 0 : 1)));
        url.searchParams.set("step", String(sweepStep));
        url.searchParams.set("quality_run", String(Date.now()));
        sweepFrameMode = "slides";
        qualitySweepFrame.src = url.toString();
        waitForSweepResult();
        return;
      }
      qualitySweepFrame.contentWindow?.postMessage({ type: "ultimate-freestyle:set-position", slide: sweepIndex + (includesPrelude ? 0 : 1), step: sweepStep }, location.origin);
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
      else {
        persistQualitySweep("partial");
        requestSweepPosition();
      }
    };
    const waitForSweepResult = () => {
      clearTimeout(sweepTimer);
      const slide = slides[sweepIndex];
      const timeout = slide?.id === "__prelude__"
        ? Math.max(5000, Number(qualitySweepButton.dataset.preludeMinimumMs || 0) + 2000)
        : 5000;
      sweepTimer = setTimeout(() => {
        if (!sweepRunning) return;
        currentSlideFindings.push("STEP " + sweepStep + ": 描画結果を取得できませんでした");
        advanceQualitySweep();
      }, timeout);
    };
    addEventListener("message", (event) => {
      if (!sweepRunning || event.origin !== location.origin || event.source !== qualitySweepFrame.contentWindow) return;
      const data = event.data;
      const slide = slides[sweepIndex];
      if (!data || data.type !== "ultimate-freestyle:render-diagnostics" || data.slide_id !== slide?.id || Number(data.step) !== sweepStep) return;
      if (slide.id === "__prelude__" && data.ready !== true) return;
      clearTimeout(sweepTimer);
      const overflows = Array.isArray(data.overflows) ? data.overflows : [];
      const compressed = Array.isArray(data.fits)
        ? data.fits.filter((item) => Number.isFinite(item?.fit_scale) && item.fit_scale < 0.7)
        : [];
      const contrasts = Array.isArray(data.contrasts)
        ? data.contrasts.filter((item) => Number.isFinite(item?.ratio) && Number.isFinite(item?.required) && (item.ratio < item.required || item.manual_review === true))
        : [];
      const clamps = Array.isArray(data.clamps)
        ? data.clamps.filter((item) => Number.isFinite(item?.hidden_lines) && item.hidden_lines > 0)
        : [];
      const readability = Array.isArray(data.readability)
        ? data.readability.filter((item) => Number.isFinite(item?.font_size_px) && Number.isFinite(item?.recommended_px) && item.font_size_px < item.recommended_px)
        : [];
      const occlusions = Array.isArray(data.occlusions)
        ? data.occlusions.filter((item) => typeof item?.id === "string" && typeof item?.other_id === "string" && Number.isFinite(item?.overlap_ratio) && item.overlap_ratio >= 0.2)
        : [];
      const fonts = Array.isArray(data.fonts)
        ? data.fonts.filter((item) => typeof item?.role === "string" && typeof item?.preset === "string" && Array.isArray(item?.candidates))
        : [];
      if (overflows.length || compressed.length || contrasts.length || clamps.length || readability.length || occlusions.length || fonts.length) {
        const details = [
          overflows.length ? "見切れ" + overflows.length + "か所" : "",
          compressed.length ? "70%未満の縮小" + compressed.length + "か所" : "",
          contrasts.length ? "配色の目視確認" + contrasts.length + "か所" : "",
          clamps.length ? "読み上げ文の省略" + clamps.length + "か所" : "",
          readability.length ? "小さすぎる文字" + readability.length + "か所" : "",
          occlusions.length ? "表示パーツの重なり" + occlusions.length + "組" : "",
          fonts.length ? "指定フォントの代替表示" + fonts.length + "件" : ""
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
      sweepResults = [];
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
      sweepFrameMode = "unloaded";
      requestSweepPosition();
    });
    if (qualitySweepCancel instanceof HTMLButtonElement) {
      qualitySweepCancel.addEventListener("click", () => {
        if (!sweepRunning) return;
        sweepRunning = false;
        clearTimeout(sweepTimer);
        qualitySweepFrame.removeAttribute("src");
        sweepFrameMode = "unloaded";
        qualitySweepCancel.hidden = true;
        setButtonBusy(qualitySweepButton, false);
        qualitySweepButton.textContent = "最初からチェック";
        if (qualitySweepStatus instanceof HTMLElement) {
          qualitySweepStatus.textContent = completedCheckpoints + " / " + totalCheckpoints + "段階で中断しました。途中結果は下に残しています。";
          qualitySweepStatus.classList.remove("success", "warning");
        }
        persistQualitySweep("cancelled");
        void saveQualitySweep("cancelled");
      });
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(sweepStorageKey) || "null");
      if (saved && saved.total_checkpoints === totalCheckpoints && Array.isArray(saved.results)) {
        if (qualitySweepResults instanceof HTMLOListElement) qualitySweepResults.replaceChildren();
        sweepResults = saved.results.filter((result) => result && typeof result.message === "string" && typeof result.href === "string" && typeof result.label === "string" && typeof result.warning === "boolean");
        sweepResults.forEach(renderSweepResult);
        completedCheckpoints = Math.min(Math.max(Number(saved.completed_checkpoints) || 0, 0), totalCheckpoints);
        sweepIssueCount = Math.max(Number(saved.issue_count) || 0, 0);
        if (qualitySweepProgress instanceof HTMLProgressElement) {
          qualitySweepProgress.hidden = false;
          qualitySweepProgress.value = completedCheckpoints;
        }
        qualitySweepButton.textContent = "もう一度チェック";
        if (qualitySweepStatus instanceof HTMLElement) {
          qualitySweepStatus.textContent = saved.state === "completed"
            ? "前回の確認結果：" + (sweepIssueCount ? sweepIssueCount + "項目に確認事項があります。" : "確認事項はありません。")
            : "前回は" + completedCheckpoints + " / " + totalCheckpoints + "段階まで確認しました。最初から再実行できます。";
          qualitySweepStatus.classList.toggle("warning", sweepIssueCount > 0 || saved.state !== "completed");
          qualitySweepStatus.classList.toggle("success", sweepIssueCount === 0 && saved.state === "completed");
        }
      }
    } catch {}
  }
  const slideEditor = document.querySelector("[data-slide-editor]");
  const typographyEditor = document.querySelector("[data-typography-editor]");
  const templateEditor = document.querySelector("[data-template-editor]");
  const appearanceEditor = document.querySelector("[data-appearance-editor]");
  const compositionEditor = document.querySelector("[data-composition-editor]");
  const narrationSettingsEditor = document.querySelector("[data-narration-settings-editor]");
  const slideFrame = document.querySelector("[data-slide-frame]");
  const frameLoading = document.querySelector("[data-frame-loading]");
  let previewFrameGeneration = 0;
  let previewFrameLoadedGeneration = -1;
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
  let draftCompositionTimer;
  let draftCanvasTimer;
  let previewRequestSequence = 0;
  let latestPreviewRequestId = 0;
  const previewDebounceMs = 80;
  let setWorkspaceStep = () => {};
  const postPreviewMessage = (message) => {
    if (!(slideFrame instanceof HTMLIFrameElement)) return;
    const requestId = ++previewRequestSequence;
    latestPreviewRequestId = requestId;
    slideFrame.contentWindow?.postMessage({ ...message, request_id: requestId }, location.origin);
  };
  const syncSlideDraft = () => {
    if (!(slideEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(slideEditor);
    updateRecommendedBodyLimit(currentPreviewTypography);
    postPreviewMessage({
      type: "ultimate-freestyle:preview-fields",
      slide_id: slideEditor.dataset.slideId || "",
      title: String(data.get("title") || ""),
      content_markdown: String(data.get("content_markdown") || ""),
      sidebar_markdown: String(data.get("sidebar_markdown") || "")
    });
  };
  if (slideEditor instanceof HTMLFormElement) {
    slideEditor.addEventListener("input", () => {
      clearTimeout(draftFrameTimer);
      draftFrameTimer = setTimeout(syncSlideDraft, previewDebounceMs);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = slideEditor.dataset.compositionMode === "flow"
          ? "入力内容をプレビューへ反映しています…"
          : "代替テキストを編集中です。見える内容は「構造」の表示パーツで編集します。";
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
    postPreviewMessage({
      type: "ultimate-freestyle:preview-typography",
      slide_id: typographyEditor.dataset.slideId || "",
      typography
    });
  };
  if (typographyEditor instanceof HTMLFormElement) {
    typographyEditor.addEventListener("input", () => {
      clearTimeout(draftTypographyTimer);
      draftTypographyTimer = setTimeout(syncTypographyDraft, previewDebounceMs);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "組版をプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
  }
  const roleStyleStringFields = ["region_layout", "background", "surface", "foreground", "muted", "accent", "accent_secondary", "border", "visual_preset", "body_font", "heading_font", "density", "motion_style", "enter_animation", "reveal_animation", "motif", "motif_color", "heading_treatment", "image_treatment", "panel_treatment"];
  const roleStyleNumberFields = ["sidebar_width_percent", "corner_radius_px", "spacing_scale", "font_scale", "body_weight", "heading_weight", "line_height", "letter_spacing_em", "motif_opacity", "motif_scale"];
  const templateRoleStyles = (form, data, roleOverride) => {
    const editor = form.querySelector("[data-role-style-editor]");
    if (!(editor instanceof HTMLElement)) return {};
    let roleStyles = {};
    try { roleStyles = JSON.parse(editor.dataset.roleStyles || "{}"); } catch {}
    const role = String(roleOverride || data.get("role_style_role") || "content");
    if (data.has("role_style_enabled")) {
      const style = {};
      for (const field of roleStyleStringFields) {
        const value = String(data.get("role_style_" + field) || "").trim();
        if (value) style[field] = value;
      }
      for (const field of roleStyleNumberFields) {
        const value = String(data.get("role_style_" + field) || "").trim();
        if (value !== "" && Number.isFinite(Number(value))) style[field] = Number(value);
      }
      roleStyles[role] = style;
    } else delete roleStyles[role];
    editor.dataset.roleStyles = JSON.stringify(roleStyles);
    const summary = editor.querySelector("[data-role-style-summary]");
    if (summary instanceof HTMLElement) {
      summary.replaceChildren();
      const roles = Object.keys(roleStyles);
      for (const item of roles.length ? roles : [""]) {
        const chip = document.createElement("span");
        chip.textContent = item ? slideRoleLabels[item] || item : "差分なし";
        summary.append(chip);
      }
    }
    return roleStyles;
  };
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
    const roleStyles = templateRoleStyles(templateEditor, data);
    const previewRole = String(data.get("role_style_role") || "content");
    const roleStyle = roleStyles[previewRole] || {};
    const roleMainContrast = colorContrast(roleStyle.background || String(data.get("background")), roleStyle.foreground || String(data.get("foreground")));
    const roleSidebarContrast = colorContrast(roleStyle.surface || String(data.get("surface")), roleStyle.muted || String(data.get("muted")));
    const roleContrastStatus = templateEditor.querySelector("[data-role-contrast-status]");
    if (roleContrastStatus instanceof HTMLElement) {
      const readable = roleMainContrast >= 4.5 && roleSidebarContrast >= 4.5;
      roleContrastStatus.textContent = "この役割の本文 " + roleMainContrast.toFixed(1) + ":1 · 補足 " + roleSidebarContrast.toFixed(1) + ":1" + (readable ? " — 目安を満たしています。" : " — 4.5:1未満を見直してください。");
      roleContrastStatus.dataset.level = readable ? "ok" : "warning";
    }
    postPreviewMessage({
      type: "ultimate-freestyle:preview-template",
      slide_id: templateEditor.dataset.slideId || "",
      preview_role: previewRole,
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
        reveal_animation: String(data.get("reveal_animation") || "rise"),
        visual_preset: String(data.get("visual_preset") || "studio"),
        body_font: String(data.get("body_font") || "system-sans"),
        heading_font: String(data.get("heading_font") || "system-sans"),
        density: String(data.get("density") || "comfortable"),
        motion_style: String(data.get("motion_style") || "calm"),
        motif: String(data.get("motif") || "none"),
        motif_color: String(data.get("motif_color") || data.get("accent") || "#9d7bff"),
        motif_opacity: Number(data.get("motif_opacity")),
        motif_scale: Number(data.get("motif_scale")),
        heading_treatment: String(data.get("heading_treatment") || "plain"),
        image_treatment: String(data.get("image_treatment") || "natural"),
        panel_treatment: String(data.get("panel_treatment") || "flat"),
        role_styles: roleStyles,
        body_weight: Number(data.get("body_weight")),
        heading_weight: Number(data.get("heading_weight")),
        line_height: Number(data.get("line_height")),
        letter_spacing_em: Number(data.get("letter_spacing_em")),
        apply_line_height: typographyData?.get("preset") === "standard" && String(typographyData.get("typography_line_height") || "") === ""
      }
    });
  };
  if (templateEditor instanceof HTMLFormElement) {
    templateEditor.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLSelectElement) || event.target.name !== "role_style_role") {
        templateRoleStyles(templateEditor, new FormData(templateEditor));
      }
      clearTimeout(draftTemplateTimer);
      draftTemplateTimer = setTimeout(syncTemplateDraft, previewDebounceMs);
      const layoutStatus = document.querySelector("[data-layout-status]");
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = "テンプレートをプレビューへ反映しています…";
        layoutStatus.dataset.level = "";
      }
    });
    const roleStyleEditor = templateEditor.querySelector("[data-role-style-editor]");
    const roleSelect = templateEditor.elements.namedItem("role_style_role");
    const loadRoleStyle = () => {
      if (!(roleStyleEditor instanceof HTMLElement) || !(roleSelect instanceof HTMLSelectElement)) return;
      let roleStyles = {};
      let base = {};
      try { roleStyles = JSON.parse(roleStyleEditor.dataset.roleStyles || "{}"); } catch {}
      try { base = JSON.parse(roleStyleEditor.dataset.roleStyleBase || "{}"); } catch {}
      const style = roleStyles[roleSelect.value];
      const enabled = templateEditor.elements.namedItem("role_style_enabled");
      if (enabled instanceof HTMLInputElement) enabled.checked = Boolean(style);
      for (const field of [...roleStyleStringFields, ...roleStyleNumberFields]) {
        const control = templateEditor.elements.namedItem("role_style_" + field);
        if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.value = style?.[field] ?? "";
        const picker = templateEditor.elements.namedItem("role_style_" + field + "_picker");
        if (picker instanceof HTMLInputElement && picker.type === "color") picker.value = style?.[field] || base[field] || "#000000";
      }
    };
    let activeRoleStyleRole = roleSelect instanceof HTMLSelectElement ? roleSelect.value : "content";
    if (roleSelect instanceof HTMLSelectElement) {
      roleSelect.addEventListener("change", () => {
        clearTimeout(draftTemplateTimer);
        templateRoleStyles(templateEditor, new FormData(templateEditor), activeRoleStyleRole);
        activeRoleStyleRole = roleSelect.value;
        loadRoleStyle();
        draftTemplateTimer = setTimeout(syncTemplateDraft, previewDebounceMs);
      });
    }
    for (const picker of templateEditor.querySelectorAll("[data-role-style-color]")) {
      if (!(picker instanceof HTMLInputElement) || picker.type !== "color") continue;
      const textField = templateEditor.elements.namedItem("role_style_" + (picker.dataset.roleStyleColor || ""));
      if (!(textField instanceof HTMLInputElement)) continue;
      picker.addEventListener("input", () => {
        textField.value = picker.value;
        textField.dispatchEvent(new Event("input", { bubbles: true }));
      });
      textField.addEventListener("input", () => {
        if (/^#[0-9a-f]{6}$/i.test(textField.value)) picker.value = textField.value;
      });
    }
  }
  const syncAppearanceDraft = () => {
    if (!(appearanceEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(appearanceEditor);
    let templates = {};
    try { templates = JSON.parse(appearanceEditor.dataset.previewTemplates || "{}"); } catch {}
    const templateId = String(data.get("template_id") || "");
    const template = templates[templateId] || templates[""] || {};
    postPreviewMessage({
      type: "ultimate-freestyle:preview-appearance",
      slide_id: appearanceEditor.dataset.slideId || "",
      role: String(data.get("role") || "content"),
      cover_layout: String(data.get("cover_layout") || "center"),
      tone: String(data.get("tone") || "dark"),
      enter_animation: String(data.get("enter_animation") || template.enter_animation || "fade"),
      template
    });
  };
  if (appearanceEditor instanceof HTMLFormElement) {
    appearanceEditor.addEventListener("input", () => {
      clearTimeout(draftAppearanceTimer);
      draftAppearanceTimer = setTimeout(syncAppearanceDraft, previewDebounceMs);
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
      postPreviewMessage({
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
          max_lines: Number(data.get("max_lines")),
          background: String(data.get("appearance_background") || "") || undefined,
          foreground: String(data.get("appearance_foreground") || "") || undefined,
          border_color: String(data.get("appearance_border_color") || "") || undefined,
          accent: String(data.get("appearance_accent") || "") || undefined,
          corner_radius_px: optionalNumberValue(data, "appearance_corner_radius_px")
        }
      });
    }
    for (const form of document.querySelectorAll("[data-segment-preview]")) {
      if (!(form instanceof HTMLFormElement)) continue;
      const data = new FormData(form);
      postPreviewMessage({
        type: "ultimate-freestyle:preview-narration-segment",
        slide_id: form.dataset.slideId || "",
        at: Number(data.has("at") ? data.get("at") : form.dataset.segmentAt || 0),
        text: String(data.get("text") || ""),
        speaker: String(data.get("speaker") || "")
      });
    }
  };
  const scheduleNarrationDraft = () => {
    clearTimeout(draftNarrationTimer);
    draftNarrationTimer = setTimeout(syncNarrationDrafts, previewDebounceMs);
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
    previewFrameGeneration += 1;
    markMobilePreviewPending(true);
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
  const serializeVersionedForm = (form, submitter = null) => {
    const data = new FormData(form);
    const body = { expected_version: Number(form.dataset.version) };
    if (form.matches("[data-project-editor]")) {
      for (const name of ["title", "stage", "summary", "question", "hypothesis", "method"]) {
        if (data.has(name)) body[name] = String(data.get(name) || "");
      }
    }
    if (form.matches("[data-project-list-item]")) {
      const action = submitter instanceof HTMLButtonElement
        ? submitter.dataset.projectListAction || ""
        : "";
      Object.assign(body, {
        action,
        list: String(data.get("list") || "")
      });
      if (data.has("index")) body.index = Number(data.get("index"));
      if (action !== "delete") body.value = String(data.get("value") || "");
    }
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
    if (form.matches("[data-composition-editor]")) Object.assign(body, {
      composition_background: String(data.get("composition_background") || ""),
      composition_clip_content: data.has("composition_clip_content")
    });
    if (form.matches("[data-composition-create]")) Object.assign(body, {
      mode: String(data.get("composition_mode") || "canvas")
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
    if (form.matches("[data-canvas-block-editor]")) {
      Object.assign(body, { block: sceneComponentFromForm(form) });
    }
    if (form.matches("[data-canvas-block-create]")) Object.assign(body, {
      kind: String(data.get("kind") || "markdown"),
      asset_id: String(data.get("asset_id") || "") || null
    });
    if (form.matches("[data-scene-component-create]")) Object.assign(body, {
      kind: String(data.get("kind") || "markdown"),
      parent_id: String(data.get("parent_id") || "") || null,
      asset_id: String(data.get("asset_id") || "") || null
    });
    if (form.matches("[data-slide-create]")) Object.assign(body, {
      title: String(data.get("title") || ""),
      position: numberValue(data, "position"),
      template: String(data.get("slide_template") || "flow")
    });
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
      design_notes: String(data.get("design_notes") || ""),
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
      motif: String(data.get("motif") || "none"),
      motif_color: String(data.get("motif_color") || ""),
      motif_opacity: numberValue(data, "motif_opacity"),
      motif_scale: numberValue(data, "motif_scale"),
      heading_treatment: String(data.get("heading_treatment") || "plain"),
      image_treatment: String(data.get("image_treatment") || "natural"),
      panel_treatment: String(data.get("panel_treatment") || "flat"),
      role_styles: templateRoleStyles(form, data),
      make_default: data.has("make_default")
    });
    if (form.matches("[data-template-create]")) Object.assign(body, {
      template_id: String(data.get("template_id") || ""),
      name: String(data.get("name") || ""),
      design_notes: String(data.get("design_notes") || "").trim() || undefined,
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
        max_lines: numberValue(data, "max_lines"),
        background: String(data.get("appearance_background") || "") || undefined,
        foreground: String(data.get("appearance_foreground") || "") || undefined,
        border_color: String(data.get("appearance_border_color") || "") || undefined,
        accent: String(data.get("appearance_accent") || "") || undefined,
        corner_radius_px: optionalNumberValue(data, "appearance_corner_radius_px")
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
      const voiceCues = [...form.querySelectorAll("[data-voice-cue]")].map((cue, index) => {
        const value = (name) => cue.querySelector('[name="' + name + '"]');
        const stringValue = (name) => value(name) instanceof HTMLInputElement || value(name) instanceof HTMLTextAreaElement || value(name) instanceof HTMLSelectElement
          ? value(name).value
          : "";
        const cueTuning = {};
        for (const key of ["speedScale", "pitchScale", "intonationScale"]) {
          const raw = stringValue("cue_" + key).trim();
          if (raw !== "" && Number.isFinite(Number(raw))) cueTuning[key] = Number(raw);
        }
        const pauseSeconds = Number(stringValue("cue_pause_after_seconds") || 0);
        return {
          id: stringValue("cue_id") || "cue-" + (index + 1),
          text: stringValue("cue_text"),
          voice_profile_id: stringValue("cue_profile_id") || null,
          voice_tuning: Object.keys(cueTuning).length ? cueTuning : null,
          pause_after_ms: Math.round(Math.max(0, pauseSeconds) * 10) * 100
        };
      });
      const composedText = voiceCues.map((cue) => cue.text).join("");
      Object.assign(body, {
        text: composedText || String(data.get("text") || ""),
        speaker: String(data.get("speaker") || "").trim() || null,
        voice_profile_id: String(data.get("voice_profile_id") || "") || null,
        voice_tuning: Object.keys(tuning).length ? tuning : null,
        voice_cues: voiceCues,
        pause_before_ms: Math.round(Math.max(0, Number(data.get("pause_before_seconds") || 0)) * 10) * 100,
        pause_after_ms: Math.round(Math.max(0, Number(data.get("pause_after_seconds") || 0.35)) * 10) * 100
      });
    }
    return body;
  };
  const versionedForms = [...document.querySelectorAll("[data-versioned-form], [data-project-editor]")];
  const selectedOptionLabel = (form, name) => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent?.trim() || "" : "";
  };
  const setSettingValue = (name, value) => {
    const target = document.querySelector('[data-setting-value="' + name + '"]');
    if (target instanceof HTMLElement && value) target.textContent = value;
  };
  const syncSavedWorkspaceMetadata = (form, result = {}) => {
    const activeFilmstrip = document.querySelector('.filmstrip-link[data-active="true"]');
    if (form.matches("[data-slide-editor]")) {
      const titleField = form.elements.namedItem("title");
      const durationField = form.elements.namedItem("duration_seconds");
      if (titleField instanceof HTMLInputElement) {
        const title = titleField.value.trim();
        const heading = document.querySelector("[data-current-slide-title]");
        const filmstripTitle = activeFilmstrip?.querySelector("[data-filmstrip-title]");
        if (heading instanceof HTMLElement) heading.textContent = title;
        if (filmstripTitle instanceof HTMLElement) filmstripTitle.textContent = title;
        if (slideFrame instanceof HTMLIFrameElement) slideFrame.title = title + "の実表示";
        document.title = title + " — スライド編集";
        if (activeFilmstrip instanceof HTMLElement) {
          const previous = activeFilmstrip.dataset.slideTitle || "";
          const searchText = activeFilmstrip.dataset.searchText || "";
          const next = title.toLocaleLowerCase("ja");
          activeFilmstrip.dataset.searchText = searchText.startsWith(previous) ? next + searchText.slice(previous.length) : next + " " + searchText;
          activeFilmstrip.dataset.slideTitle = next;
        }
      }
      if (durationField instanceof HTMLInputElement) {
        const duration = Number(durationField.value);
        const filmstripDuration = activeFilmstrip?.querySelector("[data-filmstrip-duration]");
        if (filmstripDuration instanceof HTMLElement && Number.isFinite(duration)) filmstripDuration.textContent = duration + "秒";
        const durationStatus = document.querySelector("[data-workspace-duration]");
        if (durationStatus instanceof HTMLElement && Number.isFinite(duration)) {
          const previous = Number(durationStatus.dataset.slideDuration);
          const total = Math.max(0, Number(durationStatus.dataset.totalDuration) - previous + duration);
          durationStatus.dataset.slideDuration = String(duration);
          durationStatus.dataset.totalDuration = String(total);
        }
      }
    }
    if (form.matches("[data-appearance-editor]")) {
      let templates = {};
      try { templates = JSON.parse(form.dataset.previewTemplates || "{}"); } catch {}
      const templateField = form.elements.namedItem("template_id");
      const templateId = templateField instanceof HTMLSelectElement ? templateField.value : "";
      const templateLabel = templates[templateId]?.template_name || selectedOptionLabel(form, "template_id").replace(/ · 発表全体の既定$/, "");
      setSettingValue("template", templateLabel);
      setSettingValue("tone", selectedOptionLabel(form, "tone"));
      let animationLabel = selectedOptionLabel(form, "enter_animation");
      const animationField = form.elements.namedItem("enter_animation");
      if (animationField instanceof HTMLSelectElement && animationField.value === "") {
        const effective = templates[templateId]?.enter_animation || templates[""]?.enter_animation;
        const effectiveOption = [...animationField.options].find((option) => option.value === effective);
        if (effectiveOption) animationLabel = effectiveOption.textContent + "（継承）";
      }
      setSettingValue("animation", animationLabel);
      if (activeFilmstrip instanceof HTMLElement) {
        const roleField = form.elements.namedItem("role");
        const existing = activeFilmstrip.querySelector("[data-filmstrip-role]");
        if (roleField instanceof HTMLSelectElement) {
          const previousRole = activeFilmstrip.dataset.roleLabel || "";
          const nextRole = slideRoleLabels[roleField.value] || roleField.value;
          const searchText = activeFilmstrip.dataset.searchText || "";
          activeFilmstrip.dataset.searchText = searchText.replace(" " + previousRole + " ", " " + nextRole + " ");
          activeFilmstrip.dataset.roleLabel = nextRole;
          setSettingValue("role", nextRole);
        }
        if (roleField instanceof HTMLSelectElement && !(existing instanceof HTMLElement)) {
          const badge = document.createElement("small");
          badge.className = "stage";
          badge.dataset.filmstripRole = "";
          badge.textContent = slideRoleLabels[roleField.value] || roleField.value;
          activeFilmstrip.querySelector("[data-filmstrip-title]")?.insertAdjacentElement("afterend", badge);
        } else if (roleField instanceof HTMLSelectElement && existing instanceof HTMLElement) {
          existing.textContent = slideRoleLabels[roleField.value] || roleField.value;
        }
      }
    }
    if (form.matches("[data-typography-editor]")) {
      setSettingValue("typography", selectedOptionLabel(form, "preset") + " · " + Number(currentPreviewTypography.columns || 1) + "段");
    }
    if (form.matches("[data-narration-settings-editor]")) setSettingValue("narration", selectedOptionLabel(form, "display"));
    if (form.matches("[data-template-editor]") && result.template) {
      const templateId = String(result.template_id || form.dataset.templateId || "");
      const templateName = String(result.template.name || "");
      const isDefault = result.default_template_id === templateId;
      for (const option of document.querySelectorAll('select[name="template_id"] option[value="' + CSS.escape(templateId) + '"], select[name="source_template_id"] option[value="' + CSS.escape(templateId) + '"]')) {
        if (option instanceof HTMLOptionElement) option.textContent = templateName + (isDefault ? " · 発表全体の既定" : "");
      }
      for (const option of document.querySelectorAll('select[name="template_id"] option, select[name="source_template_id"] option')) {
        if (!(option instanceof HTMLOptionElement) || option.value === "") continue;
        const plain = option.textContent?.replace(/ · 発表全体の既定$/, "") || "";
        option.textContent = plain + (result.default_template_id === option.value ? " · 発表全体の既定" : "");
      }
      const deleteButton = form.querySelector("[data-template-delete]");
      if (deleteButton instanceof HTMLButtonElement) deleteButton.dataset.templateName = templateName;
      if (appearanceEditor instanceof HTMLFormElement) {
        let templates = {};
        try { templates = JSON.parse(appearanceEditor.dataset.previewTemplates || "{}"); } catch {}
        const typographyData = typographyEditor instanceof HTMLFormElement ? new FormData(typographyEditor) : null;
        const previewTemplate = (template) => ({
          ...template,
          template_name: template.name,
          template_id: template.id,
          user_template: true,
          apply_line_height: typographyData?.get("preset") === "standard" && String(typographyData.get("typography_line_height") || "") === ""
        });
        templates[templateId] = previewTemplate(result.template);
        if (result.default_template) templates[""] = previewTemplate(result.default_template);
        appearanceEditor.dataset.previewTemplates = JSON.stringify(templates);
      }
      setSettingValue("template", templateName);
      setSettingValue("palette", selectedOptionLabel(form, "visual_preset"));
      setSettingValue("fonts", selectedOptionLabel(form, "body_font") + " / " + selectedOptionLabel(form, "heading_font"));
      setSettingValue("region", selectedOptionLabel(form, "region_layout"));
      setSettingValue("density", selectedOptionLabel(form, "density"));
      setSettingValue("motion", selectedOptionLabel(form, "motion_style"));
      setSettingValue("motif", selectedOptionLabel(form, "motif"));
      const role = String(new FormData(form).get("role_style_role") || "content");
      let roleStyles = {};
      try { roleStyles = JSON.parse(form.querySelector("[data-role-style-editor]")?.dataset.roleStyles || "{}"); } catch {}
      const rolePanel = roleStyles[role]?.panel_treatment || String(new FormData(form).get("panel_treatment") || "flat");
      setSettingValue("panel", panelTreatmentLabels[rolePanel] || rolePanel);
      const impact = form.querySelector("[data-template-impact]");
      if (impact instanceof HTMLElement && result.affected_slides) {
        impact.textContent = "保存すると現在" + result.affected_slides.total + "枚へ反映されます（直接指定 " + result.affected_slides.direct + "枚・既定を継承 " + result.affected_slides.inherited + "枚）。";
      }
    }
  };
  const postEditorSaveStatus = (form, message) => {
    if (!form.matches("[data-scene-component-editor], [data-canvas-block-editor]")) return;
    const frame = document.querySelector("[data-slide-frame]");
    if (frame instanceof HTMLIFrameElement) frame.contentWindow?.postMessage({ type: "ultimate-freestyle:save-status", message }, location.origin);
  };
  for (const [formIndex, form] of versionedForms.entries()) {
    if (!(form instanceof HTMLFormElement)) continue;
    const draftKey = "ultimate-freestyle:form-draft:" + location.pathname + ":" + new URL(form.action).pathname + ":" + formIndex;
    form.dataset.draftKey = draftKey;
    let draftTimer;
    const draftFields = () => [...form.elements].flatMap((field) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name || ["submit", "button", "file", "hidden"].includes(field.type)) return [];
      return [{ name: field.name, value: field.value, checked: field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : null }];
    });
    const persistDraft = () => {
      if (form.dataset.dirty !== "true") return;
      try { sessionStorage.setItem(draftKey, JSON.stringify({ version: Number(form.dataset.version), fields: draftFields() })); } catch {}
    };
    addEventListener("ultimate-freestyle:persist-drafts", persistDraft);
    const removeDraft = () => {
      clearTimeout(draftTimer);
      try { sessionStorage.removeItem(draftKey); } catch {}
    };
    const applyDraftFields = (fields) => {
      for (const saved of fields) {
        const field = form.elements.namedItem(String(saved.name || ""));
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
        if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = saved.checked === true;
        else field.value = String(saved.value ?? "");
      }
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
      if (event.submitter instanceof HTMLButtonElement && event.submitter.dataset.projectListAction === "delete" && !confirm("この項目を削除しますか？")) return;
      if (form.matches("[data-research-log-delete]") && !confirm("この研究ログを削除しますか？この操作は元に戻せません。")) return;
      const feedback = form.querySelector("[data-form-feedback], [data-editor-feedback]");
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
          body: JSON.stringify(serializeVersionedForm(form, event.submitter))
        });
        const result = await response.json();
        if (!response.ok) {
          if (result?.error?.code === "PROJECT_VERSION_CONFLICT") {
            clearTimeout(draftTimer);
            try {
              sessionStorage.setItem(draftKey, JSON.stringify({
                version: Number(form.dataset.version),
                current_version: Number(result.current_version),
                conflict: true,
                captured_at: new Date().toISOString(),
                fields: draftFields()
              }));
            } catch {}
          }
          throw new Error(apiErrorMessage(result, "保存できませんでした。"));
        }
        form.dataset.dirty = "false";
        removeDraft();
        syncPageVersion(result.version);
        syncSavedWorkspaceMetadata(form, result);
        if (form.matches("[data-scene-component-editor], [data-canvas-block-editor]")) {
          form.dataset.component = JSON.stringify(sceneComponentFromForm(form));
        }
        if (form.matches("[data-slide-create], [data-composition-create]")) {
          location.href = result.next_url;
          return;
        }
        if (form.matches("[data-canvas-block-create], [data-scene-component-create]")) {
          const createdId = String(result.component_id || result.block_id || "");
          if (createdId) navigateToComponent(createdId);
          else location.reload();
          return;
        }
        if (form.matches("[data-template-create], [data-narration-segment-create]")) {
          location.reload();
          return;
        }
        feedback.textContent = form.matches("[data-slide-editor]") && form.dataset.compositionMode !== "flow"
          ? "v" + result.version + " として基本情報と代替テキストを保存しました。見える内容は「構造」で編集します。"
          : "v" + result.version + " として保存し、実表示を更新しました。";
        feedback.classList.add("success");
        postEditorSaveStatus(form, "v" + result.version + " として保存しました。");
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
        if (form.matches("[data-project-list-item], [data-research-log-delete]") && result.next_url) {
          location.href = result.next_url;
          return;
        }
        if (form.matches("[data-project-editor], [data-project-list-item]")) {
          setTimeout(() => location.reload(), 500);
          return;
        }
        if (nextUrl) {
          location.href = nextUrl;
          return;
        }
        refreshSlideFrame(result.version);
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "保存できませんでした。");
        feedback.classList.add("warning");
        postEditorSaveStatus(form, feedback.textContent);
      } finally {
        for (const button of submitButtons) {
          setButtonBusy(button, false);
        }
        syncSaveState();
      }
    });
    let restored = false;
    let conflictedDraft = null;
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft?.version === Number(form.dataset.version) && Array.isArray(draft.fields)) {
        applyDraftFields(draft.fields);
        restored = true;
      } else if (Array.isArray(draft?.fields)) {
        conflictedDraft = draft;
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
    if (conflictedDraft !== null) {
      const notice = document.createElement("div");
      notice.className = "draft-recovery conflict";
      const text = document.createElement("p");
      text.textContent = "別versionで保存した未保存入力があります。現在版へ適用する前に、AIや別画面の変更と重ならないか確認してください。";
      const actions = document.createElement("div");
      actions.className = "draft-recovery-actions";
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "ghost";
      apply.textContent = "現在版へ入力を適用";
      apply.addEventListener("click", () => {
        applyDraftFields(conflictedDraft.fields);
        form.dataset.dirty = "true";
        try {
          sessionStorage.setItem(draftKey, JSON.stringify({
            version: Number(form.dataset.version),
            fields: conflictedDraft.fields
          }));
        } catch {}
        notice.remove();
        form.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "ghost";
      copy.textContent = "退避内容をコピー";
      copy.addEventListener("click", async () => {
        const copyText = conflictedDraft.fields.map((field) =>
          String(field.name || "") + ": " + String(field.checked === null ? field.value ?? "" : field.checked)
        ).join("\n\n");
        try {
          await navigator.clipboard.writeText(copyText);
          copy.textContent = "コピーしました";
        } catch {
          copy.textContent = "コピーできませんでした";
        }
      });
      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "ghost";
      discard.textContent = "退避内容を破棄";
      discard.addEventListener("click", () => {
        removeDraft();
        notice.remove();
      });
      actions.append(apply, copy, discard);
      notice.append(text, actions);
      form.prepend(notice);
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
        try { if (form.dataset.draftKey) sessionStorage.removeItem(form.dataset.draftKey); } catch {}
        feedback.textContent = "読み上げ区間を削除しました。画面を更新します…";
        feedback.classList.add("success");
        const deletedAt = Number(form.dataset.segmentAt || -1);
        const remaining = [...document.querySelectorAll("[data-narration-select]")]
          .filter((link) => link instanceof HTMLAnchorElement && Number(link.dataset.narrationSelect) !== deletedAt)
          .sort((left, right) => Math.abs(Number(left.dataset.narrationSelect) - deletedAt) - Math.abs(Number(right.dataset.narrationSelect) - deletedAt));
        const url = remaining[0] instanceof HTMLAnchorElement ? new URL(remaining[0].href) : new URL(location.href);
        if (remaining.length === 0) {
          url.searchParams.delete("narration");
          url.hash = "";
        }
        document.body.dataset.internalNavigation = "true";
        location.assign(url);
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "読み上げ区間を削除できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  for (const button of document.querySelectorAll("[data-canvas-block-action]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement)) return;
      const action = button.dataset.canvasBlockAction;
      if (action === "delete" && !confirm("この表示パーツを削除しますか？")) return;
      setButtonBusy(button, true);
      feedback.textContent = action === "duplicate" ? "表示パーツを複製しています…" : "表示パーツを削除しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(button.dataset.actionUrl || "", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": form.dataset.csrf || "" },
          body: JSON.stringify({ expected_version: Number(form.dataset.version), action })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "表示パーツを操作できませんでした。"));
        form.dataset.dirty = "false";
        feedback.textContent = action === "duplicate" ? "複製しました。画面を更新します…" : "削除しました。画面を更新します…";
        feedback.classList.add("success");
        if (action === "duplicate" && result.result_block_id) navigateToComponent(String(result.result_block_id));
        else {
          const url = new URL(location.href);
          url.searchParams.delete("component");
          document.body.dataset.internalNavigation = "true";
          location.assign(url);
        }
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "表示パーツを操作できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  for (const button of document.querySelectorAll("[data-scene-component-action]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement)) return;
      const action = button.dataset.sceneComponentAction;
      if (action === "delete" && !confirm("この表示パーツを削除しますか？子パーツがある場合は先に移動または削除が必要です。")) return;
      setButtonBusy(button, true);
      feedback.textContent = action === "duplicate" ? "表示パーツを複製しています…" : "表示パーツを削除しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(button.dataset.actionUrl || "", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": form.dataset.csrf || "" },
          body: JSON.stringify({ expected_version: Number(form.dataset.version), action })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "表示パーツを操作できませんでした。"));
        form.dataset.dirty = "false";
        feedback.textContent = action === "duplicate" ? "複製しました。画面を更新します…" : "削除しました。画面を更新します…";
        feedback.classList.add("success");
        if (action === "duplicate" && result.result_component_id) navigateToComponent(String(result.result_component_id));
        else {
          const url = new URL(location.href);
          url.searchParams.delete("component");
          document.body.dataset.internalNavigation = "true";
          location.assign(url);
        }
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "表示パーツを操作できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  for (const button of document.querySelectorAll("[data-scene-item-action]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", async () => {
      const form = button.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      if (!(form instanceof HTMLFormElement) || !(feedback instanceof HTMLElement)) return;
      const action = button.dataset.sceneItemAction;
      if (action === "delete" && !confirm("このデータ項目を削除しますか？このパーツ内の未保存変更も失われます。")) return;
      if (action !== "delete" && form.dataset.dirty === "true" && !confirm("未保存の変更があります。項目を操作すると未保存内容は失われます。続けますか？")) return;
      setButtonBusy(button, true);
      feedback.textContent = action === "add" ? "データ項目を追加しています…" : action === "move" ? "データ項目を移動しています…" : "データ項目を削除しています…";
      feedback.classList.remove("success", "warning");
      try {
        const response = await fetch(form.action + "/items", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": form.dataset.csrf || "" },
          body: JSON.stringify({
            expected_version: Number(form.dataset.version),
            action,
            ...(action === "delete" || action === "move" ? { item_id: button.dataset.itemId } : {}),
            ...(action === "move" ? { position: Number(button.dataset.position) } : {})
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "データ項目を操作できませんでした。"));
        form.dataset.dirty = "false";
        feedback.textContent = action === "add" ? "追加しました。画面を更新します…" : action === "move" ? "移動しました。画面を更新します…" : "削除しました。画面を更新します…";
        feedback.classList.add("success");
        location.reload();
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "データ項目を操作できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(button, false);
      }
    });
  }

  const syncSceneComponentDraft = (form) => {
    if (!(form instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    let assetUrls = {};
    try { assetUrls = JSON.parse(form.closest(".slide-workspace")?.dataset.workspaceAssetUrls || "{}"); } catch {}
    postPreviewMessage({
      type: "ultimate-freestyle:preview-scene-component",
      slide_id: slideEditor instanceof HTMLFormElement ? slideEditor.dataset.slideId || "" : "",
      component: sceneComponentFromForm(form),
      asset_urls: assetUrls
    });
  };
  const syncCompositionDraft = () => {
    if (!(compositionEditor instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    const data = new FormData(compositionEditor);
    postPreviewMessage({
      type: "ultimate-freestyle:preview-composition",
      slide_id: compositionEditor.dataset.slideId || "",
      background: String(data.get("composition_background") || ""),
      clip_content: data.has("composition_clip_content")
    });
  };
  compositionEditor?.addEventListener("input", () => {
    clearTimeout(draftCompositionTimer);
    draftCompositionTimer = setTimeout(syncCompositionDraft, previewDebounceMs);
    const layoutStatus = document.querySelector("[data-layout-status]");
    if (layoutStatus instanceof HTMLElement) {
      layoutStatus.textContent = "構成全体の背景をプレビューへ反映しています…";
      layoutStatus.dataset.level = "";
    }
  });
  const syncCanvasBlockDraft = (form) => {
    if (!(form instanceof HTMLFormElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    let assetUrls = {};
    try { assetUrls = JSON.parse(form.closest(".slide-workspace")?.dataset.workspaceAssetUrls || "{}"); } catch {}
    postPreviewMessage({
      type: "ultimate-freestyle:preview-canvas-block",
      slide_id: slideEditor instanceof HTMLFormElement ? slideEditor.dataset.slideId || "" : "",
      block: sceneComponentFromForm(form),
      asset_urls: assetUrls
    });
  };
  for (const form of document.querySelectorAll("[data-scene-component-editor], [data-canvas-block-editor]")) {
    for (const button of form.querySelectorAll("[data-component-order]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => {
        const order = form.querySelector('[data-component-path="order"]');
        if (!(order instanceof HTMLInputElement)) return;
        order.value = button.dataset.componentOrder || order.value;
        order.dispatchEvent(new Event("input", { bubbles: true }));
        form.requestSubmit();
      });
    }
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
    const frameReset = form.querySelector("[data-component-frame-reset]");
    if (frameReset instanceof HTMLButtonElement && frameToggle instanceof HTMLInputElement) {
      frameReset.addEventListener("click", () => {
        let original = null;
        try { original = JSON.parse(form.dataset.component || "{}").frame ?? null; } catch {}
        frameToggle.checked = original !== null;
        syncFrameControls();
        if (original !== null) {
          for (const field of frameFields) {
            const axis = (field.dataset.componentPath || "").split(".").at(-1);
            if (axis && Number.isFinite(original[axis])) field.value = String(original[axis]);
          }
        }
        frameToggle.dispatchEvent(new Event("input", { bubbles: true }));
        validateFrame();
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
      const canvasEditor = form.matches("[data-canvas-block-editor]");
      if (canvasEditor) {
        clearTimeout(draftCanvasTimer);
        draftCanvasTimer = setTimeout(() => syncCanvasBlockDraft(form), previewDebounceMs);
      } else {
        clearTimeout(draftSceneTimer);
        draftSceneTimer = setTimeout(() => syncSceneComponentDraft(form), previewDebounceMs);
      }
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
  for (const color of document.querySelectorAll("[data-narration-color-preview]")) {
    if (!(color instanceof HTMLInputElement) || color.type !== "color") continue;
    const form = color.closest("form");
    const text = form?.elements.namedItem(color.dataset.narrationColorPreview || "");
    if (!(form instanceof HTMLFormElement) || !(text instanceof HTMLInputElement)) continue;
    color.addEventListener("input", () => {
      text.value = color.value;
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
    text.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) color.value = text.value;
    });
  }
  for (const button of document.querySelectorAll("[data-narration-color-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      let palette = {};
      try { palette = JSON.parse(button.dataset.narrationColorPick || "{}"); } catch {}
      for (const [fieldName, key] of [["appearance_background", "background"], ["appearance_foreground", "foreground"], ["appearance_border_color", "border_color"], ["appearance_accent", "accent"], ["appearance_corner_radius_px", "corner_radius_px"]]) {
        const field = form.elements.namedItem(fieldName);
        if (!(field instanceof HTMLInputElement) || palette[key] === undefined) continue;
        field.value = String(palette[key]);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }
  for (const button of document.querySelectorAll("[data-narration-color-reset]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const names = ["appearance_background", "appearance_foreground", "appearance_border_color", "appearance_accent", "appearance_corner_radius_px"];
      for (const name of names) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLInputElement) field.value = "";
      }
      const last = form.elements.namedItem("appearance_corner_radius_px");
      if (last instanceof HTMLInputElement) last.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  for (const field of document.querySelectorAll('textarea[maxlength], input[maxlength]:not([type]):not([data-component-color-hex]), input[type="text"][maxlength]:not([data-color-text]):not([data-component-color-hex]):not([data-narration-color-text])')) {
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
  for (const button of document.querySelectorAll("[data-design-pick]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      const form = button.closest("form");
      const fieldName = button.dataset.designField || "";
      const field = form?.elements.namedItem(fieldName);
      if (!(form instanceof HTMLFormElement) || !(field instanceof HTMLSelectElement)) return;
      field.value = button.dataset.designPick || field.value;
      syncPicker(form, '[data-design-field="' + CSS.escape(fieldName) + '"]', "designPick", field.value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  const fontProbeContext = document.createElement("canvas").getContext("2d");
  if (fontProbeContext) {
    const probeText = "mmmmmmmmmmlli最自由研究Aa";
    const genericFamilies = ["monospace", "sans-serif", "serif"];
    const genericWidths = genericFamilies.map((family) => {
      fontProbeContext.font = "72px " + family;
      return fontProbeContext.measureText(probeText).width;
    });
    const localFontAvailable = (family) => genericFamilies.some((generic, index) => {
      const safeFamily = family.replaceAll('"', "");
      fontProbeContext.font = '72px "' + safeFamily + '", ' + generic;
      return Math.abs(fontProbeContext.measureText(probeText).width - genericWidths[index]) > 0.1;
    });
    for (const button of document.querySelectorAll("[data-font-pick]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      let candidates = [];
      try { candidates = JSON.parse(button.dataset.fontCandidates || "[]"); } catch {}
      const available = candidates.length === 0 || candidates.some((family) =>
        typeof family === "string" && localFontAvailable(family)
      );
      button.dataset.fontAvailable = String(available);
      if (!available) button.title = "この端末では指定フォントを確認できないため、近い代替フォントで表示します。";
    }
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
      } else if (["motif", "heading_treatment", "image_treatment", "panel_treatment"].includes(field.name)) {
        syncPicker(form, '[data-design-field="' + CSS.escape(field.name) + '"]', "designPick", field.value);
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
    const filmstripCount = document.querySelector("[data-filmstrip-search-count]");
    const filmstripProject = filmstripSearch.closest("[data-filmstrip-project]")?.dataset.filmstripProject || "unknown";
    const filmstripSearchKey = "ultimate-freestyle:filmstrip-search:" + filmstripProject;
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
      if (filmstripCount instanceof HTMLOutputElement) filmstripCount.value = visible + " / " + filmstripSlides.length + "枚";
    };
    try {
      const savedQuery = sessionStorage.getItem(filmstripSearchKey) || "";
      const activeMatches = activeFilmstripSlide instanceof HTMLElement && (activeFilmstripSlide.dataset.searchText || "").includes(savedQuery.trim().toLocaleLowerCase("ja"));
      filmstripSearch.value = savedQuery === "" || activeMatches ? savedQuery : "";
    } catch {}
    filmstripSearch.addEventListener("input", () => {
      try { sessionStorage.setItem(filmstripSearchKey, filmstripSearch.value); } catch {}
      filterFilmstrip();
    });
    filmstripSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      filmstripSearch.value = "";
      try { sessionStorage.removeItem(filmstripSearchKey); } catch {}
      filterFilmstrip();
      filmstripSearch.blur();
    });
    filterFilmstrip();
  }

  const splitSlideButton = document.querySelector("[data-slide-split]");
  if (splitSlideButton instanceof HTMLButtonElement) {
    splitSlideButton.addEventListener("click", async () => {
      const form = splitSlideButton.closest("form");
      const feedback = form?.querySelector("[data-form-feedback]");
      const content = form?.elements.namedItem("content_markdown");
      if (
        !(form instanceof HTMLFormElement) ||
        !(feedback instanceof HTMLElement) ||
        !(content instanceof HTMLTextAreaElement)
      ) return;
      const splitOffset = content.selectionStart;
      const before = content.value.slice(0, splitOffset).trim();
      const after = content.value.slice(splitOffset).trim();
      const otherDirtyForm = Array.from(document.querySelectorAll('[data-dirty="true"]'))
        .some((candidate) => candidate !== form);
      if (otherDirtyForm) {
        feedback.textContent = "内容以外の未保存設定を先に保存してください。";
        feedback.classList.add("warning");
        return;
      }
      const durationSeconds = numberValue(new FormData(form), "duration_seconds");
      if (durationSeconds < 2) {
        feedback.textContent = "分割するには想定時間を2秒以上にしてください。";
        feedback.classList.add("warning");
        return;
      }
      if (before.length === 0 || after.length === 0) {
        feedback.textContent = "本文の先頭と末尾以外へカーソルを置いてください。段落間の空行がおすすめです。";
        feedback.classList.add("warning");
        content.focus();
        return;
      }
      if (!confirm("カーソル位置で本文を2枚へ分けますか？ 見た目と補足欄は両方へ引き継ぎ、段階表示と読み上げは想定時間の位置に応じて前後へ分けます。STEP 0の読み上げは前半に残ります。")) return;
      setButtonBusy(splitSlideButton, true);
      showSavingState();
      feedback.textContent = "本文を2枚のスライドへ分けています…";
      feedback.classList.remove("warning", "success");
      const data = new FormData(form);
      try {
        const response = await fetch(splitSlideButton.dataset.slideSplit || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": splitSlideButton.dataset.csrf || ""
          },
          body: JSON.stringify({
            expected_version: Number(form.dataset.version),
            split_offset: splitOffset,
            title: String(data.get("title") || ""),
            duration_seconds: durationSeconds,
            content_markdown: content.value,
            sidebar_markdown: String(data.get("sidebar_markdown") || "")
          })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(apiErrorMessage(result, "スライドを分割できませんでした。"));
        }
        form.dataset.dirty = "false";
        if (form.dataset.draftKey) sessionStorage.removeItem(form.dataset.draftKey);
        feedback.textContent = "2枚へ分割しました。続きのスライドへ移動します…";
        feedback.classList.add("success");
        location.href = result.next_url;
      } catch (error) {
        feedback.textContent = caughtErrorMessage(error, "スライドを分割できませんでした。");
        feedback.classList.add("warning");
        setButtonBusy(splitSlideButton, false);
        syncSaveState();
      }
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
  let syncingInspectorPane = false;
  let inspectorState = {};
  try { inspectorState = JSON.parse(localStorage.getItem(inspectorStateKey) || "{}"); } catch {}
  const inspectorSections = [...document.querySelectorAll("[data-inspector-section]")].filter((item) => item instanceof HTMLDetailsElement);
  for (const details of inspectorSections) {
    if (!(details instanceof HTMLDetailsElement)) continue;
    const section = details.dataset.inspectorSection || "";
    if (typeof inspectorState[section] === "boolean") details.open = inspectorState[section];
    details.addEventListener("toggle", () => {
      if (syncingInspectorPane) return;
      inspectorState[section] = details.open;
      try { localStorage.setItem(inspectorStateKey, JSON.stringify(inspectorState)); } catch {}
    });
  }
  const desktopInspectorOpen = new Map(inspectorSections.map((details) => [details.dataset.inspectorSection || "", details.open]));

  const mobilePaneButtons = [...document.querySelectorAll("[data-mobile-pane]")];
  const mobilePaneMedia = matchMedia("(max-width: 48rem)");
  const syncMobilePaneSemantics = () => {
    for (const button of mobilePaneButtons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!(panel instanceof HTMLElement)) continue;
      if (mobilePaneMedia.matches) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
      } else {
        panel.removeAttribute("role");
        panel.removeAttribute("aria-labelledby");
      }
    }
  };
  const setMobilePane = (pane) => {
    if (!["preview", "edit", "slides"].includes(pane)) return;
    document.body.dataset.mobilePane = pane;
    if (pane === "preview" && document.body.dataset.mobilePreviewPending === "true") {
      document.body.dataset.mobilePreviewAwaiting = "true";
      requestAnimationFrame(() => {
        if (!(slideFrame instanceof HTMLIFrameElement)) return;
        const output = document.querySelector("[data-step-output]");
        const step = output instanceof HTMLOutputElement ? Number(output.value.match(/STEP (\d+)/)?.[1] || 0) : 0;
        slideFrame.contentWindow?.postMessage({ type: "ultimate-freestyle:set-position", slide: Number(new URL(slideFrame.src).searchParams.get("slide") || 1), step }, location.origin);
      });
    }
    for (const button of mobilePaneButtons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      const selected = button.dataset.mobilePane === pane;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    syncMobilePreviewBadge();
    try { localStorage.setItem("ultimate-freestyle:workspace-mobile-pane", pane); } catch {}
  };
  if (mobilePaneButtons.length > 0) {
    let initialMobilePane = "preview";
    try { initialMobilePane = localStorage.getItem("ultimate-freestyle:workspace-mobile-pane") || "preview"; } catch {}
    setMobilePane(initialMobilePane);
    for (const [index, button] of mobilePaneButtons.entries()) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => setMobilePane(button.dataset.mobilePane || "preview"));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? mobilePaneButtons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + mobilePaneButtons.length) % mobilePaneButtons.length;
        const next = mobilePaneButtons[nextIndex];
        if (!(next instanceof HTMLButtonElement)) return;
        setMobilePane(next.dataset.mobilePane || "preview");
        next.focus();
      });
    }
    const mobileWorkspaceTabs = mobilePaneButtons[0]?.closest(".mobile-workspace-tabs");
    if (mobileWorkspaceTabs instanceof HTMLElement) mobileWorkspaceTabs.hidden = false;
    syncMobilePaneSemantics();
    mobilePaneMedia.addEventListener("change", syncMobilePaneSemantics);
  }

  const mobileInspectorButtons = [...document.querySelectorAll("[data-inspector-pane]")];
  const mobileInspectorMedia = matchMedia("(max-width: 48rem)");
  if (mobileInspectorButtons.length > 0 && inspectorSections.length > 0) {
    const syncMobileInspectorSemantics = () => {
      for (const button of mobileInspectorButtons) {
        if (!(button instanceof HTMLButtonElement)) continue;
        const panelId = button.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!(panel instanceof HTMLElement)) continue;
        if (mobileInspectorMedia.matches) {
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", button.id);
        } else {
          panel.removeAttribute("role");
          panel.removeAttribute("aria-labelledby");
        }
      }
    };
    const activeInspectorKey = "ultimate-freestyle:workspace-inspector-active";
    const selectInspectorPane = (name, focus = false, userInitiated = false) => {
      const target = inspectorSections.find((details) => details.dataset.inspectorSection === name);
      if (!(target instanceof HTMLDetailsElement)) return;
      syncingInspectorPane = true;
      for (const details of inspectorSections) {
        const selected = details === target;
        details.hidden = mobileInspectorMedia.matches && !selected;
        details.open = selected;
      }
      syncingInspectorPane = false;
      for (const button of mobileInspectorButtons) {
        if (!(button instanceof HTMLButtonElement)) continue;
        const selected = button.dataset.inspectorPane === name;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
      if (userInitiated) {
        setMobilePane("edit");
        try { localStorage.setItem(activeInspectorKey, name); } catch {}
      }
      if (focus) requestAnimationFrame(() => {
        const summary = target.querySelector(":scope > summary");
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
      });
    };
    let preferredInspector = "";
    try { preferredInspector = localStorage.getItem(activeInspectorKey) || ""; } catch {}
    if (new URLSearchParams(location.search).has("component")) preferredInspector = "structure";
    else if (location.hash.startsWith("#narration-segment-") || new URLSearchParams(location.search).has("narration")) preferredInspector = "narration";
    if (!inspectorSections.some((details) => details.dataset.inspectorSection === preferredInspector)) {
      preferredInspector = inspectorSections.find((details) => details.open)?.dataset.inspectorSection || "content";
    }
    if (mobileInspectorMedia.matches) selectInspectorPane(preferredInspector);
    for (const [index, button] of mobileInspectorButtons.entries()) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => selectInspectorPane(button.dataset.inspectorPane || "content", true, true));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? mobileInspectorButtons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + mobileInspectorButtons.length) % mobileInspectorButtons.length;
        const next = mobileInspectorButtons[nextIndex];
        if (!(next instanceof HTMLButtonElement)) return;
        selectInspectorPane(next.dataset.inspectorPane || "content", true, true);
        next.focus({ preventScroll: true });
      });
    }
    for (const details of inspectorSections) {
      details.addEventListener("toggle", () => {
        if (!mobileInspectorMedia.matches || syncingInspectorPane || !details.open) return;
        selectInspectorPane(details.dataset.inspectorSection || "content");
      });
    }
    mobileInspectorMedia.addEventListener("change", (event) => {
      syncMobileInspectorSemantics();
      if (event.matches) {
        selectInspectorPane(preferredInspector);
        return;
      }
      syncingInspectorPane = true;
      for (const details of inspectorSections) {
        details.hidden = false;
        details.open = desktopInspectorOpen.get(details.dataset.inspectorSection || "") ?? details.open;
      }
      syncingInspectorPane = false;
    });
    const mobileInspectorTabs = mobileInspectorButtons[0]?.closest(".mobile-inspector-tabs");
    if (mobileInspectorTabs instanceof HTMLElement) mobileInspectorTabs.hidden = false;
    syncMobileInspectorSemantics();
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

  const gridSnapButton = document.querySelector("[data-grid-snap]");
  let gridSnapEnabled = false;
  const syncGridSnap = () => {
    if (!(gridSnapButton instanceof HTMLButtonElement) || !(slideFrame instanceof HTMLIFrameElement)) return;
    gridSnapButton.setAttribute("aria-pressed", String(gridSnapEnabled));
    gridSnapButton.textContent = "5%グリッド " + (gridSnapEnabled ? "ON" : "OFF");
    slideFrame.contentWindow?.postMessage({
      type: "ultimate-freestyle:set-editor-options",
      grid_snap: gridSnapEnabled
    }, location.origin);
  };
  if (gridSnapButton instanceof HTMLButtonElement) {
    try { gridSnapEnabled = localStorage.getItem("ultimate-freestyle:grid-snap") === "true"; } catch {}
    syncGridSnap();
    gridSnapButton.addEventListener("click", () => {
      gridSnapEnabled = !gridSnapEnabled;
      try { localStorage.setItem("ultimate-freestyle:grid-snap", String(gridSnapEnabled)); } catch {}
      syncGridSnap();
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
      const workspace = document.querySelector(".slide-workspace");
      const positionUrl = new URL(location.href);
      positionUrl.searchParams.set("step", String(currentStep));
      if (workspace instanceof HTMLElement && workspace.dataset.selectedComponent) {
        positionUrl.searchParams.set("component", workspace.dataset.selectedComponent);
      }
      if (workspace instanceof HTMLElement && workspace.dataset.selectedNarration) {
        positionUrl.searchParams.set("narration", workspace.dataset.selectedNarration);
        if (positionUrl.hash.startsWith("#narration-segment-") && positionUrl.hash !== "#narration-segment-" + workspace.dataset.selectedNarration) {
          positionUrl.hash = "narration-segment-" + workspace.dataset.selectedNarration;
        }
      } else {
        positionUrl.searchParams.delete("narration");
        if (positionUrl.hash.startsWith("#narration-segment-")) positionUrl.hash = "";
      }
      history.replaceState(history.state, "", positionUrl);
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
    const requestedStep = Number(new URLSearchParams(location.search).get("step") || 0);
    updateStep(Number.isInteger(requestedStep) ? requestedStep : 0);
    const linkedSegment = location.hash.startsWith("#narration-segment-")
      ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
      : null;
    if (linkedSegment instanceof HTMLFormElement) {
      const narrationSection = linkedSegment.closest('[data-inspector-section="narration"]');
      if (narrationSection instanceof HTMLDetailsElement) narrationSection.open = true;
      setMobilePane("edit");
      requestAnimationFrame(() => {
        linkedSegment.scrollIntoView({ block: "center" });
        const text = linkedSegment.elements.namedItem("text");
        if (text instanceof HTMLTextAreaElement) text.focus({ preventScroll: true });
      });
    }
  }

  const componentSelectionUrl = (componentId, href = location.href) => {
    const url = new URL(href, location.origin);
    url.searchParams.set("component", componentId);
    const step = stepOutput instanceof HTMLOutputElement
      ? Number(stepOutput.value.match(/STEP (\d+)/)?.[1] || 0)
      : 0;
    url.searchParams.set("step", String(step));
    return url;
  };
  const navigationFocusKey = "ultimate-freestyle:navigation-focus";
  const rememberNavigationFocus = (kind, target, destination) => {
    const url = new URL(destination, location.origin);
    try {
      sessionStorage.setItem(navigationFocusKey, JSON.stringify({
        kind,
        target,
        destination: url.pathname + url.search,
        created_at: Date.now()
      }));
    } catch {}
  };
  const navigateToComponent = (componentId, href) => {
    const workspace = document.querySelector(".slide-workspace");
    if (workspace instanceof HTMLElement && workspace.dataset.selectedComponent === componentId) return false;
    dispatchEvent(new Event("ultimate-freestyle:persist-drafts"));
    document.body.dataset.internalNavigation = "true";
    const destination = componentSelectionUrl(componentId, href);
    rememberNavigationFocus("component", componentId, destination);
    location.assign(destination);
    return true;
  };
  for (const link of document.querySelectorAll("[data-component-select]")) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigateToComponent(link.dataset.componentSelect || "", link.href);
    });
  }
  for (const link of document.querySelectorAll("[data-voice-select]")) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      rememberNavigationFocus("voice", link.dataset.voiceSelect || "", link.href);
    });
  }
  let navigationFocus = null;
  try {
    navigationFocus = JSON.parse(sessionStorage.getItem(navigationFocusKey) || "null");
    sessionStorage.removeItem(navigationFocusKey);
  } catch {
    try { sessionStorage.removeItem(navigationFocusKey); } catch {}
  }
  if (
    navigationFocus &&
    navigationFocus.destination === location.pathname + location.search &&
    Date.now() - Number(navigationFocus.created_at) < 30_000
  ) {
    let focusTarget = null;
    if (navigationFocus.kind === "component") {
      const sceneForm = document.querySelector('[data-scene-component-editor][data-component-id="' + CSS.escape(String(navigationFocus.target)) + '"]');
      const canvasForm = [...document.querySelectorAll("[data-canvas-block-editor]")].find((form) => {
        if (!(form instanceof HTMLFormElement)) return false;
        try { return JSON.parse(form.dataset.component || "{}").id === navigationFocus.target; } catch { return false; }
      });
      const form = sceneForm instanceof HTMLFormElement ? sceneForm : canvasForm;
      const section = document.querySelector('[data-inspector-section="structure"]');
      if (section instanceof HTMLDetailsElement) section.open = true;
      if (form instanceof HTMLFormElement) {
        const detail = form.closest("details.component-detail");
        if (detail instanceof HTMLDetailsElement) {
          detail.open = true;
          focusTarget = detail.querySelector(":scope > summary");
        }
      }
      setMobilePane("edit");
    } else if (navigationFocus.kind === "voice") {
      const detail = document.getElementById(String(navigationFocus.target));
      if (detail instanceof HTMLDetailsElement) {
        detail.open = true;
        focusTarget = detail.querySelector(":scope > summary");
      }
    }
    if (focusTarget instanceof HTMLElement) requestAnimationFrame(() => {
      focusTarget.scrollIntoView({ block: "center" });
      focusTarget.focus({ preventScroll: true });
    });
  }
  const componentSearch = document.querySelector("[data-component-search]");
  const componentSearchCount = document.querySelector("[data-component-search-count]");
  const componentSearchEmpty = document.querySelector("[data-component-search-empty]");
  if (componentSearch instanceof HTMLInputElement && componentSearchCount instanceof HTMLOutputElement) {
    const componentRows = [...document.querySelectorAll("[data-component-select]")]
      .map((link) => link.closest("li"))
      .filter((row) => row instanceof HTMLLIElement);
    const filterComponents = () => {
      const query = componentSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const row of componentRows) {
        const matches = query.length === 0 || (row.textContent || "").toLocaleLowerCase("ja").includes(query);
        row.hidden = !matches;
        if (matches) visible += 1;
      }
      componentSearchCount.value = visible + " / " + componentRows.length + "件";
      if (componentSearchEmpty instanceof HTMLElement) componentSearchEmpty.hidden = visible !== 0;
    };
    componentSearch.addEventListener("input", filterComponents);
    filterComponents();
  }
  const narrationSearch = document.querySelector("[data-narration-search]");
  const narrationSearchCount = document.querySelector("[data-narration-search-count]");
  const narrationSearchEmpty = document.querySelector("[data-narration-search-empty]");
  const narrationLinks = [...document.querySelectorAll("[data-narration-select]")];
  if (narrationSearch instanceof HTMLInputElement && narrationSearchCount instanceof HTMLOutputElement) {
    const filterNarration = () => {
      const query = narrationSearch.value.trim().toLocaleLowerCase("ja");
      let visible = 0;
      for (const link of narrationLinks) {
        if (!(link instanceof HTMLAnchorElement)) continue;
        const matches = query.length === 0 || (link.dataset.searchText || "").includes(query);
        link.hidden = !matches;
        if (matches) visible += 1;
      }
      narrationSearchCount.value = visible + " / " + narrationLinks.length + "件";
      if (narrationSearchEmpty instanceof HTMLElement) narrationSearchEmpty.hidden = visible !== 0;
    };
    narrationSearch.addEventListener("input", filterNarration);
    filterNarration();
  }
  for (const link of narrationLinks) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    if (link.getAttribute("aria-current") === "true") requestAnimationFrame(() => link.scrollIntoView({ block: "nearest", inline: "center" }));
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      dispatchEvent(new Event("ultimate-freestyle:persist-drafts"));
      document.body.dataset.internalNavigation = "true";
      location.assign(link.href);
    });
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
      previewFrameLoadedGeneration = previewFrameGeneration;
      setFrameLoading(false);
      syncFramePosition();
      syncSlideDraft();
      syncTypographyDraft();
      syncTemplateDraft();
      syncAppearanceDraft();
      syncCompositionDraft();
      syncNarrationDrafts();
      for (const form of document.querySelectorAll('[data-scene-component-editor][data-dirty="true"]')) syncSceneComponentDraft(form);
      for (const form of document.querySelectorAll('[data-canvas-block-editor][data-dirty="true"]')) syncCanvasBlockDraft(form);
      syncGridSnap();
      const workspace = document.querySelector(".slide-workspace");
      if (workspace instanceof HTMLElement && workspace.dataset.selectedComponent) {
        slideFrame.contentWindow?.postMessage({ type: "ultimate-freestyle:set-editor-selection", component_id: workspace.dataset.selectedComponent }, location.origin);
      }
    });
    const layoutStatus = document.querySelector("[data-layout-status]");
    const qualitySummary = document.querySelector("[data-quality-summary]");
    const qualityList = document.querySelector("[data-quality-list]");
    const diagnosticTarget = (id, preferredPath = "") => {
      let sectionName = "structure";
      let target = null;
      let componentId = "";
      if (id.startsWith("node:")) {
        componentId = id.slice(5);
        target = [...document.querySelectorAll("[data-scene-component-editor]")].find((form) => form instanceof HTMLFormElement && form.dataset.componentId === componentId) || null;
      } else if (id.startsWith("block:")) {
        componentId = id.slice(6);
        target = [...document.querySelectorAll("[data-canvas-block-editor]")].find((form) => {
          if (!(form instanceof HTMLFormElement)) return false;
          try { return JSON.parse(form.dataset.component || "{}").id === componentId; } catch { return false; }
        }) || null;
      } else if (id === "flow:main" || id === "flow:sidebar") {
        sectionName = preferredPath ? "design" : "content";
        target = preferredPath ? document.querySelector("[data-template-editor]") : document.querySelector("[data-slide-editor]");
      } else if (id === "narration") {
        sectionName = "narration";
        target = document.querySelector("[data-narration-settings-editor]");
      }
      const section = document.querySelector('[data-inspector-section="' + sectionName + '"]');
      return { section, target: target || section, componentId, mounted: target instanceof HTMLFormElement };
    };
    const appendDiagnostic = (item, message, preferredPath = "") => {
      if (!(qualityList instanceof HTMLElement)) return;
      const row = document.createElement("li");
      row.dataset.layoutWarning = "true";
      row.append(document.createTextNode(message));
      const { section, target, componentId, mounted } = diagnosticTarget(item.id, preferredPath);
      if (section instanceof HTMLDetailsElement && target instanceof HTMLElement) {
        const fallbackFieldName = item.id === "narration" ? "appearance_foreground" : item.id === "flow:sidebar" ? "muted" : "foreground";
        const preferredField = preferredPath
          ? target.querySelector('[data-component-path="' + preferredPath + '"]') || (target instanceof HTMLFormElement ? target.elements.namedItem(preferredPath) || target.elements.namedItem(fallbackFieldName) : null)
          : null;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost";
        button.dataset.diagnosticFix = "true";
        button.textContent = "修正欄へ";
        button.addEventListener("click", () => {
          if (componentId && !mounted) {
            navigateToComponent(componentId);
            return;
          }
          setMobilePane("edit");
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
            setMobilePane("edit");
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
      if (data?.type === "ultimate-freestyle:preview-applied") {
        if (Number(data.request_id) !== latestPreviewRequestId) return;
        if (layoutStatus instanceof HTMLElement) {
          layoutStatus.textContent = "中央プレビューへ反映しました。保存すると確定します。";
          layoutStatus.dataset.level = "ok";
        }
        return;
      }
      if (data?.type === "ultimate-freestyle:move-component" && typeof data.component_id === "string" && data.frame && [data.frame.x, data.frame.y, data.frame.width, data.frame.height].every(Number.isFinite)) {
        const forms = data.component_type === "scene"
          ? [...document.querySelectorAll("[data-scene-component-editor]")]
          : [...document.querySelectorAll("[data-canvas-block-editor]")];
        const target = forms.find((form) => form instanceof HTMLFormElement && (data.component_type === "scene" ? form.dataset.componentId : form.dataset.blockId) === data.component_id);
        if (!(target instanceof HTMLFormElement)) return;
        const frameToggle = target.querySelector("[data-component-frame-toggle]");
        if (frameToggle instanceof HTMLInputElement && !frameToggle.checked) return;
        for (const axis of ["x", "y", "width", "height"]) {
          const input = target.querySelector('[data-component-path="frame.' + axis + '"]');
          if (!(input instanceof HTMLInputElement)) continue;
          input.value = String(data.frame[axis]);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (layoutStatus instanceof HTMLElement) {
          layoutStatus.textContent = "「" + data.component_id + "」を x " + data.frame.x + "%・y " + data.frame.y + "%・幅 " + data.frame.width + "%・高さ " + data.frame.height + "%へ調整しました。保存すると確定します。";
          layoutStatus.dataset.level = "ok";
        }
        return;
      }
      if (data?.type === "ultimate-freestyle:save-component" && typeof data.component_id === "string") {
        const forms = data.component_type === "scene"
          ? [...document.querySelectorAll("[data-scene-component-editor]")]
          : [...document.querySelectorAll("[data-canvas-block-editor]")];
        const target = forms.find((form) => form instanceof HTMLFormElement && (data.component_type === "scene" ? form.dataset.componentId : form.dataset.blockId) === data.component_id);
        if (!(target instanceof HTMLFormElement)) return;
        if (target.dataset.dirty !== "true") {
          slideFrame.contentWindow?.postMessage({ type: "ultimate-freestyle:save-status", message: "選択中のパーツに未保存の変更はありません。" }, location.origin);
          return;
        }
        target.requestSubmit();
        return;
      }
      if (data?.type === "ultimate-freestyle:select-component" && typeof data.component_id === "string") {
        const forms = data.component_type === "scene"
          ? [...document.querySelectorAll("[data-scene-component-editor]")]
          : [...document.querySelectorAll("[data-canvas-block-editor]")];
        const target = forms.find((form) => form instanceof HTMLFormElement && (data.component_type === "scene" ? form.dataset.componentId : form.dataset.blockId) === data.component_id);
        if (!(target instanceof HTMLFormElement)) {
          navigateToComponent(data.component_id);
          return;
        }
        setMobilePane("edit");
        if (document.body.dataset.previewFocus === "true" && previewFocusButton instanceof HTMLButtonElement) previewFocusButton.click();
        const section = target.closest("[data-inspector-section]");
        if (section instanceof HTMLDetailsElement) section.open = true;
        const detail = target.closest("details.component-detail");
        if (detail instanceof HTMLDetailsElement) detail.open = true;
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        const summary = detail?.querySelector(":scope > summary");
        if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
        if (layoutStatus instanceof HTMLElement) {
          layoutStatus.textContent = "「" + data.component_id + "」の編集欄を開きました。";
          layoutStatus.dataset.level = "ok";
        }
        return;
      }
      if (!data || data.type !== "ultimate-freestyle:render-diagnostics" || !Array.isArray(data.overflows)) return;
      if (document.body.dataset.mobilePane === "preview" && document.body.dataset.mobilePreviewAwaiting === "true" && previewFrameLoadedGeneration === previewFrameGeneration) confirmMobilePreview();
      const overflows = data.overflows.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.overflow_x) && Number.isFinite(item.overflow_y));
      const compressed = Array.isArray(data.fits)
        ? data.fits.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.fit_scale) && item.fit_scale < 0.7)
        : [];
      const contrasts = Array.isArray(data.contrasts)
        ? data.contrasts.filter((item) => item && typeof item.id === "string" && typeof item.region === "string" && Number.isFinite(item.ratio) && Number.isFinite(item.required) && (item.ratio < item.required || item.manual_review === true))
        : [];
      const clamps = Array.isArray(data.clamps)
        ? data.clamps.filter((item) => item && typeof item.id === "string" && Number.isFinite(item.hidden_lines) && item.hidden_lines > 0)
        : [];
      const readability = Array.isArray(data.readability)
        ? data.readability.filter((item) => item && typeof item.id === "string" && Number.isFinite(item.font_size_px) && Number.isFinite(item.recommended_px) && item.font_size_px < item.recommended_px)
        : [];
      const occlusions = Array.isArray(data.occlusions)
        ? data.occlusions.filter((item) => item && typeof item.id === "string" && typeof item.other_id === "string" && Number.isFinite(item.overlap_ratio) && item.overlap_ratio >= 0.2)
        : [];
      const fonts = Array.isArray(data.fonts)
        ? data.fonts.filter((item) => item && typeof item.id === "string" && typeof item.role === "string" && typeof item.preset === "string" && typeof item.field === "string" && Array.isArray(item.candidates))
        : [];
      if (layoutStatus instanceof HTMLElement) {
        layoutStatus.textContent = overflows.length
          ? overflows.length + "か所で文字が収まりません。品質確認から対象を確認してください。"
          : compressed.length
            ? compressed.length + "か所の文字を70%未満まで縮小しています。組版か文章量を見直してください。"
          : contrasts.length
            ? contrasts.some((item) => item.ratio < item.required)
              ? contrasts.length + "か所で文字と背景のコントラストを確認してください。"
              : contrasts.length + "か所は背景模様・透明度を含むため、実際の読みやすさを目視確認してください。"
          : clamps.length
            ? "読み上げ枠で文章の一部が省略されています。枠の大きさ・文字倍率・最大行数を見直してください。"
          : readability.length
            ? readability.length + "か所で文字が小さすぎます。自動縮小、文字倍率、枠の大きさを見直してください。"
          : occlusions.length
            ? occlusions.length + "組の文字表示が重なっています。読み上げ枠または自由配置の位置と大きさを確認してください。"
          : fonts.length
            ? fonts.length + "件の指定フォントがこの端末になく、代替フォントで表示されています。フォント設定または実際の改行を確認してください。"
          : "このSTEPの文字は" + (slideFrame.dataset.aspectRatio || "16:9") + "の枠内に収まっています。";
        layoutStatus.dataset.level = overflows.length || compressed.length || contrasts.length || clamps.length || readability.length || occlusions.length || fonts.length ? "warning" : "ok";
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
          appendDiagnostic(item, item.region + "「" + item.id + "」の文字コントラストは" + item.ratio.toFixed(1) + ":1" + (item.manual_review ? "です。背景模様・透明度を含む概算のため目視確認が必要です" : (item.estimated ? "（背景模様・透明度を含む概算）です" : "です")) + "（目安" + item.required.toFixed(1) + ":1以上）。", "style.foreground");
        }
        for (const item of clamps) {
          appendDiagnostic(item, "読み上げ枠で約" + item.hidden_lines + "行が省略されています。最大行数、文字倍率、枠の大きさを調整してください。");
        }
        for (const item of readability) {
          appendDiagnostic(item, item.region + "「" + item.id + "」の最小文字が基準幅換算" + item.font_size_px.toFixed(1) + "pxです（目安" + item.recommended_px.toFixed(0) + "px以上）。");
        }
        for (const item of occlusions) {
          appendDiagnostic(item, item.region + "「" + item.id + "」と" + item.other_region + "「" + item.other_id + "」が" + Math.round(item.overlap_ratio * 100) + "%重なっています。");
        }
        for (const item of fonts) {
          appendDiagnostic(item, item.role + "の「" + item.preset + "」はこの端末で候補フォント（" + item.candidates.join("、") + "）を確認できず、代替表示です。", item.field);
        }
      }
      if (qualitySummary instanceof HTMLElement) {
        const baseCount = Number(qualitySummary.dataset.baseCount || 0);
        const total = baseCount + overflows.length + compressed.length + contrasts.length + clamps.length + readability.length + occlusions.length + fonts.length;
        qualitySummary.dataset.level = total ? "warning" : "ok";
        qualitySummary.textContent = overflows.length
          ? total + "件の確認事項があります（うち見切れ" + overflows.length + "件）。"
          : compressed.length
            ? total + "件の確認事項があります（うち過剰な自動縮小" + compressed.length + "件）。"
          : contrasts.length
            ? total + "件の確認事項があります（うち配色の確認" + contrasts.length + "件）。"
          : clamps.length
            ? total + "件の確認事項があります（うち読み上げ文の省略" + clamps.length + "件）。"
          : readability.length
            ? total + "件の確認事項があります（うち小さすぎる文字" + readability.length + "件）。"
          : occlusions.length
            ? total + "件の確認事項があります（うち表示パーツの重なり" + occlusions.length + "件）。"
          : fonts.length
            ? total + "件の確認事項があります（うち指定フォントの代替表示" + fonts.length + "件）。"
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
    if (document.body.dataset.internalNavigation === "true") return;
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
  const voiceCueElements = (form) => [...form.querySelectorAll("[data-voice-cue]")].filter((cue) => cue instanceof HTMLFieldSetElement);
  const voiceCueField = (cue, name) => cue.querySelector('[name="' + name + '"]');
  const voiceCueFieldValue = (cue, name) => {
    const field = voiceCueField(cue, name);
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement ? field.value : "";
  };
  const syncVoiceCueForm = (form) => {
    const cues = voiceCueElements(form);
    const text = cues.map((cue) => voiceCueFieldValue(cue, "cue_text")).join("");
    const composed = form.elements.namedItem("text");
    if (composed instanceof HTMLTextAreaElement) composed.value = text;
    const preview = form.querySelector("[data-composed-narration-preview]");
    if (preview instanceof HTMLElement) preview.textContent = text || "発話ブロックへ文章を入力してください。";
    cues.forEach((cue, index) => {
      const label = cue.querySelector("[data-voice-cue-label]");
      if (label instanceof HTMLElement) label.textContent = "発話 " + (index + 1);
      const remove = cue.querySelector("[data-remove-voice-cue]");
      if (remove instanceof HTMLButtonElement) remove.disabled = cues.length === 1;
    });
    const add = form.querySelector("[data-add-voice-cue]");
    if (add instanceof HTMLButtonElement) add.disabled = cues.length >= 8;
  };
  const updateSegmentDuration = (form) => {
    const output = form.querySelector("[data-segment-duration]");
    const text = form.elements.namedItem("text");
    if (!(output instanceof HTMLElement) || !(text instanceof HTMLTextAreaElement)) return;
    if (form.matches("[data-segment-editor]")) syncVoiceCueForm(form);
    const inherited = segmentInheritedTuning(form);
    for (const field of form.querySelectorAll('input[name^="tuning_"]')) {
      if (!(field instanceof HTMLInputElement)) continue;
      const key = field.name.slice("tuning_".length);
      field.placeholder = "実効 " + (inherited[key] ?? "-");
    }
    const stepDuration = Number(form.dataset.stepDuration || 0);
    const cues = voiceCueElements(form);
    const speechSeconds = cues.length > 0
      ? cues.reduce((total, cue) => {
          const speedValue = Number(voiceCueFieldValue(cue, "cue_speedScale"));
          const speed = voiceCueFieldValue(cue, "cue_speedScale").trim() === "" || !Number.isFinite(speedValue)
            ? segmentTuningValue(form, "speedScale")
            : speedValue;
          return total + Math.max(1.2, voiceCueFieldValue(cue, "cue_text").length / (7 * speed)) + Math.max(0, Number(voiceCueFieldValue(cue, "cue_pause_after_seconds") || 0));
        }, 0)
      : Math.max(1.5, text.value.length / (7 * segmentTuningValue(form, "speedScale")));
    const estimated = speechSeconds + Math.max(0, Number(new FormData(form).get("pause_before_seconds") || 0)) + Math.max(0, Number(new FormData(form).get("pause_after_seconds") || 0));
    const previewButton = form.querySelector("[data-segment-speech-preview]");
    if (previewButton instanceof HTMLButtonElement) previewButton.disabled = text.value.trim() === "";
    output.textContent = "概算 " + estimated.toFixed(1) + "秒 / STEP目安 " + stepDuration.toFixed(1) + "秒";
    output.dataset.state = estimated > stepDuration * 1.15 ? "warning" : "ok";
  };
  for (const form of document.querySelectorAll("[data-segment-preview]")) {
    if (!(form instanceof HTMLFormElement)) continue;
    updateSegmentDuration(form);
    form.addEventListener("input", () => updateSegmentDuration(form));
    form.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !form.matches("[data-segment-editor]")) return;
      const addButton = target.closest("[data-add-voice-cue]");
      if (addButton instanceof HTMLButtonElement) {
        const template = form.querySelector("[data-voice-cue-template]");
        const list = form.querySelector("[data-voice-cue-list]");
        if (!(template instanceof HTMLTemplateElement) || !(list instanceof HTMLElement) || voiceCueElements(form).length >= 8) return;
        const fragment = template.content.cloneNode(true);
        const cue = fragment.querySelector("[data-voice-cue]");
        const cueId = cue?.querySelector('[name="cue_id"]');
        if (cueId instanceof HTMLInputElement) cueId.value = "cue-" + Date.now().toString(36) + "-" + (voiceCueElements(form).length + 1);
        list.append(fragment);
        syncVoiceCueForm(form);
        updateSegmentDuration(form);
        const textField = list.lastElementChild?.querySelector('[name="cue_text"]');
        if (textField instanceof HTMLTextAreaElement) textField.focus();
        form.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const removeButton = target.closest("[data-remove-voice-cue]");
      if (removeButton instanceof HTMLButtonElement) {
        const cues = voiceCueElements(form);
        if (cues.length <= 1) return;
        removeButton.closest("[data-voice-cue]")?.remove();
        syncVoiceCueForm(form);
        updateSegmentDuration(form);
        form.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const presetButton = target.closest("[data-voice-cue-preset]");
      if (!(presetButton instanceof HTMLButtonElement)) return;
      const cue = presetButton.closest("[data-voice-cue]");
      if (!(cue instanceof HTMLFieldSetElement)) return;
      const presets = {
        standard: { speedScale: 1, pitchScale: 0, intonationScale: 1 },
        emphasis: { speedScale: 1.08, pitchScale: 0.04, intonationScale: 1.35 },
        calm: { speedScale: 0.9, pitchScale: -0.03, intonationScale: 0.8 },
        quick: { speedScale: 1.3, pitchScale: 0.01, intonationScale: 1.1 }
      };
      const preset = presets[presetButton.dataset.voiceCuePreset];
      if (!preset) return;
      for (const [key, value] of Object.entries(preset)) {
        const field = voiceCueField(cue, "cue_" + key);
        if (field instanceof HTMLInputElement) field.value = String(value);
      }
      updateSegmentDuration(form);
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  let segmentSampleButton = null;
  let segmentSamplePlayer = null;
  let segmentSampleObjectUrl = "";
  let segmentSampleAbort = null;
  let segmentSpeechPreviewTimer = 0;
  let segmentSpeechPreviewButton = null;
  const stopSegmentSpeechPreview = () => {
    clearTimeout(segmentSpeechPreviewTimer);
    segmentSpeechPreviewTimer = 0;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (segmentSpeechPreviewButton instanceof HTMLButtonElement) {
      segmentSpeechPreviewButton.setAttribute("aria-pressed", "false");
      segmentSpeechPreviewButton.textContent = "ブラウザで仮試聴";
    }
    segmentSpeechPreviewButton = null;
  };
  const stopSegmentVoicevoxSample = (message = "") => {
    segmentSampleAbort?.abort();
    segmentSampleAbort = null;
    if (segmentSamplePlayer) {
      segmentSamplePlayer.pause();
      segmentSamplePlayer.removeAttribute("src");
      segmentSamplePlayer.load();
      segmentSamplePlayer = null;
    }
    if (segmentSampleObjectUrl) {
      URL.revokeObjectURL(segmentSampleObjectUrl);
      segmentSampleObjectUrl = "";
    }
    if (segmentSampleButton instanceof HTMLButtonElement) {
      segmentSampleButton.removeAttribute("aria-busy");
      segmentSampleButton.setAttribute("aria-pressed", "false");
      segmentSampleButton.textContent = segmentSampleButton.dataset.idleLabel || "この声をVOICEVOXで試聴";
      if (message) {
        const feedback = segmentSampleButton.closest("form")?.querySelector("[data-form-feedback]");
        if (feedback instanceof HTMLElement) feedback.textContent = message;
      }
    }
    segmentSampleButton = null;
  };

  for (const button of document.querySelectorAll("[data-segment-speech-preview]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.addEventListener("click", () => {
      stopSegmentVoicevoxSample();
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
        const feedback = button.closest("form")?.querySelector("[data-form-feedback]");
        if (feedback instanceof HTMLElement) feedback.textContent = "このブラウザでは音声の仮試聴を利用できません。";
        return;
      }
      if (button.getAttribute("aria-pressed") === "true") {
        stopSegmentSpeechPreview();
        return;
      }
      stopSegmentSpeechPreview();
      for (const other of document.querySelectorAll("[data-segment-speech-preview]")) {
        if (other instanceof HTMLButtonElement) {
          other.setAttribute("aria-pressed", "false");
          other.textContent = "ブラウザで仮試聴";
        }
      }
      const form = button.closest("[data-segment-preview]");
      if (!(form instanceof HTMLFormElement)) return;
      syncVoiceCueForm(form);
      const japaneseVoice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ja"));
      const cues = voiceCueElements(form);
      const previewCues = cues.length > 0
        ? cues.map((cue) => ({
            text: voiceCueFieldValue(cue, "cue_text"),
            speed: Number(voiceCueFieldValue(cue, "cue_speedScale") || segmentTuningValue(form, "speedScale")),
            pitch: Number(voiceCueFieldValue(cue, "cue_pitchScale") || segmentTuningValue(form, "pitchScale")),
            pause: Math.max(0, Number(voiceCueFieldValue(cue, "cue_pause_after_seconds") || 0) * 1000)
          }))
        : [{ text: String(new FormData(form).get("text") || ""), speed: segmentTuningValue(form, "speedScale"), pitch: segmentTuningValue(form, "pitchScale"), pause: 0 }];
      const finish = (postPause = true) => {
        const delay = postPause ? Math.max(0, Number(new FormData(form).get("pause_after_seconds") || 0) * 1000) : 0;
        if (delay > 0) {
          button.textContent = "読み上げ後の余白…";
          segmentSpeechPreviewTimer = setTimeout(() => finish(false), delay);
          return;
        }
        stopSegmentSpeechPreview();
      };
      const playCue = (index) => {
        if (segmentSpeechPreviewButton !== button) return;
        const cue = previewCues[index];
        if (!cue) { finish(); return; }
        const utterance = new SpeechSynthesisUtterance(cue.text);
        utterance.lang = "ja-JP";
        utterance.rate = Math.min(2, Math.max(0.5, cue.speed));
        utterance.pitch = Math.min(2, Math.max(0.5, 1 + cue.pitch * 2));
        utterance.volume = Math.min(1, Math.max(0, segmentTuningValue(form, "volumeScale")));
        if (japaneseVoice) utterance.voice = japaneseVoice;
        utterance.addEventListener("end", () => {
          if (cue.pause > 0) {
            button.textContent = "休符 " + (cue.pause / 1000).toFixed(1) + "秒…";
            segmentSpeechPreviewTimer = setTimeout(() => { button.textContent = "試聴を停止"; playCue(index + 1); }, cue.pause);
          } else playCue(index + 1);
        }, { once: true });
        utterance.addEventListener("error", () => finish(false), { once: true });
        speechSynthesis.speak(utterance);
      };
      segmentSpeechPreviewButton = button;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "試聴を停止";
      const prePause = Math.max(0, Number(new FormData(form).get("pause_before_seconds") || 0) * 1000);
      if (prePause > 0) {
        button.textContent = "読み上げ前の間…";
        segmentSpeechPreviewTimer = setTimeout(() => { button.textContent = "試聴を停止"; playCue(0); }, prePause);
      } else playCue(0);
    });
  }

  for (const button of document.querySelectorAll("[data-segment-voicevox-sample]")) {
    if (!(button instanceof HTMLButtonElement)) continue;
    button.dataset.idleLabel = button.textContent || "この声をVOICEVOXで試聴";
    button.addEventListener("click", async () => {
      if (segmentSampleButton === button) {
        stopSegmentVoicevoxSample("VOICEVOX試聴を停止しました。");
        return;
      }
      stopSegmentVoicevoxSample();
      stopSegmentSpeechPreview();
      for (const speechButton of document.querySelectorAll("[data-segment-speech-preview]")) {
        if (speechButton instanceof HTMLButtonElement) {
          speechButton.setAttribute("aria-pressed", "false");
          speechButton.textContent = "ブラウザで仮試聴";
        }
      }
      const form = button.closest("[data-segment-preview]");
      if (!(form instanceof HTMLFormElement)) return;
      const feedback = form.querySelector("[data-form-feedback]");
      let catalogs = {};
      try { catalogs = JSON.parse(form.dataset.profileCatalogs || "{}"); } catch {}
      const voiceField = form.elements.namedItem("voice_profile_id");
      const profileId = voiceField instanceof HTMLSelectElement ? voiceField.value : "";
      const catalogProfileId = catalogs[profileId];
      if (!catalogProfileId) {
        if (feedback instanceof HTMLElement) {
          feedback.textContent = "選択した声は現在のVOICEVOXカタログにありません。声を選び直してください。";
          feedback.classList.add("warning");
        }
        return;
      }
      const tuning = {};
      for (const key of ["speedScale", "pitchScale", "intonationScale", "volumeScale", "pauseLengthScale", "prePhonemeLength", "postPhonemeLength"]) {
        tuning[key] = segmentTuningValue(form, key);
      }
      segmentSampleButton = button;
      segmentSampleAbort = new AbortController();
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-pressed", "true");
      button.textContent = "VOICEVOXを準備中…";
      if (feedback instanceof HTMLElement) {
        feedback.textContent = "未保存の声とトーンで短い固定文を準備しています…";
        feedback.classList.remove("warning", "success");
      }
      try {
        const response = await fetch(button.dataset.segmentVoicevoxSample || "", {
          method: "POST",
          headers: {
            "accept": "audio/mpeg",
            "content-type": "application/json",
            "x-csrf-token": form.dataset.csrf || ""
          },
          body: JSON.stringify({ profile_id: catalogProfileId, tuning }),
          signal: segmentSampleAbort.signal
        });
        if (!response.ok) {
          let result = null;
          try { result = await response.json(); } catch {}
          throw new Error(apiErrorMessage(result, "VOICEVOX試聴を生成できませんでした。"));
        }
        const cacheHit = response.headers.get("x-voicevox-cache") === "hit";
        const blob = await response.blob();
        segmentSampleObjectUrl = URL.createObjectURL(blob);
        segmentSamplePlayer = new Audio(segmentSampleObjectUrl);
        segmentSampleAbort = null;
        button.removeAttribute("aria-busy");
        button.textContent = "試聴を停止";
        segmentSamplePlayer.addEventListener("ended", () => stopSegmentVoicevoxSample("VOICEVOX試聴が終わりました。"), { once: true });
        segmentSamplePlayer.addEventListener("error", () => stopSegmentVoicevoxSample("取得した試聴音声を再生できませんでした。"), { once: true });
        await segmentSamplePlayer.play();
        if (feedback instanceof HTMLElement) {
          feedback.textContent = cacheHit ? "同じ声とトーンのVOICEVOX試聴を再利用しています。" : "VOICEVOX実音声を再生しています。次回は同じ設定を再利用します。";
          feedback.classList.add("success");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        stopSegmentVoicevoxSample();
        if (feedback instanceof HTMLElement) {
          feedback.textContent = caughtErrorMessage(error, "VOICEVOX試聴を生成できませんでした。");
          feedback.classList.add("warning");
        }
      }
    });
  }

  const voicePage = document.querySelector("[data-voice-page]");
  if (voicePage instanceof HTMLElement) {
    const csrf = voicePage.dataset.csrf || "";
    const setupButton = voicePage.querySelector("[data-voice-setup]");
    const selectionForm = voicePage.querySelector("[data-voice-selection-form]");
    const speakerSelect = voicePage.querySelector("[data-voice-speaker]");
    const profileSelect = voicePage.querySelector("[data-voice-profile]");
    const setupFeedback = voicePage.querySelector("[data-voice-setup-feedback]");
    const profileTuningForm = voicePage.querySelector("[data-voice-profile-tuning]");
    const voicevoxSampleButton = voicePage.querySelector("[data-voicevox-sample]");
    const voicevoxSampleFeedback = voicePage.querySelector("[data-voicevox-sample-feedback]");
    const generateButton = voicePage.querySelector("[data-voice-generate]");
    const generateFeedback = voicePage.querySelector("[data-voice-generate-feedback]");
    const jobCard = voicePage.querySelector("[data-voice-job]");
    const terminalStatuses = new Set(["completed", "partially_failed", "failed", "cancelled"]);
    const selectionDraftKey = "ultimate-freestyle:voice-selection:" + (voicePage.dataset.projectId || "");
    const tuningDraftKey = "ultimate-freestyle:voice-tuning:" + (voicePage.dataset.projectId || "");
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
    const persistVoiceSelection = () => {
      if (!(selectionForm instanceof HTMLFormElement) || !(profileSelect instanceof HTMLSelectElement)) return;
      const changed = profileSelect.value !== selectionForm.dataset.initialProfile;
      selectionForm.dataset.dirty = String(changed);
      try {
        if (changed) sessionStorage.setItem(selectionDraftKey, JSON.stringify({ profile_id: profileSelect.value }));
        else sessionStorage.removeItem(selectionDraftKey);
      } catch {}
    };
    if (selectionForm instanceof HTMLFormElement && profileSelect instanceof HTMLSelectElement && speakerSelect instanceof HTMLSelectElement) {
      try {
        const draft = JSON.parse(sessionStorage.getItem(selectionDraftKey) || "null");
        const profile = voiceCatalog.find((item) => item.id === draft?.profile_id);
        if (profile && profile.id !== selectionForm.dataset.initialProfile) {
          speakerSelect.value = profile.speakerName;
          rebuildVoiceStyles(profile.id);
          selectionForm.dataset.dirty = "true";
          if (setupFeedback instanceof HTMLElement) {
            setupFeedback.textContent = profile.label + "の未保存選択を復元しました。確認して保存または選び直してください。";
            setupFeedback.classList.remove("success", "warning");
          }
        } else if (draft !== null) sessionStorage.removeItem(selectionDraftKey);
      } catch {
        try { sessionStorage.removeItem(selectionDraftKey); } catch {}
      }
    }
    if (speakerSelect instanceof HTMLSelectElement) {
      speakerSelect.addEventListener("change", () => {
        rebuildVoiceStyles();
        persistVoiceSelection();
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
        persistVoiceSelection();
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
    let samplePlayer = null;
    let sampleObjectUrl = "";
    let sampleAbort = null;
    const stopVoicevoxSample = (message = "") => {
      sampleAbort?.abort();
      sampleAbort = null;
      if (samplePlayer) { samplePlayer.pause(); samplePlayer.removeAttribute("src"); samplePlayer.load(); samplePlayer = null; }
      if (sampleObjectUrl) { URL.revokeObjectURL(sampleObjectUrl); sampleObjectUrl = ""; }
      if (voicevoxSampleButton instanceof HTMLButtonElement) {
        voicevoxSampleButton.setAttribute("aria-pressed", "false");
        voicevoxSampleButton.textContent = "選択中の声をVOICEVOXで試聴";
        voicevoxSampleButton.removeAttribute("aria-busy");
      }
      if (message && voicevoxSampleFeedback instanceof HTMLElement) voicevoxSampleFeedback.textContent = message;
    };
    if (voicevoxSampleButton instanceof HTMLButtonElement) {
      voicevoxSampleButton.addEventListener("click", async () => {
        if (samplePlayer || sampleAbort) { stopVoicevoxSample("VOICEVOX試聴を停止しました。"); return; }
        let tuning = {};
        try { tuning = JSON.parse(voicePage.dataset.defaultTuning || "{}"); } catch {}
        if (profileTuningForm instanceof HTMLFormElement) {
          const data = new FormData(profileTuningForm);
          for (const key of ["speedScale", "pitchScale", "intonationScale", "volumeScale", "pauseLengthScale", "prePhonemeLength", "postPhonemeLength"]) tuning[key] = Number(data.get("tuning_" + key));
        }
        sampleAbort = new AbortController();
        voicevoxSampleButton.setAttribute("aria-busy", "true");
        voicevoxSampleButton.setAttribute("aria-pressed", "true");
        voicevoxSampleButton.textContent = "準備を中止";
        if (voicevoxSampleFeedback instanceof HTMLElement) {
          voicevoxSampleFeedback.textContent = "選択中の話者・スタイルとトーンで短い音声を準備しています…";
          voicevoxSampleFeedback.classList.remove("warning", "success");
        }
        try {
          const response = await fetch(voicevoxSampleButton.dataset.voicevoxSample || "", {
            method: "POST",
            headers: { "accept": "audio/mpeg", "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({ profile_id: profileSelect instanceof HTMLSelectElement ? profileSelect.value : "voicevox-style-3", tuning }),
            signal: sampleAbort.signal
          });
          if (!response.ok) {
            let result = null;
            try { result = await response.json(); } catch {}
            throw new Error(apiErrorMessage(result, "VOICEVOX試聴を生成できませんでした。"));
          }
          const cacheHit = response.headers.get("x-voicevox-cache") === "hit";
          const blob = await response.blob();
          sampleObjectUrl = URL.createObjectURL(blob);
          samplePlayer = new Audio(sampleObjectUrl);
          sampleAbort = null;
          voicevoxSampleButton.textContent = "試聴を停止";
          voicevoxSampleButton.removeAttribute("aria-busy");
          samplePlayer.addEventListener("ended", () => stopVoicevoxSample("VOICEVOX試聴が終わりました。"), { once: true });
          samplePlayer.addEventListener("error", () => stopVoicevoxSample("取得した試聴音声を再生できませんでした。"), { once: true });
          await samplePlayer.play();
          if (voicevoxSampleFeedback instanceof HTMLElement) {
            voicevoxSampleFeedback.textContent = cacheHit ? "生成済みの同じ設定を再利用して再生しています。" : "VOICEVOXで生成した声を再生しています。次回は同じ設定を再利用します。";
            voicevoxSampleFeedback.classList.add("success");
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          stopVoicevoxSample();
          if (voicevoxSampleFeedback instanceof HTMLElement) {
            voicevoxSampleFeedback.textContent = caughtErrorMessage(error, "VOICEVOX試聴を生成できませんでした。");
            voicevoxSampleFeedback.classList.add("warning");
          }
        }
      });
      profileSelect?.addEventListener("change", () => stopVoicevoxSample());
      speakerSelect?.addEventListener("change", () => stopVoicevoxSample());
      profileTuningForm?.addEventListener("input", () => stopVoicevoxSample());
    }
    let activePollUrl = "";
    let pollInFlight = false;
    const pollJob = async (statusUrl) => {
      const url = safeStatusUrl(statusUrl);
      if (url === null || pollInFlight) return;
      activePollUrl = url;
      pollInFlight = true;
      clearTimeout(pollTimer);
      try {
        const response = await fetch(url, { headers: { accept: "application/json" } });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "生成状況を取得できませんでした。"));
        const job = result.job || result;
        pollFailures = 0;
        updateJob(job);
        if (terminalStatuses.has(job.status)) {
          activePollUrl = "";
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
      } finally {
        pollInFlight = false;
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || activePollUrl === "") return;
      clearTimeout(pollTimer);
      void pollJob(activePollUrl);
    });
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
          if (selectionForm instanceof HTMLFormElement) selectionForm.dataset.dirty = "false";
          try { sessionStorage.removeItem(selectionDraftKey); } catch {}
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
      const tuningFields = () => Object.fromEntries(
        [...profileTuningForm.elements]
          .filter((field) => field instanceof HTMLInputElement && field.name.startsWith("tuning_"))
          .map((field) => [field.name, field.value])
      );
      try {
        const draft = JSON.parse(sessionStorage.getItem(tuningDraftKey) || "null");
        if (draft && typeof draft === "object") {
          for (const [name, value] of Object.entries(draft)) {
            const input = profileTuningForm.elements.namedItem(name);
            if (input instanceof HTMLInputElement) input.value = String(value);
          }
          profileTuningForm.dataset.dirty = "true";
          if (tuningFeedback instanceof HTMLElement) tuningFeedback.textContent = "未保存のトーン調整を復元しました。仮試聴してから保存してください。";
        }
      } catch {
        try { sessionStorage.removeItem(tuningDraftKey); } catch {}
      }
      profileTuningForm.addEventListener("input", () => {
        profileTuningForm.dataset.dirty = "true";
        try { sessionStorage.setItem(tuningDraftKey, JSON.stringify(tuningFields())); } catch {}
      });
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
          try { sessionStorage.removeItem(tuningDraftKey); } catch {}
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
        persistVoiceSelection();
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
    let activePreviewSeek = null;
    let activePreviewTime = null;
    const playbackTime = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
      return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
    };
    const updatePreviewTimeline = (current, duration) => {
      if (activePreviewSeek instanceof HTMLInputElement) {
        activePreviewSeek.max = String(Number.isFinite(duration) ? duration : 0);
        activePreviewSeek.value = String(Number.isFinite(current) && Number.isFinite(duration) ? Math.min(current, duration) : 0);
        activePreviewSeek.disabled = !Number.isFinite(duration) || duration <= 0;
      }
      if (activePreviewTime instanceof HTMLOutputElement) activePreviewTime.textContent = playbackTime(current) + " / " + playbackTime(duration);
    };
    const stopPreview = (message = "") => {
      if (activePlayer) {
        const duration = activePlayer.duration;
        activePlayer.pause();
        updatePreviewTimeline(0, duration);
        activePlayer.removeAttribute("src");
        activePlayer.load();
        activePlayer = null;
      }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      if (activePreviewButton instanceof HTMLButtonElement) {
        activePreviewButton.setAttribute("aria-pressed", "false");
        activePreviewButton.textContent = activePreviewButton.dataset.audioUrl ? "生成音声を試聴" : "ブラウザ音声で仮試聴";
      }
      if (activePreviewFeedback instanceof HTMLElement) activePreviewFeedback.textContent = message;
      activePreviewButton = null;
      activePreviewFeedback = null;
      activePreviewSeek = null;
      activePreviewTime = null;
    };
    for (const seek of voicePage.querySelectorAll("[data-voice-preview-seek]")) {
      if (!(seek instanceof HTMLInputElement)) continue;
      seek.addEventListener("input", () => {
        if (seek !== activePreviewSeek || !activePlayer) return;
        activePlayer.currentTime = Number(seek.value);
        updatePreviewTimeline(activePlayer.currentTime, activePlayer.duration);
      });
    }
    for (const button of voicePage.querySelectorAll("[data-voice-preview]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => {
        if (activePreviewButton === button) { stopPreview("試聴を停止しました。"); return; }
        stopPreview();
        activePreviewButton = button;
        const segment = button.closest("[data-voice-segment]");
        activePreviewFeedback = segment?.querySelector("[data-voice-preview-feedback]") || null;
        activePreviewSeek = segment?.querySelector("[data-voice-preview-seek]") || null;
        activePreviewTime = segment?.querySelector("[data-voice-preview-time]") || null;
        if (activePreviewFeedback instanceof HTMLElement) activePreviewFeedback.textContent = "再生しています…";
        button.setAttribute("aria-pressed", "true");
        button.textContent = "停止";
        const audioUrl = safeStatusUrl(button.dataset.audioUrl || "");
        if (audioUrl !== null && button.dataset.audioUrl) {
          const player = new Audio(audioUrl);
          activePlayer = player;
          const updatePlayerTimeline = () => updatePreviewTimeline(player.currentTime, player.duration);
          player.addEventListener("loadedmetadata", updatePlayerTimeline);
          player.addEventListener("durationchange", updatePlayerTimeline);
          player.addEventListener("timeupdate", updatePlayerTimeline);
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
  const reviewButton = document.querySelector("[data-review-preview]");
  const publishButton = document.querySelector("[data-publish-preview]");
  const publishFeedback = document.querySelector("[data-publish-feedback]");
  const previewStatus = document.querySelector("[data-preview-status]");
  const previewReviewStatus = document.querySelector("[data-preview-review-status]");
  const publishedStatus = document.querySelector("[data-published-status]");
  const previewLink = document.querySelector("[data-preview-link]");
  const publicLink = document.querySelector("[data-public-link]");
  const copyPublicButton = document.querySelector("[data-copy-public]");
  const copyPublicFeedback = document.querySelector("[data-copy-public-feedback]");
  const unpublishButton = document.querySelector("[data-unpublish]");
  if (previewButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    previewButton.addEventListener("click", async () => {
      if (guardPublicationAction()) return;
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
          publishButton.dataset.previewCurrent = "true";
          publishButton.dataset.previewReviewed = "false";
          publishButton.disabled = true;
        }
        if (reviewButton instanceof HTMLButtonElement) {
          reviewButton.dataset.revision = result.revision.revision_id;
          reviewButton.dataset.project = result.revision.project_id;
          reviewButton.dataset.version = String(result.revision.project_version);
          reviewButton.dataset.renderer = result.revision.renderer_version;
          reviewButton.dataset.reviewPreview = "/api/projects/" + result.revision.project_id + "/previews/" + result.revision.revision_id + "/review";
          reviewButton.dataset.reviewAvailable = "false";
          reviewButton.disabled = true;
          reviewButton.textContent = "終了画面の到達待ち";
        }
        if (previewStatus instanceof HTMLElement) {
          previewStatus.textContent = "v" + result.revision.project_version + " · " + result.revision.renderer_version;
        }
        if (previewReviewStatus instanceof HTMLElement) previewReviewStatus.textContent = "終了画面の到達待ち";
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

  if (reviewButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    let recordingReview = false;
    let pendingReviewDetail = null;
    let reviewRetryCount = 0;
    let reviewRetryTimer;
    const recordCompletedPreview = async (detail) => {
      if (recordingReview || reviewButton.textContent === "プレビュー確認済み") return;
      if (!detail || detail.revision_id !== reviewButton.dataset.revision) return;
      if (detail.project_id !== reviewButton.dataset.project) return;
      if (String(detail.project_version) !== reviewButton.dataset.version) return;
      if (detail.renderer_version !== reviewButton.dataset.renderer) return;
      pendingReviewDetail = detail;
      recordingReview = true;
      reviewButton.disabled = true;
      reviewButton.textContent = "到達を記録中…";
      publishFeedback.textContent = "終了画面への到達を記録しています…";
      publishFeedback.classList.remove("warning", "success");
      try {
        const response = await fetch(reviewButton.dataset.reviewPreview || "", {
          method: "POST",
          headers: { "x-csrf-token": reviewButton.dataset.csrf || "" }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "確認状態を記録できませんでした。"));
        reviewButton.textContent = "プレビュー確認済み";
        reviewButton.dataset.reviewAvailable = "false";
        if (previewReviewStatus instanceof HTMLElement) previewReviewStatus.textContent = "確認済み";
        if (publishButton instanceof HTMLButtonElement) {
          publishButton.dataset.previewReviewed = "true";
          publishButton.disabled = publicationBaseDisabled(publishButton);
        }
        publishFeedback.textContent = "この固定プレビューを公開できます。";
        publishFeedback.classList.add("success");
        pendingReviewDetail = null;
        reviewRetryCount = 0;
        clearTimeout(reviewRetryTimer);
        reloadPublicationWhenSafe(publishFeedback);
      } catch (error) {
        reviewRetryCount += 1;
        reviewButton.textContent = reviewRetryCount <= 3 ? "到達記録を再試行中…" : "到達記録を再試行";
        reviewButton.dataset.reviewAvailable = String(reviewRetryCount > 3);
        reviewButton.disabled = reviewRetryCount <= 3;
        publishFeedback.textContent = caughtErrorMessage(error, "確認状態を記録できませんでした。");
        publishFeedback.classList.add("warning");
        if (reviewRetryCount <= 3) {
          reviewRetryTimer = setTimeout(() => {
            if (pendingReviewDetail !== null) void recordCompletedPreview(pendingReviewDetail);
          }, 500 * (2 ** (reviewRetryCount - 1)));
        }
      } finally {
        recordingReview = false;
      }
    };
    const readStoredCompletion = () => {
      const revisionId = reviewButton.dataset.revision;
      if (!revisionId) return;
      try {
        const stored = localStorage.getItem("ultimate-freestyle:preview-completed:" + revisionId);
        if (stored) void recordCompletedPreview(JSON.parse(stored));
      } catch {}
    };
    addEventListener("storage", (event) => {
      if (event.key !== "ultimate-freestyle:preview-completed:" + reviewButton.dataset.revision || !event.newValue) return;
      try { void recordCompletedPreview(JSON.parse(event.newValue)); } catch {}
    });
    if ("BroadcastChannel" in window) {
      const reviewChannel = new BroadcastChannel("ultimate-freestyle:preview-review");
      reviewChannel.addEventListener("message", (event) => { void recordCompletedPreview(event.data); });
      addEventListener("pagehide", () => reviewChannel.close(), { once: true });
    }
    reviewButton.addEventListener("click", () => {
      if (guardPublicationAction()) return;
      if (pendingReviewDetail !== null) void recordCompletedPreview(pendingReviewDetail);
      else readStoredCompletion();
    });
    readStoredCompletion();
    addEventListener("ultimate-freestyle:preview-created", readStoredCompletion);
  }

  if (publishButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    publishButton.addEventListener("click", async () => {
      if (guardPublicationAction()) return;
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
        if (unpublishButton instanceof HTMLButtonElement) {
          unpublishButton.disabled = false;
          unpublishButton.hidden = false;
        }
        reloadPublicationWhenSafe(publishFeedback);
      } catch (error) {
        publishFeedback.textContent = caughtErrorMessage(error, "公開できませんでした。");
        publishFeedback.classList.add("warning");
        publishButton.disabled = false;
      }
    });
  }
  if (unpublishButton instanceof HTMLButtonElement && publishFeedback instanceof HTMLElement) {
    unpublishButton.addEventListener("click", async () => {
      if (guardPublicationAction()) return;
      if (!confirm("公開ページを停止しますか？ 固定プレビューと下書きは残ります。")) return;
      unpublishButton.disabled = true;
      publishFeedback.textContent = "公開を停止しています…";
      publishFeedback.classList.remove("warning", "success");
      try {
        const response = await fetch(unpublishButton.dataset.unpublish || "", {
          method: "DELETE",
          headers: { "x-csrf-token": unpublishButton.dataset.csrf || "" }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "公開を停止できませんでした。"));
        unpublishButton.disabled = false;
        unpublishButton.hidden = true;
        if (publishedStatus instanceof HTMLElement) publishedStatus.textContent = "未公開";
        if (publicLink instanceof HTMLAnchorElement) {
          publicLink.href = "#";
          publicLink.hidden = true;
        }
        if (copyPublicButton instanceof HTMLButtonElement) copyPublicButton.hidden = true;
        if (publishButton instanceof HTMLButtonElement) {
          publishButton.dataset.publishedCurrent = "false";
          publishButton.textContent = "確認した版を公開";
          publishButton.disabled = publishButton.dataset.durationValid !== "true" || publishButton.dataset.previewReviewed !== "true";
        }
        publishFeedback.textContent = "公開を停止しました。固定プレビューと編集内容は残っています。";
        publishFeedback.classList.add("success");
        reloadPublicationWhenSafe(publishFeedback);
      } catch (error) {
        unpublishButton.disabled = false;
        publishFeedback.textContent = caughtErrorMessage(error, "公開を停止できませんでした。");
        publishFeedback.classList.add("warning");
      }
    });
  }
  for (const rollbackButton of document.querySelectorAll("[data-publish-rollback]")) {
    if (!(rollbackButton instanceof HTMLButtonElement) || !(publishFeedback instanceof HTMLElement)) continue;
    rollbackButton.addEventListener("click", async () => {
      if (guardPublicationAction()) return;
      if (!confirm("以前に公開したこの版へ戻しますか？ 現在の下書きは変更されません。")) return;
      setButtonBusy(rollbackButton, true, "切替中…");
      publishFeedback.textContent = "以前の公開版へ切り替えています…";
      publishFeedback.classList.remove("warning", "success");
      try {
        const response = await fetch(rollbackButton.dataset.publishRollback || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": rollbackButton.dataset.csrf || ""
          },
          body: JSON.stringify({ revision_id: rollbackButton.dataset.revision || "" })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "以前の公開版へ戻せませんでした。"));
        publishFeedback.textContent = "以前の公開版へ戻しました。下書きは変更していません。";
        publishFeedback.classList.add("success");
        reloadPublicationWhenSafe(publishFeedback);
      } catch (error) {
        setButtonBusy(rollbackButton, false);
        publishFeedback.textContent = caughtErrorMessage(error, "以前の公開版へ戻せませんでした。");
        publishFeedback.classList.add("warning");
      }
    });
  }
  const draftRestoreFeedback = document.querySelector("[data-draft-restore-feedback]");
  for (const restoreButton of document.querySelectorAll("[data-draft-restore]")) {
    if (!(restoreButton instanceof HTMLButtonElement) || !(draftRestoreFeedback instanceof HTMLElement)) continue;
    restoreButton.addEventListener("click", async () => {
      const dirty = document.querySelector('[data-dirty="true"]') !== null;
      const prefix = dirty ? "未保存の入力は履歴に残りません。\n" : "";
      if (!confirm(prefix + "v" + (restoreButton.dataset.targetVersion || "?") + " を新しい下書きとして復元しますか？ 現在の保存済み下書きも履歴に残ります。")) return;
      setButtonBusy(restoreButton, true);
      draftRestoreFeedback.textContent = "過去の下書きを新しいversionとして復元しています…";
      draftRestoreFeedback.classList.remove("warning", "success");
      try {
        const response = await fetch(restoreButton.dataset.draftRestore || "", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": restoreButton.dataset.csrf || ""
          },
          body: JSON.stringify({ expected_version: Number(restoreButton.dataset.currentVersion) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, "下書きを復元できませんでした。"));
        draftRestoreFeedback.textContent = "v" + result.restored_from_version + " をv" + result.version + "として復元しました。移動します…";
        draftRestoreFeedback.classList.add("success");
        location.href = result.next_url;
      } catch (error) {
        draftRestoreFeedback.textContent = caughtErrorMessage(error, "下書きを復元できませんでした。");
        draftRestoreFeedback.classList.add("warning");
        setButtonBusy(restoreButton, false);
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

  const reviewPage = document.querySelector("[data-review-page]");
  if (reviewPage instanceof HTMLElement) {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (!location.hash && navigation instanceof PerformanceNavigationTiming && navigation.type === "navigate") {
      requestAnimationFrame(() => scrollTo({ top: 0, behavior: "auto" }));
    }
    const composer = reviewPage.querySelector("[data-review-composer]");
    const selectionLabel = reviewPage.querySelector("[data-review-selection]");
    const feedback = reviewPage.querySelector("[data-review-feedback]");
    const targetKey = composer?.querySelector('input[name="target_key"]');
    const rangeStart = composer?.querySelector('input[name="range_start"]');
    const rangeEnd = composer?.querySelector('input[name="range_end"]');
    const selectedText = composer?.querySelector('input[name="selected_text"]');
    const bodyInput = composer?.querySelector('textarea[name="body"]');
    const selectionToolbar = reviewPage.querySelector("[data-review-selection-toolbar]");
    const selectionAction = reviewPage.querySelector("[data-review-selection-action]");
    const selectionActionLabel = reviewPage.querySelector("[data-review-selection-action-label]");
    let pendingReviewSelection = null;
    let reviewToolbarRange = null;
    let reviewToolbarFrame = 0;
    const reloadReviewPage = (nextUrl) => {
      try {
        const destination = new URL(typeof nextUrl === "string" ? nextUrl : location.href, location.href);
        if (destination.origin === location.origin) {
          history.replaceState(null, "", destination.pathname + destination.search + destination.hash);
        }
      } catch {}
      location.reload();
    };
    const reviewDraftKey = "ultimate-freestyle:review-draft:" + (reviewPage.dataset.projectId || "") + ":" + (reviewPage.dataset.slideId || "");
    if (bodyInput instanceof HTMLTextAreaElement) {
      try {
        const draft = sessionStorage.getItem(reviewDraftKey);
        if (draft !== null && bodyInput.value.length === 0) {
          bodyInput.value = draft;
          if (feedback instanceof HTMLElement) feedback.textContent = "このタブに残っていたコメントの下書きを復元しました。";
        }
      } catch {}
      bodyInput.addEventListener("input", () => {
        try {
          if (bodyInput.value.length === 0) sessionStorage.removeItem(reviewDraftKey);
          else sessionStorage.setItem(reviewDraftKey, bodyInput.value);
        } catch {}
      });
    }
    const clearActiveReviewHighlight = () => {
      const highlights = globalThis.CSS?.highlights;
      if (highlights && typeof highlights.delete === "function") highlights.delete("review-selection");
    };
    const hideReviewSelectionToolbar = () => {
      pendingReviewSelection = null;
      reviewToolbarRange = null;
      if (selectionToolbar instanceof HTMLElement) selectionToolbar.hidden = true;
    };
    const positionReviewSelectionToolbar = () => {
      if (!(selectionToolbar instanceof HTMLElement) || !(reviewToolbarRange instanceof Range)) return;
      const rects = reviewToolbarRange.getClientRects();
      const rect = rects.length > 0 ? rects[0] : reviewToolbarRange.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
        selectionToolbar.hidden = true;
        return;
      }
      const roomAbove = rect.top >= 58;
      selectionToolbar.dataset.placement = roomAbove ? "above" : "below";
      selectionToolbar.style.left = Math.min(innerWidth - 84, Math.max(84, rect.left + rect.width / 2)) + "px";
      selectionToolbar.style.top = (roomAbove ? rect.top : rect.bottom) + "px";
      selectionToolbar.hidden = false;
    };
    const scheduleReviewToolbarPosition = () => {
      cancelAnimationFrame(reviewToolbarFrame);
      reviewToolbarFrame = requestAnimationFrame(positionReviewSelectionToolbar);
    };
    const showReviewSelectionToolbar = (range, pending, errorMessage = "") => {
      if (!(selectionToolbar instanceof HTMLElement) || !(selectionAction instanceof HTMLButtonElement)) return;
      pendingReviewSelection = pending;
      reviewToolbarRange = range.cloneRange();
      selectionAction.disabled = errorMessage.length > 0;
      if (selectionActionLabel instanceof HTMLElement) {
        selectionActionLabel.textContent = errorMessage || "コメントを追加";
      }
      positionReviewSelectionToolbar();
    };
    const applyPendingReviewSelection = () => {
      if (pendingReviewSelection === null) return;
      if (!(targetKey instanceof HTMLInputElement) || !(rangeStart instanceof HTMLInputElement) || !(rangeEnd instanceof HTMLInputElement) || !(selectedText instanceof HTMLInputElement)) return;
      const pending = pendingReviewSelection;
      targetKey.value = pending.source.dataset.sourceKey || "";
      rangeStart.value = String(pending.start);
      rangeEnd.value = String(pending.start + pending.value.length);
      selectedText.value = pending.value;
      composer?.setAttribute("data-active", "true");
      for (const item of reviewPage.querySelectorAll("[data-review-source]")) item.toggleAttribute("data-selected", item === pending.source);
      if (selectionLabel instanceof HTMLElement) selectionLabel.textContent = (pending.source.dataset.sourceLabel || "文章") + "の「" + pending.value.replace(/\s+/g, " ").slice(0, 160) + (pending.value.length > 160 ? "…" : "") + "」へのコメントです。";
      if (feedback instanceof HTMLElement) {
        feedback.textContent = "範囲を指定しました。指摘を書いて追加してください。";
        feedback.classList.remove("warning", "success");
      }
      const HighlightType = globalThis.Highlight;
      if (globalThis.CSS?.highlights && typeof HighlightType === "function") {
        globalThis.CSS.highlights.set("review-selection", new HighlightType(pending.range));
      }
      hideReviewSelectionToolbar();
      bodyInput?.focus({ preventScroll: true });
      if (matchMedia("(max-width: 60rem)").matches && composer instanceof HTMLElement) {
        requestAnimationFrame(() => composer.scrollIntoView({ block: "start", behavior: "smooth" }));
      }
    };
    const resetSelection = () => {
      if (!(targetKey instanceof HTMLInputElement) || !(rangeStart instanceof HTMLInputElement) || !(rangeEnd instanceof HTMLInputElement) || !(selectedText instanceof HTMLInputElement)) return;
      targetKey.value = "slide:whole";
      rangeStart.value = "";
      rangeEnd.value = "";
      selectedText.value = "";
      hideReviewSelectionToolbar();
      clearActiveReviewHighlight();
      getSelection()?.removeAllRanges();
      composer?.removeAttribute("data-active");
      for (const source of reviewPage.querySelectorAll("[data-review-source]")) source.removeAttribute("data-selected");
      if (selectionLabel instanceof HTMLElement) selectionLabel.textContent = "スライド全体へのコメントです。中央の文字を選ぶと範囲を指定できます。";
      if (feedback instanceof HTMLElement) {
        feedback.textContent = "";
        feedback.classList.remove("warning", "success");
      }
    };
    const captureSelection = () => {
      const selection = getSelection();
      if (selection === null || selection.rangeCount !== 1 || selection.isCollapsed) {
        hideReviewSelectionToolbar();
        return;
      }
      const range = selection.getRangeAt(0);
      const startElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const endElement = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
      const source = startElement?.closest("[data-review-source]");
      if (!(source instanceof HTMLElement) || source !== endElement?.closest("[data-review-source]")) {
        hideReviewSelectionToolbar();
        return;
      }
      const text = source.querySelector("[data-review-text]");
      if (!(text instanceof HTMLElement) || !text.contains(range.commonAncestorContainer)) {
        hideReviewSelectionToolbar();
        return;
      }
      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(text);
      try { prefixRange.setEnd(range.startContainer, range.startOffset); } catch { return; }
      const value = range.toString();
      if (value.length === 0 || value.length > 2000) {
        if (value.length > 2000) showReviewSelectionToolbar(range, null, "2000文字以内で選択");
        else hideReviewSelectionToolbar();
        if (feedback instanceof HTMLElement) {
          feedback.textContent = value.length > 2000 ? "一度に選択できるのは2000文字までです。範囲を分けてください。" : "";
          feedback.classList.toggle("warning", value.length > 2000);
        }
        return;
      }
      const start = prefixRange.toString().length;
      if (feedback instanceof HTMLElement) {
        feedback.textContent = "選択範囲の近くにある「コメントを追加」を押してください。";
        feedback.classList.remove("warning", "success");
      }
      showReviewSelectionToolbar(range, {
        source,
        start,
        value,
        range: range.cloneRange()
      });
    };
    reviewPage.addEventListener("pointerup", () => setTimeout(captureSelection));
    reviewPage.addEventListener("keyup", (event) => {
      if (event.key === "Shift" || event.key.startsWith("Arrow")) setTimeout(captureSelection);
    });
    selectionToolbar?.addEventListener("pointerdown", (event) => event.preventDefault());
    selectionAction?.addEventListener("click", applyPendingReviewSelection);
    reviewPage.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !selectionToolbar?.hasAttribute("hidden")) {
        event.preventDefault();
        hideReviewSelectionToolbar();
        getSelection()?.removeAllRanges();
      }
      if (event.key.toLowerCase() === "m" && event.altKey && (event.ctrlKey || event.metaKey) && pendingReviewSelection !== null) {
        event.preventDefault();
        applyPendingReviewSelection();
      }
    });
    addEventListener("resize", scheduleReviewToolbarPosition);
    document.addEventListener("scroll", scheduleReviewToolbarPosition, { capture: true, passive: true });
    reviewPage.querySelector("[data-review-whole]")?.addEventListener("click", resetSelection);
    if (composer instanceof HTMLFormElement) {
      composer.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = composer.querySelector('button[type="submit"]');
        if (!(targetKey instanceof HTMLInputElement) || !(rangeStart instanceof HTMLInputElement) || !(rangeEnd instanceof HTMLInputElement) || !(selectedText instanceof HTMLInputElement) || !(bodyInput instanceof HTMLTextAreaElement)) return;
        setButtonBusy(submit, true);
        if (feedback instanceof HTMLElement) {
          feedback.textContent = "コメントを保存しています…";
          feedback.classList.remove("warning", "success");
        }
        try {
          const response = await fetch(reviewPage.dataset.commentUrl || "", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": reviewPage.dataset.csrf || "" },
            body: JSON.stringify({
              target_key: targetKey.value,
              range_start: rangeStart.value === "" ? null : Number(rangeStart.value),
              range_end: rangeEnd.value === "" ? null : Number(rangeEnd.value),
              selected_text: selectedText.value,
              body: bodyInput.value
            })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "コメントを保存できませんでした。"));
          if (feedback instanceof HTMLElement) {
            feedback.textContent = "保存しました。レビューを更新します…";
            feedback.classList.add("success");
          }
          try { sessionStorage.removeItem(reviewDraftKey); } catch {}
          reloadReviewPage(result.next_url);
        } catch (error) {
          if (feedback instanceof HTMLElement) {
            feedback.textContent = caughtErrorMessage(error, "コメントを保存できませんでした。");
            feedback.classList.add("warning");
          }
          setButtonBusy(submit, false);
        }
      });
    }
    for (const button of reviewPage.querySelectorAll("[data-review-status], [data-review-delete]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", async () => {
        const deleting = button.hasAttribute("data-review-delete");
        if (deleting && !confirm("このコメントを削除しますか？元に戻せません。")) return;
        const original = button.textContent;
        setButtonBusy(button, true);
        button.textContent = deleting ? "削除中…" : "更新中…";
        try {
          const response = await fetch(button.dataset.actionUrl || "", {
            method: deleting ? "DELETE" : "PATCH",
            headers: { "content-type": "application/json", "x-csrf-token": button.dataset.csrf || "" },
            body: deleting ? undefined : JSON.stringify({ status: button.dataset.reviewStatus })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "コメントを更新できませんでした。"));
          location.reload();
        } catch (error) {
          alert(caughtErrorMessage(error, "コメントを更新できませんでした。"));
          button.textContent = original;
          setButtonBusy(button, false);
        }
      });
    }
    const generateButton = reviewPage.querySelector("[data-review-script-generate]");
    const copyButton = reviewPage.querySelector("[data-review-script-copy]");
    const scriptOutput = reviewPage.querySelector("[data-review-script-output]");
    const scriptFeedback = reviewPage.querySelector("[data-review-script-feedback]");
    if (generateButton instanceof HTMLButtonElement && scriptOutput instanceof HTMLTextAreaElement) {
      generateButton.addEventListener("click", async () => {
        const commentIds = [...reviewPage.querySelectorAll("[data-review-script-comment]:checked")]
          .filter((item) => item instanceof HTMLInputElement)
          .map((item) => item.value);
        if (commentIds.length > 20) {
          if (scriptFeedback instanceof HTMLElement) {
            scriptFeedback.textContent = "一度に生成できるのは20件までです。チェックを減らしてください。";
            scriptFeedback.classList.add("warning");
          }
          return;
        }
        if (commentIds.length === 0) {
          if (scriptFeedback instanceof HTMLElement) {
            scriptFeedback.textContent = "未解決コメントを1件以上チェックしてください。";
            scriptFeedback.classList.add("warning");
          }
          return;
        }
        setButtonBusy(generateButton, true);
        if (scriptFeedback instanceof HTMLElement) {
          scriptFeedback.textContent = "修正依頼文を生成しています…";
          scriptFeedback.classList.remove("warning", "success");
        }
        try {
          const response = await fetch(reviewPage.dataset.scriptUrl || "", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": reviewPage.dataset.csrf || "" },
            body: JSON.stringify({ comment_ids: commentIds })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(apiErrorMessage(result, "修正依頼文を生成できませんでした。"));
          scriptOutput.value = result.instruction;
          if (scriptFeedback instanceof HTMLElement) {
            scriptFeedback.textContent = result.comment_count + "件の未解決コメントから生成しました。";
            scriptFeedback.classList.add("success");
          }
        } catch (error) {
          if (scriptFeedback instanceof HTMLElement) {
            scriptFeedback.textContent = caughtErrorMessage(error, "修正依頼文を生成できませんでした。");
            scriptFeedback.classList.add("warning");
          }
        } finally {
          setButtonBusy(generateButton, false);
        }
      });
    }
    if (copyButton instanceof HTMLButtonElement && scriptOutput instanceof HTMLTextAreaElement) {
      copyButton.addEventListener("click", async () => {
        if (scriptOutput.value.length === 0) return;
        try {
          await navigator.clipboard.writeText(scriptOutput.value);
          copyButton.textContent = "コピーしました";
          if (scriptFeedback instanceof HTMLElement) scriptFeedback.textContent = "AIクライアントの会話へ貼り付けてください。";
          setTimeout(() => { copyButton.textContent = "コピー"; }, 1800);
        } catch {
          scriptOutput.select();
          if (scriptFeedback instanceof HTMLElement) {
            scriptFeedback.textContent = "自動コピーできませんでした。選択済みの文章をコピーしてください。";
            scriptFeedback.classList.add("warning");
          }
        }
      });
    }
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

export function dashboardScriptResponse(versioned = false): Response {
  return new Response(DASHBOARD_SCRIPT, {
    headers: {
      "cache-control": versioned
        ? "public, max-age=31536000, immutable"
        : "no-cache, must-revalidate",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
