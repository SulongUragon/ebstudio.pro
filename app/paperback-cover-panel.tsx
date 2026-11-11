"use client";

import { BookOpen, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Manuscript } from "./book-types";
import { BLURB_MAX_WORDS, BLURB_MIN_WORDS, countBlurbWords } from "./back-cover-copy";
import {
  defaultPaperType,
  getPaperbackCoverReadiness,
  type PaperType,
} from "./paperback-cover";

type BackCover = NonNullable<Manuscript["backCover"]>;

export default function PaperbackCoverPanel({
  manuscript,
  busy,
  exporting,
  drafting,
  onSave,
  onDraft,
  onExport,
}: {
  manuscript: Manuscript;
  busy: boolean;
  exporting: boolean;
  drafting: boolean;
  onSave: (patch: Partial<BackCover>) => void;
  onDraft: () => void;
  onExport: () => void;
}) {
  const saved = manuscript.backCover;
  const [blurb, setBlurb] = useState(saved?.blurb ?? "");
  const paper: PaperType = saved?.paper ?? defaultPaperType(manuscript.mode);
  // Judge readiness on the blurb as typed; it is saved when the box loses focus,
  // which happens before the export button's click.
  const readiness = getPaperbackCoverReadiness({ ...manuscript, backCover: { ...saved, blurb } });
  const words = countBlurbWords(blurb);

  // A drafted blurb arrives through the saved manuscript; adopt it when it changes.
  const [lastSaved, setLastSaved] = useState(saved?.blurb ?? "");
  if ((saved?.blurb ?? "") !== lastSaved) {
    setLastSaved(saved?.blurb ?? "");
    setBlurb(saved?.blurb ?? "");
  }

  const commitBlurb = () => {
    if (blurb !== (saved?.blurb ?? "")) onSave({ blurb });
  };

  return (
    <section className="paperback-cover-panel" aria-label="Paperback cover">
      <div className="paperback-cover-head">
        <div>
          <strong>Paperback cover</strong>
          <span>
            Full wrap for KDP: back, spine, and front in one PDF, with the front re-rendered at 300 DPI.
          </span>
        </div>
        <button onClick={onExport} disabled={busy || !readiness.ready} title={readiness.errors[0] ?? "Download the full-wrap cover PDF"}>
          {exporting ? <LoaderCircle className="spin" size={16} /> : <BookOpen size={16} />}
          {exporting ? "Building cover" : "Paperback Cover"}
        </button>
      </div>

      <label htmlFor="back-cover-blurb">
        Back cover blurb
        <span className={words && (words < BLURB_MIN_WORDS || words > BLURB_MAX_WORDS) ? "warn" : ""}>
          {words} words, aim for 120 to 170
        </span>
      </label>
      <textarea
        id="back-cover-blurb"
        value={blurb}
        rows={6}
        disabled={busy || drafting}
        placeholder="The copy readers see on the back of the paperback. Draft it with AI, then make it yours."
        onChange={(event) => setBlurb(event.target.value)}
        onBlur={commitBlurb}
      />

      <div className="paperback-cover-controls">
        <button onClick={onDraft} disabled={busy || drafting}>
          {drafting ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
          {drafting ? "Drafting" : blurb.trim() ? "Redraft with AI" : "Draft with AI"}
        </button>

        <label className="inline">
          Paper
          <select
            value={paper}
            disabled={busy}
            onChange={(event) => onSave({ paper: event.target.value as PaperType })}
          >
            <option value="cream">Cream</option>
            <option value="white">White</option>
          </select>
        </label>

        <label className="inline">
          Back color
          <input
            type="color"
            value={saved?.color ?? "#1d1d1b"}
            disabled={busy}
            onChange={(event) => onSave({ color: event.target.value })}
          />
        </label>
        {saved?.color ? (
          <button className="link" onClick={() => onSave({ color: undefined })} disabled={busy}>
            Match my cover
          </button>
        ) : (
          <span className="hint">Matches your cover automatically</span>
        )}
      </div>

      {!readiness.ready ? <p className="paperback-cover-status">{readiness.errors[0]}</p> : null}
      <p className="paperback-cover-note">
        In KDP, choose the same trim size and {paper} paper. The spine is sized from the paperback
        interior&apos;s page count, so export both from this version of the book.
      </p>
    </section>
  );
}
