// Shared intent/DoD substance check — used by BOTH scripts/intent-lock.mjs (write time) AND
// scripts/validate-state.mjs (the binding), so the writer and the validator enforce the SAME bar. (Codex
// GATE-2 C1/C2: the validator only checked isStub while the writer checked length+words, so a hand-edited
// token-soup intent — "aaa bbb ccc" — passed at implement. One helper closes that gap.)
//
// Deterministic can't fully judge meaning; this is "minimum real shape", not semantic understanding. It
// rejects: empties, stubs (TODO/TBD/…), one-liners, too-few-words, and placeholder token soup (words with no
// vowel+consonant mix, or single-character repeats like "aaa"/"bbb"). A genuine human sentence passes; a
// keyboard-mash placeholder does not.
import { isStub } from './proof.mjs';

const HAS_LETTER = /\p{L}/u;       // any Unicode letter — language-neutral (한글, кириллица, 日本語, …)
const LATIN_LETTER = /[a-z]/i;     // Latin script only
const VOWEL = /[aeiou]/i;
const CONSONANT = /[bcdfghjklmnpqrstvwxyz]/i;
const REPEAT = /^(.)\1+$/u;        // a single character repeated: "aaa", "bbb", "----", "ㅋㅋㅋ"

// A "plausible word" has real letters and isn't a single-char repeat. For LATIN-script tokens we ADDITIONALLY
// require a vowel+consonant mix (rejects "aaa"/"bbb"/"xxx"/"qq" placeholders). Non-Latin scripts (Korean,
// Japanese, Cyrillic, …) have no a/e/i/o/u notion, so for them "has letters + not a single-char repeat" is the
// bar — otherwise the Latin-only rule false-rejects legitimate non-English intent (Codex GATE-2: a real Korean
// sentence scored 0 plausible words and was treated as token soup). NB is portable/low-floor, not English-only.
function plausibleWord(w) {
  if (REPEAT.test(w)) return false;          // placeholder repeats in any script
  if (!HAS_LETTER.test(w)) return false;     // "123", "----": no letters at all
  if (LATIN_LETTER.test(w)) return VOWEL.test(w) && CONSONANT.test(w);
  return true;                               // non-Latin real letters → plausible
}

// Returns { ok, reason }. Tune via opts; defaults suit a one-line intent / definition-of-done.
//
// A language-neutral run guard runs FIRST ("aaabbbccc" / "aaa bbb ccc" / "ххх ууу" fail in any script). Then
// the text takes ONE of two paths:
//   - SPACE-FREE-SCRIPT path (Codex GATE-3): a real Japanese/Chinese/Thai sentence is one token with MANY
//     non-Latin letters. Allowed ONLY when there are enough NON-LATIN letters — so a Latin keyboard-mash
//     ("asdfghjklqwerty") can't slip in by being long+spaceless (Codex GATE-4). CJK packs meaning densely, so
//     this path is exempt from the 15-char/4-word Latin bar (fixes the "short Chinese sentence" false-reject).
//   - LATIN/SPACED path: held to length + word count + plausible-words (English, Korean-with-spaces, etc.).
export function checkIntentText(s, { min = 15, minWords = 4, minLetters = 6 } = {}) {
  const t = String(s || '').trim();
  if (isStub(t)) return { ok: false, reason: 'empty or a stub (TODO/TBD/"not run"/…)' };

  const compact = t.replace(/\s+/g, '');
  if (REPEAT.test(compact)) return { ok: false, reason: 'a single repeated character' };
  const runLen = (compact.match(/(.)\1{2,}/gu) || []).join('').length;
  if (compact.length && runLen / compact.length > 0.4) return { ok: false, reason: 'reads like placeholder tokens (repeated characters), not a real statement' };

  // Genuine space-free-script sentence: enough NON-Latin letters AND non-Latin DOMINATES (>= 60% of letters).
  // The dominance ratio stops a Latin keyboard-mash padded with a few CJK chars ("asdfghjkl修正登录后跳")
  // from laundering through this path, while a real CJK sentence with a short acronym ("ログインAPIのバグを
  // 修正する") still passes. The run guard above already rejected repeat soup. (Codex GATE-4/5.)
  const allLetters = [...compact].filter((c) => HAS_LETTER.test(c));
  const nonLatin = allLetters.filter((c) => !LATIN_LETTER.test(c)).length;
  if (nonLatin >= minLetters && nonLatin / allLetters.length >= 0.6) return { ok: true };

  // Latin / spaced text: hold it to the Latin bar so a no-space Latin mash or a fragment is rejected.
  if (t.length < min) return { ok: false, reason: `too short (< ${min} chars) — state it in a sentence` };
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < minWords) return { ok: false, reason: `too few words (< ${minWords}) — state it in a full sentence` };
  const plausible = words.filter(plausibleWord).length;
  if (plausible < Math.ceil(words.length / 2)) return { ok: false, reason: 'reads like placeholder tokens, not a real statement' };
  return { ok: true };
}
