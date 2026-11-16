export type BubbleLine = { speaker: string; text: string };

/** Lines that actually have something to say, at most three per panel. */
export function spokenLines(dialogue: BubbleLine[]) {
  return dialogue.filter((line) => line.text.trim()).slice(0, 3);
}

function speakerKey(line: BubbleLine) {
  return line.speaker.trim().toLowerCase();
}

/**
 * A name tag is only useful when more than one character speaks in the panel.
 * With a single speaker the art already shows who is talking.
 */
export function bubbleSpeakerLabel(dialogue: BubbleLine[], index: number) {
  const lines = spokenLines(dialogue);
  const speakers = new Set(lines.map(speakerKey).filter(Boolean));
  return speakers.size > 1 ? (lines[index]?.speaker.trim() ?? "") : "";
}

/**
 * The first speaker's bubbles sit on the left and the next speaker's on the
 * right, so a back-and-forth reads in order instead of stacking in one corner.
 */
export function bubbleSide(dialogue: BubbleLine[], index: number): "left" | "right" {
  const lines = spokenLines(dialogue);
  const order: string[] = [];
  for (const line of lines) {
    const key = speakerKey(line);
    if (!order.includes(key)) order.push(key);
  }
  const position = order.indexOf(speakerKey(lines[index] ?? { speaker: "", text: "" }));
  return position % 2 === 1 ? "right" : "left";
}
