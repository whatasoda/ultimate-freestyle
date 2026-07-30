"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { RevealProvider } from "./Reveal";
import type {
  NarrationDisplay,
  NarrationSegment,
  PresentationLayout,
  ResearchDeck,
  ResearchSlide
} from "./types";

const EMPTY_NARRATION_SEGMENTS: NarrationSegment[] = [];
const VOLUME_STORAGE_KEY = "ultimate-freestyle:narration-volume";
const USE_GENERATED_AUDIO =
  process.env.NEXT_PUBLIC_USE_GENERATED_AUDIO === "true";
const GENERATED_AUDIO_ROOT =
  process.env.NEXT_PUBLIC_GENERATED_AUDIO_ROOT ?? "/researches";
const LAYOUT_OPTIONS: Array<{ value: PresentationLayout; label: string }> = [
  { value: "cinematic", label: "演出" },
  { value: "biim", label: "BIIM" },
  { value: "minimal", label: "資料" }
];

function resolvePublicAssetUrl(source: string) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) return source;
  return source.startsWith("/") ? source : `/${source}`;
}

type PresentationPosition = {
  slideIndex: number;
  revealStep: number;
};

function readPositionFromUrl(slides: ResearchSlide[]): PresentationPosition {
  const params = new URL(window.location.href).searchParams;
  const requestedSlide = Number.parseInt(params.get("slide") ?? "1", 10) - 1;
  const slideIndex = Number.isFinite(requestedSlide)
    ? Math.min(Math.max(requestedSlide, 0), slides.length - 1)
    : 0;
  const requestedStep = Number.parseInt(params.get("step") ?? "0", 10);
  const revealStep = Number.isFinite(requestedStep)
    ? Math.min(Math.max(requestedStep, 0), slides[slideIndex].revealSteps ?? 0)
    : 0;
  return { slideIndex, revealStep };
}

function writePositionToUrl(
  position: PresentationPosition,
  mode: "push" | "replace"
) {
  const url = new URL(window.location.href);
  url.searchParams.set("slide", String(position.slideIndex + 1));
  url.searchParams.set("step", String(position.revealStep));
  window.history[mode === "push" ? "pushState" : "replaceState"](
    position,
    "",
    url
  );
}

function readLayoutFromUrl(fallback: PresentationLayout): PresentationLayout {
  const requested = new URL(window.location.href).searchParams.get("layout");
  return LAYOUT_OPTIONS.some((option) => option.value === requested)
    ? (requested as PresentationLayout)
    : fallback;
}

function writeLayoutToUrl(layout: PresentationLayout) {
  const url = new URL(window.location.href);
  url.searchParams.set("layout", layout);
  window.history.replaceState(window.history.state, "", url);
}

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function Icon({
  name
}: {
  name: "play" | "pause" | "reset" | "sound" | "mute" | "auto" | "screen";
}) {
  const icons = {
    play: "▶",
    pause: "Ⅱ",
    reset: "↺",
    sound: "◖))",
    mute: "×))",
    auto: "≫",
    screen: "⛶"
  };
  return <span aria-hidden="true">{icons[name]}</span>;
}

function findActiveNarration(slide: ResearchSlide, revealStep: number) {
  if (!slide.narration?.segments.length) return null;
  return (
    [...slide.narration.segments]
      .sort((left, right) => left.at - right.at)
      .filter((segment) => segment.at <= revealStep)
      .at(-1) ?? null
  );
}

