import { withIds } from './tree.js'
import type { Requirement, RequirementInput } from './tree.js'

/**
 * Deterministic parser for pasted requirement text.
 *
 * This is the no-AI path: it recovers the tree from the numbering markers
 * alone. The AI path produces the same shape, so the editor and the PDF never
 * need to know which one ran.
 *
 * ## How depth is decided
 *
 * The obvious design — map each marker style to a fixed depth, so "(a)" is
 * always level 1 and "(1)" always level 2 — cannot read real outlines, because
 * real outlines reuse their alphabet. Merit badge requirements cycle with
 * period two below the top level:
 *
 *     1.            depth 0
 *       (a)         depth 1
 *         (1)       depth 2
 *           (a)     depth 3   <- the alphabet starts over
 *             (1)   depth 4
 *
 * A fixed map has nowhere to put that fourth level. So instead of asking "what
 * depth is this marker?", every line asks **"does this continue a list that is
 * already open?"**:
 *
 * - It continues an open level ("(b)" where that level last saw "(a)") — it is
 *   a sibling there, and any deeper levels are closed.
 * - It starts a sequence ("(a)", "(1)", "1.") — it opens a *new* level under
 *   the current item. The "(a)" at depth 3 above is a start, not a return to
 *   depth 1, because depth 2 had just reached "(2)".
 * - Neither — it joins the nearest open level using the same style.
 *
 * Sequence position also settles the "i." problem for free. That marker is both
 * roman one and the ninth letter; a list that just passed "h." is continuing
 * with letters, and anything else reaching "i." is starting a roman sub-list.
 * No special case is needed — the same continuation test answers it.
 */

/**
 * Marker alphabets. Parenthesized letters share the letter alphabet so "(a)"
 * and "a." do not split into two levels, but "(1)" is deliberately kept apart
 * from "1." — sources use the bare numeral at the top and the parenthesized
 * one for a sub-list, and collapsing them would flatten that distinction.
 */
type Style = 'arabic' | 'paren-arabic' | 'letter' | 'roman' | 'option'

/** One reading of a marker: which alphabet, and how far along it. */
interface Candidate {
  style: Style
  value: number
}

interface Marker {
  label: string
  rest: string
  /**
   * Readings in preference order. More than one only for "i."/"v."/"x.", which
   * are ambiguous until the surrounding sequence is known; the last entry is
   * what we fall back to when nothing continues.
   */
  candidates: Array<Candidate>
}

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
}

function romanValue(text: string): number {
  const digits = [...text.toLowerCase()].map((c) => ROMAN_VALUES[c] ?? 0)
  return digits.reduce(
    (sum, d, i) => sum + (digits[i + 1] > d ? -d : d),
    0,
  )
}

/** 'a' -> 1, 'b' -> 2 — the letter's position in its own alphabet. */
function letterValue(letter: string): number {
  return letter.toLowerCase().charCodeAt(0) - 96
}

/** "i", "v" and "x" are a letter and a roman numeral at the same time. */
const AMBIGUOUS = new Set(['i', 'v', 'x'])

function marker(
  match: RegExpExecArray,
  line: string,
  candidates: Array<Candidate>,
): Marker {
  return {
    label: match[0].trim(),
    rest: line.slice(match[0].length).trim(),
    candidates,
  }
}

function readMarker(line: string): Marker | null {
  let m: RegExpExecArray | null

  // "(5)(a)" — a compound marker naming its own path. The last group is the
  // operative one; the levels above it are already open.
  if ((m = /^(?:\(\d+\))+\(([a-z])\)\s+/i.exec(line))) {
    return marker(m, line, [{ style: 'letter', value: letterValue(m[1]) }])
  }

  // "Option A—" / "Option B." — a word marker. Sources use it for a group of
  // mutually exclusive branches, where a bare letter would collide with the
  // lettered sub-items inside each branch.
  //
  // The separator is required, so a requirement that merely opens with the
  // words ("Option A is cheaper, but...") is left as prose.
  if ((m = /^Option\s+([A-Z])\s*[—–:.)-]\s*/.exec(line))) {
    return marker(m, line, [{ style: 'option', value: letterValue(m[1]) }])
  }

  if ((m = /^\((\d+)\)\s+/.exec(line))) {
    return marker(m, line, [{ style: 'paren-arabic', value: Number(m[1]) }])
  }

  if ((m = /^\(([a-z])\)\s+/i.exec(line))) {
    return marker(m, line, [{ style: 'letter', value: letterValue(m[1]) }])
  }

  if ((m = /^(\d+)[.)]\s+/.exec(line))) {
    return marker(m, line, [{ style: 'arabic', value: Number(m[1]) }])
  }

  // Multi-character romans are unambiguous — no single letter spells "ii".
  if ((m = /^([ivx]{2,})[.)]\s+/i.exec(line))) {
    return marker(m, line, [{ style: 'roman', value: romanValue(m[1]) }])
  }

  if ((m = /^([a-z])[.)]\s+/i.exec(line))) {
    const letter = m[1].toLowerCase()
    // Letter first: it wins if it continues an open lettered list. Roman is the
    // fallback, which makes a lone "i." the start of a sub-list.
    return marker(
      m,
      line,
      AMBIGUOUS.has(letter)
        ? [
            { style: 'letter', value: letterValue(letter) },
            { style: 'roman', value: romanValue(letter) },
          ]
        : [{ style: 'letter', value: letterValue(letter) }],
    )
  }

  return null
}

