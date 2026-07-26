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
  ResearchDeck,
  ResearchSlide
} from "./types";

const EMPTY_NARRATION_SEGMENTS: NarrationSegment[] = [];

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
  const timerStartedAt = useRef(0);
  const timerBaseSeconds = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechProgressTimer = useRef<number | null>(null);
  const autoAdvanceTimer = useRef<number | null>(null);
  const playbackId = useRef(0);
  const autoAdvanceRef = useRef(false);
  const goNextRef = useRef<() => void>(() => undefined);
  const previousPosition = useRef("0:0");

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

  const goNext = useCallback(() => {
    const maxReveal = slide.revealSteps ?? 0;
    setDirection("forward");
    if (revealStep < maxReveal) {
      stopNarration();
      setRevealStep((current) => current + 1);
      return;
    }
    if (slideIndex < deck.slides.length - 1) {
      stopNarration();
      setSlideIndex((current) => current + 1);
      setRevealStep(0);
    }
  }, [deck.slides.length, revealStep, slide.revealSteps, slideIndex, stopNarration]);

  const goPrevious = useCallback(() => {
    setDirection("backward");
    if (revealStep > 0) {
      stopNarration();
      setRevealStep((current) => current - 1);
      return;
    }
    if (slideIndex > 0) {
      stopNarration();
      const previousIndex = slideIndex - 1;
      setSlideIndex(previousIndex);
      setRevealStep(deck.slides[previousIndex].revealSteps ?? 0);
    }
  }, [deck.slides, revealStep, slideIndex, stopNarration]);

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
    (id: number, duration: number) => {
      if (id !== playbackId.current) return;
      if (speechProgressTimer.current !== null) {
        window.clearInterval(speechProgressTimer.current);
        speechProgressTimer.current = null;
      }
      audio.current = null;
      setNarrationElapsed(duration);
      setNarrationDuration(duration);
      setNarrating(false);
      scheduleAutoAdvance();
    },
    [scheduleAutoAdvance]
  );

  const speakWithBrowser = useCallback(
    (text: string, id: number) => {
      if (!("speechSynthesis" in window) || id !== playbackId.current) {
        setNarrating(false);
        scheduleAutoAdvance(1000);
        return;
      }

      const estimatedDuration = Math.max(1.5, text.length * 0.16);
      const startedAt = performance.now();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.rate = 1;
      const japaneseVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.startsWith("ja"));
      if (japaneseVoice) utterance.voice = japaneseVoice;

      setNarrationDuration(estimatedDuration);
      speechProgressTimer.current = window.setInterval(() => {
        if (id !== playbackId.current) return;
        const current = Math.min(
          estimatedDuration * 0.95,
          (performance.now() - startedAt) / 1000
        );
        setNarrationElapsed(current);
      }, 100);
      utterance.onboundary = (event) => {
        if (id !== playbackId.current || !text.length) return;
        setNarrationElapsed(
          Math.min(
            estimatedDuration * 0.95,
            (event.charIndex / text.length) * estimatedDuration
          )
        );
      };
      utterance.onend = () => finishNarration(id, estimatedDuration);
      utterance.onerror = () => finishNarration(id, estimatedDuration);
      window.speechSynthesis.speak(utterance);
    },
    [finishNarration, scheduleAutoAdvance]
  );

  const playNarration = useCallback(
    (segment: NarrationSegment) => {
      stopNarration();
      const id = playbackId.current;
      setNarrating(true);

      if (!segment.audioSrc) {
        speakWithBrowser(segment.text, id);
        return;
      }

      const player = new Audio(segment.audioSrc);
      let usingFallback = false;
      const fallback = () => {
        if (usingFallback || id !== playbackId.current) return;
        usingFallback = true;
        audio.current = null;
        speakWithBrowser(segment.text, id);
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
          Number.isFinite(player.duration) ? player.duration : player.currentTime
        );
      player.onerror = fallback;
      audio.current = player;
      void player.play().catch(fallback);
    },
    [finishNarration, speakWithBrowser, stopNarration]
  );

  const toggleAutoNarration = useCallback(() => {
    if (autoNarrationEnabled) stopNarration();
    setAutoNarrationEnabled((current) => !current);
  }, [autoNarrationEnabled, stopNarration]);

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
      stopNarration();
      const safeIndex = Math.min(Math.max(index, 0), deck.slides.length - 1);
      setSlideIndex(safeIndex);
      setRevealStep(
        reveal === "end" ? deck.slides[safeIndex].revealSteps ?? 0 : 0
      );
    },
    [deck.slides, stopNarration]
  );

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
      data-narration-display={activeNarration ? narrationDisplay : "none"}
    >
      <article
        className="stage"
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
      </article>

      <header className="presentation-header">
        <div>
          <p className="header-kicker">{deck.year} · 最自由研究</p>
          <p className="header-title">{deck.shortTitle}</p>
        </div>
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
          {slideIndex === deck.slides.length - 1 && deck.narrationDefaults?.credit ? (
            <span className="voice-credit">{deck.narrationDefaults.credit}</span>
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
