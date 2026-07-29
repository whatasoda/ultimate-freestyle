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
    const previewButton = document.querySelector("[data-create-preview]");
    if (previewButton instanceof HTMLButtonElement) previewButton.dataset.version = value;
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
      enter_animation: String(data.get("enter_animation") || "") || null,
      role: String(data.get("role") || "content"),
      cover_layout: String(data.get("cover_layout") || "center")
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
          method: form.dataset.method || "PATCH",
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
        if (form.matches("[data-template-create]")) {
          location.reload();
          return;
        }
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
          : "このSTEPの文字は" + (slideFrame.dataset.aspectRatio || "16:9") + "の枠内に収まっています。";
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
      if (qualitySummary instanceof HTMLElement) {
        const baseCount = Number(qualitySummary.dataset.baseCount || 0);
        const total = baseCount + overflows.length;
        qualitySummary.dataset.level = total ? "warning" : "ok";
        qualitySummary.textContent = overflows.length
          ? total + "件の確認事項があります（うち見切れ" + overflows.length + "件）。"
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

  const voicePage = document.querySelector("[data-voice-page]");
  if (voicePage instanceof HTMLElement) {
    const csrf = voicePage.dataset.csrf || "";
    const setupButton = voicePage.querySelector("[data-voice-setup]");
    const setupFeedback = voicePage.querySelector("[data-voice-setup-feedback]");
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
        generateButton.disabled = !terminalStatuses.has(status);
        generateButton.textContent = terminalStatuses.has(status) && status !== "completed"
          ? "失敗した区間をもう一度生成"
          : status === "completed"
            ? "生成完了"
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
        if (!response.ok) throw new Error(result.error?.message || "生成状況を取得できませんでした。");
        const job = result.job || result;
        pollFailures = 0;
        updateJob(job);
        if (terminalStatuses.has(job.status)) {
          if (job.status === "completed") setTimeout(() => location.reload(), 800);
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
      setupButton.addEventListener("click", async () => {
        setupButton.disabled = true;
        if (setupFeedback instanceof HTMLElement) setupFeedback.textContent = "ずんだもん・ノーマルを設定しています…";
        try {
          const response = await fetch(setupButton.dataset.voiceSetup || "", {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": csrf },
            body: JSON.stringify({ expected_version: Number(voicePage.dataset.version) })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error?.message || "声を設定できませんでした。");
          if (setupFeedback instanceof HTMLElement) {
            setupFeedback.textContent = "設定しました。音声の状態を更新します…";
            setupFeedback.classList.add("success");
          }
          setTimeout(() => location.reload(), 500);
        } catch (error) {
          setupButton.disabled = false;
          if (setupFeedback instanceof HTMLElement) {
            setupFeedback.textContent = error instanceof Error ? error.message : "声を設定できませんでした。";
            setupFeedback.classList.add("warning");
          }
        }
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
          if (!response.ok) throw new Error(result.error?.message || "音声生成を開始できませんでした。");
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
            generateFeedback.textContent = error instanceof Error ? error.message : "音声生成を開始できませんでした。";
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
    const stopPreview = () => {
      if (activePlayer) { activePlayer.pause(); activePlayer.removeAttribute("src"); activePlayer.load(); activePlayer = null; }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      if (activePreviewButton instanceof HTMLButtonElement) {
        activePreviewButton.setAttribute("aria-pressed", "false");
        activePreviewButton.textContent = activePreviewButton.dataset.audioUrl ? "生成音声を試聴" : "ブラウザ音声で仮試聴";
      }
      activePreviewButton = null;
    };
    for (const button of voicePage.querySelectorAll("[data-voice-preview]")) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.addEventListener("click", () => {
        if (activePreviewButton === button) { stopPreview(); return; }
        stopPreview();
        activePreviewButton = button;
        button.setAttribute("aria-pressed", "true");
        button.textContent = "停止";
        const audioUrl = safeStatusUrl(button.dataset.audioUrl || "");
        if (audioUrl !== null && button.dataset.audioUrl) {
          const player = new Audio(audioUrl);
          activePlayer = player;
          player.addEventListener("ended", stopPreview, { once: true });
          player.addEventListener("error", stopPreview, { once: true });
          player.play().catch(stopPreview);
          return;
        }
        if (!("speechSynthesis" in window)) { stopPreview(); return; }
        const utterance = new SpeechSynthesisUtterance(button.dataset.voiceText || "");
        utterance.lang = "ja-JP";
        utterance.onend = stopPreview;
        utterance.onerror = stopPreview;
        speechSynthesis.speak(utterance);
      });
    }
    addEventListener("pagehide", stopPreview, { once: true });
  }

  const previewButton = document.querySelector("[data-create-preview]");
  const publishButton = document.querySelector("[data-publish-preview]");
  const publishFeedback = document.querySelector("[data-publish-feedback]");
  const previewStatus = document.querySelector("[data-preview-status]");
  const publishedStatus = document.querySelector("[data-published-status]");
  const previewLink = document.querySelector("[data-preview-link]");
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
        if (publishedStatus instanceof HTMLElement && result.publication?.published) {
          publishedStatus.textContent = "v" + result.publication.published.project_version + " · " + result.publication.published.renderer_version;
        }
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
      "cache-control": "no-cache, must-revalidate",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
