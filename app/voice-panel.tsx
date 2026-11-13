"use client";

import { ChevronDown, Lock, LoaderCircle, Mic2, Save, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BookVoice } from "./book-types";
import {
  countVoiceWords,
  DEFAULT_VOICE_STORAGE_KEY,
  hasVoice,
  validateVoiceSample,
  VOICE_NOTES_MAX_CHARACTERS,
  VOICE_PROFILE_MAX_CHARACTERS,
  VOICE_SAMPLE_MAX_WORDS,
  VOICE_SAMPLE_MIN_WORDS,
} from "./voice-style";

export function loadDefaultVoice(): BookVoice | undefined {
  try {
    const saved = window.localStorage.getItem(DEFAULT_VOICE_STORAGE_KEY);
    const voice = saved ? (JSON.parse(saved) as BookVoice) : undefined;
    return hasVoice(voice) ? voice : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Optional voice panel. On the Create form ("create" mode) every edit goes
 * straight into the brief. On a finished book ("book" mode) edits stay in a
 * draft until "Lock voice for this book", so typing never saves on every key.
 * The voice lives on the book's brief, so chapters, rewrites, and blurbs use it.
 */
export default function VoicePanel({
  voice,
  onChange,
  disabled,
  provider,
  mode = "create",
}: {
  voice: BookVoice | undefined;
  onChange: (voice: BookVoice | undefined) => void;
  disabled: boolean;
  provider: string;
  mode?: "create" | "book";
}) {
  const bookMode = mode === "book";
  const idPrefix = bookMode ? "book-voice" : "voice";
  const [open, setOpen] = useState(!bookMode && hasVoice(voice));
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<BookVoice | undefined>(voice);
  const working = bookMode ? draft : voice;
  const current: BookVoice = working ?? {};
  const sampleWords = countVoiceWords(current.sample ?? "");
  const unsaved = bookMode && JSON.stringify(draft ?? {}) !== JSON.stringify(voice ?? {});

  const setWorking = (next: BookVoice | undefined) => {
    if (bookMode) setDraft(next);
    else onChange(next);
  };

  const update = (patch: Partial<BookVoice>) => {
    const next = { ...current, ...patch };
    setWorking(hasVoice(next) ? next : undefined);
    setMessage("");
  };

  function lockForBook() {
    onChange(hasVoice(draft) ? draft : undefined);
    setError("");
    setMessage("Voice locked for this book. Your next rewrite, expand, tighten, and blurb will use it.");
  }

  function removeFromBook() {
    setDraft(undefined);
    onChange(undefined);
    setError("");
    setMessage("Voice removed from this book.");
  }

  async function analyze() {
    const problem = validateVoiceSample(current.sample);
    if (problem) {
      setError(problem);
      return;
    }
    setAnalyzing(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "voice_profile", voice: { sample: current.sample, notes: current.notes }, provider }),
      });
      const data = (await response.json().catch(() => ({}))) as { profile?: string; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error ?? "EB could not describe this voice. Try again.");
      update({ profile: data.profile });
      setMessage("Voice profile ready. Edit it if anything feels off.");
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "EB could not describe this voice. Try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function saveDefault() {
    try {
      window.localStorage.setItem(DEFAULT_VOICE_STORAGE_KEY, JSON.stringify(current));
      setMessage("Saved as your default voice on this device. New books start with it.");
    } catch {
      setError("This browser could not save the default voice.");
    }
  }

  return (
    <section className={`voice-panel${open ? " open" : ""}`} aria-label="Your writing voice">
      <button
        type="button"
        className="voice-panel-toggle"
        aria-expanded={open}
        onClick={() => {
          // Opening the panel on a new book brings in the saved default voice.
          if (!open && !hasVoice(working) && !disabled) {
            const saved = loadDefaultVoice();
            if (saved) {
              setWorking(saved);
              setMessage(bookMode ? "Loaded your default voice. Lock it to use it on this book." : "Loaded your default voice. Edit it for this book if you like.");
            }
          }
          setOpen(!open);
        }}
      >
        <Mic2 size={16} />
        <span>
          <strong>Your writing voice</strong>
          <small>
            {unsaved
              ? "Changes not locked yet"
              : hasVoice(voice)
                ? "Locked for this book"
                : bookMode
                  ? "Optional. Make your next rewrites sound like you."
                  : "Optional. Make every chapter sound like you."}
          </small>
        </span>
        <ChevronDown size={16} className="voice-panel-chevron" />
      </button>

      {open ? (
        <div className="voice-panel-body">
          <label htmlFor={`${idPrefix}-sample`}>
            Sample of your writing
            <span className={sampleWords && (sampleWords < VOICE_SAMPLE_MIN_WORDS || sampleWords > VOICE_SAMPLE_MAX_WORDS) ? "warn" : ""}>
              {sampleWords} words, {VOICE_SAMPLE_MIN_WORDS} to {VOICE_SAMPLE_MAX_WORDS}
            </span>
          </label>
          <textarea
            id={`${idPrefix}-sample`}
            rows={6}
            value={current.sample ?? ""}
            disabled={disabled || analyzing}
            placeholder="Paste a few pages you wrote yourself: a post, an essay, a chapter. EB learns the style, never the content."
            onChange={(event) => update({ sample: event.target.value })}
          />

          <label htmlFor={`${idPrefix}-notes`}>How you want it to sound</label>
          <input
            id={`${idPrefix}-notes`}
            value={current.notes ?? ""}
            maxLength={VOICE_NOTES_MAX_CHARACTERS}
            disabled={disabled}
            placeholder="e.g. short sentences, warm and direct, no jargon"
            onChange={(event) => update({ notes: event.target.value })}
          />

          <div className="voice-panel-actions">
            <button type="button" onClick={analyze} disabled={disabled || analyzing || !current.sample?.trim()}>
              {analyzing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
              {analyzing ? "Analyzing" : current.profile ? "Analyze again" : "Analyze my voice"}
            </button>
            {bookMode ? (
              <button type="button" onClick={lockForBook} disabled={disabled || analyzing || !unsaved || !hasVoice(draft)}>
                <Lock size={15} />
                Lock voice for this book
              </button>
            ) : null}
            <button type="button" onClick={saveDefault} disabled={disabled || !hasVoice(working)}>
              <Save size={15} />
              Save as my default voice
            </button>
            {bookMode && hasVoice(voice) ? (
              <button type="button" onClick={removeFromBook} disabled={disabled || analyzing}>
                <Trash2 size={15} />
                Remove voice
              </button>
            ) : null}
          </div>

          {current.profile !== undefined && current.profile !== "" ? (
            <>
              <label htmlFor={`${idPrefix}-profile`}>Style profile</label>
              <textarea
                id={`${idPrefix}-profile`}
                rows={7}
                value={current.profile}
                maxLength={VOICE_PROFILE_MAX_CHARACTERS}
                disabled={disabled}
                onChange={(event) => update({ profile: event.target.value })}
              />
            </>
          ) : null}

          {error ? <p className="voice-panel-error" role="alert">{error}</p> : null}
          {message ? <p className="voice-panel-message" role="status">{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