/**
 * Lines that annotate a requirement instead of being one. Requirements pasted
 * from the online handbook carry "Resource: <title> (video)" links under many
 * items; nobody signs off on a link, so they never enter the tree.
 *
 * Two things keep this from eating real requirements. Markers are read first,
 * so "(a) Resource management" is already a row before this test runs; and the
 * colon is required, so prose that merely opens with the word ("Resources are
 * limited...") is untouched. What is left ambiguous is unnumbered leading prose
 * that genuinely starts "Resource:" — which would be indistinguishable from an
 * annotation to a human reader too.
 */
const ANNOTATION_RE = /^resources?\s*:/i

/**
 * Remove annotation lines from pasted text, along with any lines they wrap
 * onto — a stray URL left behind would otherwise read as continuation prose and
 * glue itself to the requirement above. A marker, or a blank line, ends the
 * annotation, so over-swallowing is bounded by the next real line.
 *
 * Exported because both paths need it: the parser runs it first, and the AI
 * path strips the prompt so the model is never shown links it might keep.
 */
export function stripAnnotations(input: string): string {
  const kept: Array<string> = []
  let inAnnotation = false

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim()

    if (!line) {
      inAnnotation = false
    } else if (readMarker(line)) {
      inAnnotation = false
    } else if (ANNOTATION_RE.test(line)) {
      inAnnotation = true
    }

    if (!inAnnotation) kept.push(raw)
  }

  return kept.join('\n')
}

interface Row {
  marker: Marker | null
  text: string
  indent: number
}

/**
 * Join wrapped lines back onto their requirement. A line only starts a new
 * requirement if it carries a marker; anything else is continuation prose.
 */
function toRows(input: string): Array<Row> {
  const rows: Array<Row> = []

  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) continue

    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    const found = readMarker(line)

    if (found) {
      rows.push({ marker: found, text: found.rest, indent })
    } else if (rows.length) {
      const prev = rows[rows.length - 1]
      prev.text = `${prev.text} ${line}`.trim()
    } else {
      // Leading unnumbered prose — keep it as its own top-level item.
      rows.push({ marker: null, text: line, indent })
    }
  }

  return rows
}

/** An open list: what it is counting, how far it got, and where it sits. */
interface Level {
  style: Style
  last: number
  indent: number
  node: RequirementInput
}

export function parseRequirements(input: string): Array<Requirement> {
  const rows = toRows(stripAnnotations(input))
  if (!rows.length) return []

  // Indentation is a tiebreaker, not a signal in its own right — plenty of
  // pasted text has none, and plenty has it wrong. It is only consulted to stop
  // a restarted list ("(a)" again, at the same indent) from opening a level
  // that isn't there, and only when the source indents at all.
  const indented = rows.some((r) => r.indent > 0)

  const roots: Array<RequirementInput> = []
  const stack: Array<Level> = []

  for (const row of rows) {
    const node: RequirementInput = {
      label: row.marker?.label ?? '',
      text: row.text,
      children: [],
    }

    if (!row.marker) {
      // Leading prose sits at the top level but opens nothing, so the first
      // real marker after it is its sibling rather than its child.
      roots.push(node)
      continue
    }

    const place = (depth: number, candidate: Candidate) => {
      if (depth === 0) roots.push(node)
      else stack[depth - 1].node.children.push(node)
      stack[depth] = {
        style: candidate.style,
        last: candidate.value,
        indent: row.indent,
        node,
      }
      stack.length = depth + 1
    }

    const deepest = (test: (level: Level) => boolean) => {
      for (let i = stack.length - 1; i >= 0; i -= 1) if (test(stack[i])) return i
      return -1
    }

    // 1. Does any reading continue a list that is already open?
    //
    //    A cycling alphabet can leave two lists open at the same position —
    //    "(b)" at depth 3 and "(b)" at depth 5 — and an incoming "(c)" honestly
    //    continues either. Indentation decides when the source has it;
    //    otherwise the innermost list wins, which is right whenever the deeper
    //    list is still being written.
    let continued = false
    for (const candidate of row.marker.candidates) {
      const continues = (l: Level) =>
        l.style === candidate.style && l.last + 1 === candidate.value
      let at = indented
        ? deepest((l) => continues(l) && l.indent === row.indent)
        : -1
      if (at < 0) at = deepest(continues)
      if (at >= 0) {
        place(at, candidate)
        continued = true
        break
      }
    }
    if (continued) continue

    // 2. Nothing continues. Fall back to the last reading — for "i." that is
    //    roman, which makes it the start of a sub-list rather than a stray
    //    ninth letter.
    const candidate = row.marker.candidates[row.marker.candidates.length - 1]

    if (candidate.value === 1) {
      // A sequence start normally opens a level. The exception is a list that
      // restarts at the same indent as one already open, which indentation —
      // when the source has any — is the only way to tell apart.
      const restart = indented
        ? deepest((l) => l.style === candidate.style && l.indent >= row.indent)
        : -1
      if (restart >= 0) place(restart, candidate)
      else place(stack.length, candidate)
      continue
    }

    // 3. Out of sequence and not a start — a paste that begins mid-list, or a
    //    gap in the numbering. Join the nearest list using the same alphabet.
    const sameStyle = deepest((l) => l.style === candidate.style)
    place(sameStyle >= 0 ? sameStyle : stack.length, candidate)
  }

  return withIds(roots)
}
