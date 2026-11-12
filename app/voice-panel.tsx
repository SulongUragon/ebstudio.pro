"use client";

import { ChevronDown, LoaderCircle, Mic2, Save, Sparkles } from "lucide-react";
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
 * Optional panel on the Create form. The voice is stored on the book's brief,
 * so every chapter, rewrite, and blurb for that book is written in it.
 */
export default function VoicePanel({
  voice,
  onChange,
  disabled,
  provider,
}: {
  voice: BookVoice | undefined;
  onChange: (voice: BookVoice | undefined) => void;
  disabled: boolean;
  provider: string;
}) {
  const [open, setOpen] = useState(hasVoice(voice));
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const current: BookVoice = voice ?? {};
  const sampleWords = countVoiceWords(current.sample ?? "");

  const update = (patch: Partial<BookVoice>) => {
    const next = { ...current, ...patch };
    onChange(hasVoice(next) ? next : undefined);
    setMessage("");
  };

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
          if (!open && !hasVoice(voice) && !disabled) {
            const saved = loadDefaultVoice();
            if (saved) {
              onChange(saved);
              setMessage("Loaded your default voice. Edit it for this book if you like.");
            }
          }
          setOpen(!open);
        }}
      >
        <Mic2 size={16} />
        <span>
          <strong>Your writing voice</strong>
          <small>{hasVoice(voice) ? "Locked for this book" : "Optional. Make every chapter sound like you."}</small>
        </span>
        <ChevronDown size={16} className="voice-panel-chevron" />
      </button>

      {open ? (
        <div className="voice-panel-body">
          <label htmlFor="voice-sample">
            Sample of your writing
            <span className={sampleWords && (sampleWords < VOICE_SAMPLE_MIN_WORDS || sampleWords > VOICE_SAMPLE_MAX_WORDS) ? "warn" : ""}>
              {sampleWords} words, {VOICE_SAMPLE_MIN_WORDS} to {VOICE_SAMPLE_MAX_WORDS}
            </span>
          </label>
          <textarea
            id="voice-sample"
            rows={6}
            value={current.sample ?? ""}
            disabled={disabled || analyzing}
            placeholder="Paste a few pages you wrote yourself: a post, an essay, a chapter. EB learns the style, never the content."
            onChange={(event) => update({ sample: event.target.value })}
          />

          <label htmlFor="voice-notes">How you want it to sound</label>
          <input
            id="voice-notes"
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
            <button type="button" onClick={saveDefault} disabled={disabled || !hasVoice(voice)}>
              <Save size={15} />
              Save as my default voice
            </button>
          </div>

          {current.profile !== undefined && current.profile !== "" ? (
            <>
              <label htmlFor="voice-profile">Style profile</label>
              <textarea
                id="voice-profile"
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
