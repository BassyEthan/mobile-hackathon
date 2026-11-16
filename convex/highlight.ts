/**
 * Picking the best few seconds of a fold. A clip is ten seconds at most, so the Feast plays a 3 to 5 second bite of
 * each one, cut together into a montage. The Chef picks the bite from a timestamped transcript; these helpers keep the
 * pick honest and stand in when there is no model or no speech.
 */

export type Word = { word: string; start: number; end: number };
export type Window = { start: number; end: number; line?: string };

export const MIN_BITE = 3;
export const MAX_BITE = 5;
const TARGET_BITE = 4;

// Words that usually mean something happened: a laugh, a shout, a reveal.
const SPARK = /\b(ha(ha)+|lol|oh no|oh my|wow|whoa|look|wait|what|yes|no way|surprise|ta-?da)\b|[!?]/i;

/** Clamp any proposed window to 3 to 5 seconds inside the clip. Short clips play whole. */
export function clampWindow(start: number, end: number, duration: number | null): Window {
  const total = duration && duration > 0 ? duration : null;
  if (total !== null && total <= MAX_BITE) return { start: 0, end: total };
  let s = Math.max(0, Number.isFinite(start) ? start : 0);
  let e = Number.isFinite(end) ? end : s + TARGET_BITE;
  if (e - s < MIN_BITE) e = s + MIN_BITE;
  if (e - s > MAX_BITE) e = s + MAX_BITE;
  if (total !== null && e > total) {
    s = Math.max(0, s - (e - total));
    e = total;
  }
  return { start: round(s), end: round(e) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** The densest, liveliest stretch of speech. Silent clips start a third of the way in, past the "is it recording?" bit. */
export function heuristicWindow(words: Word[], duration: number | null): Window {
  if (duration && duration <= MAX_BITE) return { start: 0, end: duration };
  if (words.length === 0) {
    const total = duration ?? 8;
    const start = Math.min(total * 0.3, Math.max(0, total - TARGET_BITE));
    return clampWindow(start, start + TARGET_BITE, duration);
  }
  const last = duration ?? words[words.length - 1].end;
  let best = { score: -Infinity, start: 0 };
  for (let start = 0; start + MIN_BITE <= last + 0.01; start += 0.25) {
    const inside = words.filter((w) => w.start >= start && w.end <= start + TARGET_BITE);
    const score =
      inside.length +
      inside.filter((w) => SPARK.test(w.word)).length * 3 +
      // The first second is usually "hi, um" — lean slightly past it.
      (start >= 0.75 ? 0.5 : 0);
    if (score > best.score) best = { score, start };
  }
  const window = clampWindow(best.start, best.start + TARGET_BITE, duration);
  return { ...window, line: lineFor(words, window) };
}

/** The words spoken inside a window, for the montage's lower third. */
export function lineFor(words: Word[], window: Window) {
  const text = words
    .filter((w) => w.end > window.start && w.start < window.end)
    .map((w) => w.word.trim())
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  return text ? text.slice(0, 120) : undefined;
}

/**
 * iPhones record QuickTime (.mov). Whisper refuses the QuickTime header, but the file is otherwise an ISO media file,
 * so relabelling the "qt  " brand as "isom" lets it read the audio. Other files pass through untouched.
 */
export function quickTimeAsMp4(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer);
  const text = (from: number) => String.fromCharCode(bytes[from], bytes[from + 1], bytes[from + 2], bytes[from + 3]);
  if (bytes.length < 16 || text(4) !== "ftyp" || text(8) !== "qt  ") return bytes;
  const size = Math.min(bytes.length, ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  const isom = [0x69, 0x73, 0x6f, 0x6d];
  bytes.set(isom, 8);
  for (let i = 16; i + 4 <= size; i += 4) if (text(i) === "qt  ") bytes.set(isom, i);
  return bytes;
}