function NarrationDisplayPanel({
  display,
  speaker,
  segments,
  activeSegment
}: {
  display: NarrationDisplay;
  speaker?: string;
  segments: NarrationSegment[];
  activeSegment: NarrationSegment;
}) {
  if (display === "inline") {
    return (
      <aside className="narration narration-inline" aria-label="読み上げ原稿">
        {speaker ? <p className="narration-speaker">{speaker}</p> : null}
        <div className="narration-script">
          {segments.map((segment) => (
            <p
              key={`${segment.at}-${segment.text}`}
              data-active={segment === activeSegment}
            >
              {segment.text}
            </p>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`narration narration-${display}`}
      aria-live="polite"
      aria-label="読み上げ原稿"
    >
      {speaker ? <p className="narration-speaker">{speaker}</p> : null}
      <p className="narration-current" key={`${activeSegment.at}-${activeSegment.text}`}>
        {activeSegment.text}
      </p>
      <div className="narration-steps" aria-hidden="true">
        {segments.map((segment) => (
          <i key={segment.at} data-active={segment.at === activeSegment.at} />
        ))}
      </div>
    </aside>
  );
}

export function Presentation({ deck }: { deck: ResearchDeck }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [revealStep, setRevealStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [autoNarrationEnabled, setAutoNarrationEnabled] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [narrationElapsed, setNarrationElapsed] = useState(0);
  const [narrationDuration, setNarrationDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [layout, setLayout] = useState<PresentationLayout>(
    deck.layout ?? "cinematic"
  );
  const timerStartedAt = useRef(0);
  const timerBaseSeconds = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechProgressTimer = useRef<number | null>(null);
  const autoAdvanceTimer = useRef<number | null>(null);
  const playbackId = useRef(0);
  const volumeRef = useRef(1);
  const autoAdvanceRef = useRef(false);
  const goNextRef = useRef<() => void>(() => undefined);
  const previousPosition = useRef("0:0");
  const positionRef = useRef<PresentationPosition>({
    slideIndex: 0,
    revealStep: 0
  });

  const slide = deck.slides[slideIndex];
  const narrationDisplay =
    slide.narration?.display ?? deck.narrationDefaults?.display ?? "dialogue";
  const narrationSpeaker =
    slide.narration?.speaker ?? deck.narrationDefaults?.speaker;
  const narrationSegments =
    slide.narration?.segments ?? EMPTY_NARRATION_SEGMENTS;
  const activeNarration = findActiveNarration(slide, revealStep);
  const totalDuration = useMemo(
    () => deck.slides.reduce((total, item) => total + item.durationSeconds, 0),
    [deck.slides]
  );
  const plannedBefore = useMemo(
    () =>
      deck.slides
        .slice(0, slideIndex)
        .reduce((total, item) => total + item.durationSeconds, 0),
    [deck.slides, slideIndex]
  );
  const revealFraction = slide.revealSteps
    ? revealStep / Math.max(1, slide.revealSteps)
    : 0;
  const plannedElapsed = plannedBefore + slide.durationSeconds * revealFraction;
  const totalUnits = deck.slides.reduce(
    (total, item) => total + 1 + (item.revealSteps ?? 0),
    0
  );
  const completedUnits =
    deck.slides
      .slice(0, slideIndex)
      .reduce((total, item) => total + 1 + (item.revealSteps ?? 0), 0) +
    1 +
    revealStep;
  const progress = (completedUnits / totalUnits) * 100;
  const narrationProgress = narrationDuration
    ? Math.min(100, (narrationElapsed / narrationDuration) * 100)
    : 0;
  const hasNarration = deck.slides.some(
    (item) => (item.narration?.segments.length ?? 0) > 0
  );
  const usesAudioFiles =
    USE_GENERATED_AUDIO ||
    deck.slides.some((item) =>
      item.narration?.segments.some((segment) => Boolean(segment.audioSrc))
    );
  const voiceCredit = useMemo(() => {
    const profileCredits = Array.from(
      new Set(
        deck.voicevox?.profiles.map(
          (profile) => `VOICEVOX:${profile.speakerName}`
        ) ?? []
      )
    );
    return profileCredits.length > 0
      ? profileCredits.join(" / ")
      : deck.narrationDefaults?.credit;
  }, [deck.narrationDefaults?.credit, deck.voicevox?.profiles]);

  const stopNarration = useCallback(() => {
    playbackId.current += 1;
    audio.current?.pause();
    audio.current = null;
    if (speechProgressTimer.current !== null) {
      window.clearInterval(speechProgressTimer.current);
      speechProgressTimer.current = null;
    }
    if (autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    window.speechSynthesis?.cancel();
    setNarrating(false);
    setNarrationElapsed(0);
    setNarrationDuration(0);
  }, []);

  const scheduleAutoAdvance = useCallback((delay = 450) => {
    if (!autoAdvanceRef.current) return;
    if (autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
    }
    autoAdvanceTimer.current = window.setTimeout(() => {
      autoAdvanceTimer.current = null;
      goNextRef.current();
    }, delay);
  }, []);

  const moveTo = useCallback(
    (
      nextPosition: PresentationPosition,
      nextDirection: "forward" | "backward"
    ) => {
      stopNarration();
      positionRef.current = nextPosition;
      setDirection(nextDirection);
      setSlideIndex(nextPosition.slideIndex);
      setRevealStep(nextPosition.revealStep);
      writePositionToUrl(nextPosition, "push");
    },
    [stopNarration]
  );

  const goNext = useCallback(() => {
    const maxReveal = slide.revealSteps ?? 0;
    if (revealStep < maxReveal) {
      moveTo({ slideIndex, revealStep: revealStep + 1 }, "forward");
      return;
    }
    if (slideIndex < deck.slides.length - 1) {
      moveTo({ slideIndex: slideIndex + 1, revealStep: 0 }, "forward");
    }
  }, [deck.slides.length, moveTo, revealStep, slide.revealSteps, slideIndex]);

  const goPrevious = useCallback(() => {
    if (revealStep > 0) {
      moveTo({ slideIndex, revealStep: revealStep - 1 }, "backward");
      return;
    }
    if (slideIndex > 0) {
      const previousIndex = slideIndex - 1;
      moveTo(
        {
          slideIndex: previousIndex,
          revealStep: deck.slides[previousIndex].revealSteps ?? 0
        },
        "backward"
      );
    }
  }, [deck.slides, moveTo, revealStep, slideIndex]);

  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  const startTimer = useCallback(() => {
    timerBaseSeconds.current = elapsedSeconds;
    timerStartedAt.current = Date.now();
    setTimerRunning(true);
  }, [elapsedSeconds]);

  const pauseTimer = useCallback(() => {
    setTimerRunning(false);
    timerBaseSeconds.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    timerBaseSeconds.current = 0;
    setElapsedSeconds(0);
  }, []);

  const toggleTimer = useCallback(() => {
    if (timerRunning) pauseTimer();
    else startTimer();
  }, [pauseTimer, startTimer, timerRunning]);

  const finishNarration = useCallback(
    (id: number, duration: number, pauseAfterMs = 450) => {
      if (id !== playbackId.current) return;
      if (speechProgressTimer.current !== null) {
        window.clearInterval(speechProgressTimer.current);
        speechProgressTimer.current = null;
      }
      audio.current = null;
      setNarrationElapsed(duration);
      setNarrationDuration(duration);
      setNarrating(false);
      scheduleAutoAdvance(pauseAfterMs);
    },
    [scheduleAutoAdvance]
  );

  const speakWithBrowser = useCallback(
    (segment: NarrationSegment, id: number) => {
      if (!("speechSynthesis" in window) || id !== playbackId.current) {
        setNarrating(false);
        scheduleAutoAdvance(1000);
        return;
      }

      const cues = segment.voiceCues?.length
        ? segment.voiceCues
        : [{ id: "default", text: segment.text, voiceTuning: segment.voiceTuning, pauseAfterMs: 0 }];
      const estimatedDuration = cues.reduce(
        (total, cue) => total + Math.max(1.2, cue.text.length * 0.16 / (cue.voiceTuning?.speedScale ?? segment.voiceTuning?.speedScale ?? 1)) + (cue.pauseAfterMs ?? 0) / 1000,
        0
      );
      const startedAt = performance.now();
      const japaneseVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.startsWith("ja"));

      setNarrationDuration(estimatedDuration);
      speechProgressTimer.current = window.setInterval(() => {
        if (id !== playbackId.current) return;
        const current = Math.min(
          estimatedDuration * 0.95,
          (performance.now() - startedAt) / 1000
        );
        setNarrationElapsed(current);
      }, 100);
      const playCue = (index: number) => {
        if (id !== playbackId.current) return;
        const cue = cues[index];
        if (!cue) {
          finishNarration(id, estimatedDuration, segment.pauseAfterMs ?? 450);
          return;
        }
        const tuning = { ...segment.voiceTuning, ...cue.voiceTuning };
        const utterance = new SpeechSynthesisUtterance(cue.text);
        utterance.lang = "ja-JP";
        utterance.rate = Math.min(2, Math.max(0.5, tuning.speedScale ?? 1));
        utterance.pitch = Math.min(1.5, Math.max(0.5, 1 + (tuning.pitchScale ?? 0) * 4));
        utterance.volume = Math.min(1, Math.max(0, volumeRef.current * (tuning.volumeScale ?? 1)));
        if (japaneseVoice) utterance.voice = japaneseVoice;
        utterance.onend = () => {
          const pause = Math.max(0, cue.pauseAfterMs ?? 0);
          if (pause === 0) playCue(index + 1);
          else autoAdvanceTimer.current = window.setTimeout(() => playCue(index + 1), pause);
        };
        utterance.onerror = () => finishNarration(id, estimatedDuration, segment.pauseAfterMs ?? 450);
        window.speechSynthesis.speak(utterance);
      };
      playCue(0);
    },
    [finishNarration, scheduleAutoAdvance]
  );

  const playNarration = useCallback(
    (segment: NarrationSegment) => {
      stopNarration();
      const id = playbackId.current;
      setNarrating(true);

      const startPlayback = () => {
        if (id !== playbackId.current) return;
        const generatedAudioSrc = USE_GENERATED_AUDIO
          ? `${GENERATED_AUDIO_ROOT}/${deck.slug}/audio/${slide.id}-${segment.at}.mp3`
          : undefined;
        const audioSrc = segment.audioSrc ?? generatedAudioSrc;

        if (!audioSrc) {
          speakWithBrowser(segment, id);
          return;
        }

        const player = new Audio(resolvePublicAssetUrl(audioSrc));
        player.volume = volumeRef.current;
        let usingFallback = false;
        const fallback = () => {
          if (usingFallback || id !== playbackId.current) return;
          usingFallback = true;
          audio.current = null;
          speakWithBrowser(segment, id);
        };
        player.preload = "metadata";
        player.onloadedmetadata = () => {
          if (id !== playbackId.current || !Number.isFinite(player.duration)) return;
          setNarrationDuration(player.duration);
        };
        player.ontimeupdate = () => {
          if (id !== playbackId.current) return;
          setNarrationElapsed(player.currentTime);
          if (Number.isFinite(player.duration)) setNarrationDuration(player.duration);
        };
        player.onended = () =>
          finishNarration(
            id,
            Number.isFinite(player.duration) ? player.duration : player.currentTime,
            segment.pauseAfterMs ?? 450
          );
        player.onerror = fallback;
        audio.current = player;
        void player.play().catch(fallback);
      };
      const pauseBefore = Math.max(0, segment.pauseBeforeMs ?? 0);
      if (pauseBefore > 0) autoAdvanceTimer.current = window.setTimeout(startPlayback, pauseBefore);
      else startPlayback();
    },
    [deck.slug, finishNarration, slide.id, speakWithBrowser, stopNarration]
  );

  const toggleAutoNarration = useCallback(() => {
    if (autoNarrationEnabled) stopNarration();
    setAutoNarrationEnabled((current) => !current);
  }, [autoNarrationEnabled, stopNarration]);

  const updateVolume = useCallback((nextVolume: number) => {
    const safeVolume = Math.min(Math.max(nextVolume, 0), 1);
    volumeRef.current = safeVolume;
    setVolume(safeVolume);
    if (audio.current) audio.current.volume = safeVolume;
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(safeVolume));
    } catch {
      // 保存できない環境でも、このセッション中の音量調整は続ける。
    }
  }, []);

  const updateLayout = useCallback((nextLayout: PresentationLayout) => {
    setLayout(nextLayout);
    writeLayoutToUrl(nextLayout);
  }, []);

  const toggleAutoAdvance = useCallback(() => {
    const next = !autoAdvance;
    autoAdvanceRef.current = next;
    setAutoAdvance(next);
    if (!next && autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    } else if (next && !narrating) {
      if (
        autoNarrationEnabled &&
        activeNarration?.at === revealStep &&
        narrationProgress < 99
      ) {
        playNarration(activeNarration);
      } else {
        scheduleAutoAdvance(900);
      }
    }
  }, [
    activeNarration,
    autoAdvance,
    autoNarrationEnabled,
    narrating,
    narrationProgress,
    playNarration,
    revealStep,
    scheduleAutoAdvance
  ]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  const jumpTo = useCallback(
    (index: number, reveal: "start" | "end" = "start") => {
      const safeIndex = Math.min(Math.max(index, 0), deck.slides.length - 1);
      const nextReveal =
        reveal === "end" ? deck.slides[safeIndex].revealSteps ?? 0 : 0;
      const currentUnit = slideIndex * 1000 + revealStep;
      const nextUnit = safeIndex * 1000 + nextReveal;
      moveTo(
        { slideIndex: safeIndex, revealStep: nextReveal },
        nextUnit >= currentUnit ? "forward" : "backward"
      );
    },
    [deck.slides, moveTo, revealStep, slideIndex]
  );

  useEffect(() => {
    let savedVolume: string | null = null;
    try {
      savedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    } catch {
      // localStorageを利用できない場合は既定値の100%を使う。
    }
    const parsedVolume = savedVolume === null ? 1 : Number(savedVolume);
    if (!Number.isFinite(parsedVolume)) return;
    const restoreVolume = window.setTimeout(
      () => updateVolume(parsedVolume),
      0
    );
    return () => window.clearTimeout(restoreVolume);
  }, [updateVolume]);

  useEffect(() => {
    const initialPosition = readPositionFromUrl(deck.slides);
    const initialLayout = readLayoutFromUrl(deck.layout ?? "cinematic");
    writePositionToUrl(initialPosition, "replace");
    writeLayoutToUrl(initialLayout);

    const restoreInitialPosition = window.setTimeout(() => {
      positionRef.current = initialPosition;
      previousPosition.current = `${initialPosition.slideIndex}:${initialPosition.revealStep}`;
      setSlideIndex(initialPosition.slideIndex);
      setRevealStep(initialPosition.revealStep);
      setLayout(initialLayout);
    }, 0);

    const restoreFromHistory = () => {
      const nextPosition = readPositionFromUrl(deck.slides);
      const nextLayout = readLayoutFromUrl(deck.layout ?? "cinematic");
      const current = positionRef.current;
      const currentUnit = current.slideIndex * 1000 + current.revealStep;
      const nextUnit = nextPosition.slideIndex * 1000 + nextPosition.revealStep;
      stopNarration();
      positionRef.current = nextPosition;
      setDirection(nextUnit >= currentUnit ? "forward" : "backward");
      setSlideIndex(nextPosition.slideIndex);
      setRevealStep(nextPosition.revealStep);
      setLayout(nextLayout);
    };

    window.addEventListener("popstate", restoreFromHistory);
    return () => {
      window.clearTimeout(restoreInitialPosition);
      window.removeEventListener("popstate", restoreFromHistory);
    };
  }, [deck.layout, deck.slides, stopNarration]);

  useEffect(() => {
    if (!timerRunning) return;
    const update = () => {
      const current =
        timerBaseSeconds.current + (Date.now() - timerStartedAt.current) / 1000;
      setElapsedSeconds(current);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    const position = `${slideIndex}:${revealStep}`;
    if (previousPosition.current === position) return;
    previousPosition.current = position;

    const startPlayback = window.setTimeout(() => {
      const nextNarration = narrationSegments.find(
        (segment) => segment.at === revealStep
      );
      if (autoNarrationEnabled && nextNarration) {
        playNarration(nextNarration);
      } else {
        scheduleAutoAdvance(1200);
      }
    }, 0);

    return () => window.clearTimeout(startPlayback);
  }, [
    autoNarrationEnabled,
    narrationSegments,
    playNarration,
    revealStep,
    scheduleAutoAdvance,
    slideIndex
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      ) return;
      if (["ArrowRight", " ", "Enter", "PageDown"].includes(event.key)) {
        event.preventDefault();
        goNext();
      } else if (["ArrowLeft", "Backspace", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "Home") {
        event.preventDefault();
        jumpTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        jumpTo(deck.slides.length - 1, "end");
      } else if (event.key.toLowerCase() === "t") {
        toggleTimer();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (event.key.toLowerCase() === "a") {
        toggleAutoAdvance();
      } else if (event.key.toLowerCase() === "m") {
        toggleAutoNarration();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    deck.slides.length,
    goNext,
    goPrevious,
    jumpTo,
    toggleAutoAdvance,
    toggleAutoNarration,
    toggleFullscreen,
    toggleTimer
  ]);

  useEffect(() => stopNarration, [stopNarration]);

  const handleStageClick = (event: MouseEvent<HTMLElement>) => {
    if (event.button === 0) goNext();
  };

  const delta = elapsedSeconds - plannedElapsed;

  return (
    <main
      className="presentation"
      style={{ "--accent": deck.accent } as React.CSSProperties}
      data-tone={slide.tone ?? "dark"}
      data-layout={layout}
      data-narration-display={activeNarration ? narrationDisplay : "none"}
    >
      <article
        className="stage"
        data-layout={layout}
        onClick={handleStageClick}
        aria-label={`${deck.title}：${slide.title}`}
      >
        <div
          className="slide"
          key={slide.id}
          data-direction={direction}
          data-tone={slide.tone ?? "dark"}
        >
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <RevealProvider step={revealStep}>{slide.content}</RevealProvider>
          {activeNarration ? (
            <NarrationDisplayPanel
              display={narrationDisplay}
              speaker={narrationSpeaker}
              segments={narrationSegments}
              activeSegment={activeNarration}
            />
          ) : null}
          <p className="slide-watermark" aria-hidden="true">
            {String(slideIndex + 1).padStart(2, "0")}
          </p>
        </div>
        <aside className="biim-sidebar" aria-label="補足情報">
          {slide.sidebar ?? (
            <>
              <p>RESEARCH MEMO</p>
              <strong>{slide.title}</strong>
              <dl>
                <div><dt>SLIDE</dt><dd>{slideIndex + 1} / {deck.slides.length}</dd></div>
                <div><dt>STEP</dt><dd>{revealStep} / {slide.revealSteps ?? 0}</dd></div>
                <div><dt>PACE</dt><dd>{formatTime(plannedElapsed)}</dd></div>
              </dl>
              <small>{deck.shortTitle}</small>
            </>
          )}
        </aside>
      </article>

      <header className="presentation-header">
        <div>
          <p className="header-kicker">{deck.year} · 最自由研究</p>
          <p className="header-title">{deck.shortTitle}</p>
        </div>
        <div className="presentation-tools">
          <label className="layout-control">
            <span>STYLE</span>
            <select
              value={layout}
              onChange={(event) =>
                updateLayout(event.currentTarget.value as PresentationLayout)
              }
              aria-label="発表レイアウト"
            >
              {LAYOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="time-panel" data-behind={delta > 30}>
          <div>
            <span>予定</span>
            <strong>{formatTime(plannedElapsed)}</strong>
            <small>/ {formatTime(totalDuration)}</small>
          </div>
          <div>
            <span>実績</span>
            <strong>{formatTime(elapsedSeconds)}</strong>
            {elapsedSeconds > 0 ? (
              <small>{delta >= 0 ? "+" : "−"}{formatTime(Math.abs(delta))}</small>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleTimer();
            }}
            aria-label={timerRunning ? "タイマーを一時停止" : "タイマーを開始"}
            title="タイマー開始・停止 (T)"
          >
            <Icon name={timerRunning ? "pause" : "play"} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              resetTimer();
            }}
            aria-label="タイマーをリセット"
            title="タイマーをリセット"
          >
            <Icon name="reset" />
          </button>
          </div>
        </div>
      </header>

      <footer className="presentation-footer">
        <div className="progress-copy">
          <strong>{Math.round(progress)}%</strong>
          <span>{slideIndex + 1} / {deck.slides.length}</span>
          <span>{slide.title}</span>
        </div>
        <div className="progress-track" aria-label={`発表進捗 ${Math.round(progress)}%`}>
          <div style={{ width: `${progress}%` }} />
        </div>
        {activeNarration ? (
          <div className="narration-playback" data-active={narrating}>
            <span>VOICE</span>
            <div
              className="narration-progress-track"
              role="progressbar"
              aria-label="読み上げ進捗"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(narrationProgress)}
            >
              <div style={{ width: `${narrationProgress}%` }} />
            </div>
            <time>
              {formatTime(narrationElapsed)} / {narrationDuration ? formatTime(narrationDuration) : "--:--"}
            </time>
          </div>
        ) : null}
        <div className="footer-actions">
          {slideIndex === deck.slides.length - 1 &&
          usesAudioFiles &&
          voiceCredit ? (
            <span className="voice-credit">{voiceCredit}</span>
          ) : null}
          {hasNarration ? (
            <label className="volume-control" title="読み上げ音量">
              <span aria-hidden="true">VOL</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(event) => updateVolume(event.currentTarget.valueAsNumber)}
                aria-label="読み上げ音量"
                style={{ "--volume": `${volume * 100}%` } as React.CSSProperties}
              />
              <output>{Math.round(volume * 100)}</output>
            </label>
          ) : null}
          {hasNarration ? (
            <button
              type="button"
              data-active={autoNarrationEnabled}
              onClick={(event) => {
                event.stopPropagation();
                toggleAutoNarration();
              }}
              aria-label={autoNarrationEnabled ? "自動読み上げをオフ" : "自動読み上げをオン"}
              aria-pressed={autoNarrationEnabled}
              title="自動読み上げ ON/OFF (M)"
            >
              <Icon name={autoNarrationEnabled ? "sound" : "mute"} />
            </button>
          ) : null}
          <button
            type="button"
            data-active={autoAdvance}
            onClick={(event) => {
              event.stopPropagation();
              toggleAutoAdvance();
            }}
            aria-label={autoAdvance ? "自動送りをオフ" : "自動送りをオン"}
            aria-pressed={autoAdvance}
            title="自動送り ON/OFF (A)"
          >
            <Icon name="auto" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFullscreen();
            }}
            aria-label="全画面表示を切り替え"
            title="全画面表示 (F)"
          >
            <Icon name="screen" />
          </button>
          <span className="key-hint">← / → ・ Space</span>
        </div>
      </footer>
    </main>
  );
}
