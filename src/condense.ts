/**
 * The rules for condensing a requirement so it fits on one printed line —
 * without changing what it requires.
 *
 * This is the one part of the condensing pass that is not about any particular
 * app: rules 1 and 2 are what stop a rewrite from quietly altering an official
 * requirement, and they were arrived at by measurement, not taste (see § Why
 * the order is load-bearing). The API call, the auth gate and the output
 * protocol belong to the caller; only the rules live here.
 *
 * It sits in this package rather than in a consumer because it is coupled to
 * `requirementJsonSchema` — rule 2 tells the model to put the marker in `label`
 * and the prose in `text`, which is that schema restated in prose. The two have
 * to be versioned together or they drift.
 *
 * Nothing here imports an SDK. A caller passes the string as the system prompt
 * to whichever model it already talks to.
 *
 * ## Why the order is load-bearing
 *
 * Rules 1 and 2 are constraints; 3 is a goal pursued only within them, and the
 * numbering says so because instruction order is read as priority. An earlier
 * draft opened with the character target and listed the specifics fourth — the
 * model duly shed counts, cut cross-references as filler, and lowercased the
 * ALL-CAPS words that mark a counted choice, because it optimised what it was
 * told first. Moving fidelity above the length target and adding the run-long
 * escape hatch cut flagged lines from 114 to 55 over 143 badges and 4,505
 * requirements. Do not reorder these, move the length target up, or drop the
 * escape hatch.
 */

/**
 * What the model is producing one of per requirement.
 *
 * `node` — a node in a requirement tree, as `requirementJsonSchema` describes
 * it; the marker and the prose are separate fields.
 *
 * `line` — a numbered line in a worksheet, answering an input line by number,
 * with the markers held elsewhere and reattached afterwards.
 */
export type CondenseUnit = 'node' | 'line'

export interface CondenseRulesOptions {
  /**
   * Length to aim for in rule 3, in characters. The default suits a portrait
   * sign-off sheet; a narrower form wants less. It is a target, not a limit —
   * rule 3 explicitly permits running long rather than breaking rule 1.
   */
  maxChars?: number
  /** Defaults to `node`. */
  unit?: CondenseUnit
}

/**
 * The three rules, numbered and in order, as a block of plain text.
 *
 * Callers supply their own opening line and their own output-format section
 * around this; `condenseSystemPrompt` does that for the tree case.
 */
export function condenseRules({
  maxChars = 110,
  unit = 'node',
}: CondenseRulesOptions = {}): string {
  const one = unit === 'node' ? 'node' : 'numbered line'
  const placement =
    unit === 'node'
      ? ' Put the marker ("1.", "a.", "(1)") in "label" and the prose in "text".'
      : ''

  return `1. WHAT MUST SURVIVE. These are official requirements a Scout is graded against, so a line that loses one of these has changed the requirement, not shortened it.
- Every specific: counts, durations, distances, measurements, scores, named items. "six of the 15 varieties" must not become "several varieties". A spelled-out number may become a digit; it must not vanish.
- Cross-references to other requirements, by number. They read like filler and are not: they say WHICH thing. "Pick ONE of the sites you surveyed in requirement 4(a)" must not become "Pick ONE" - nobody can tell which site. Abbreviate instead: "Pick ONE of the sites from 4(a)".
- ALL-CAPS emphasis exactly as capitalized: ONE, TWO, THREE, ALL, EACH, NOT. Lowercasing "discuss TWO of the following" turns a counted choice the counselor ticks into ordinary description.
- Official terminology and proper nouns, as written.
- Choice structure: keep "Do ONE of the following" and "Do ALL of the following" lead-ins on the parent item, and write "OR" in capitals between alternatives.
- Option names: an "Option A-Name" item keeps its name.
Only one thing is safe to drop: a parenthetical restatement of a value in another unit, so "a 40-centimeter (16-inch) target" may become "a 40-centimeter target". Never drop the primary value.

2. KEEP EVERY REQUIREMENT, IN PLACE. Preserve every requirement and sub-requirement, the original order, and the original numbering.${placement}
- Never merge two requirements into one, never drop one, never invent one, never reorder.
- A bare lead-in such as "Do the following:" is itself a requirement and keeps its own ${one}. Swallowing it into the item below shifts everything after it out of step, which looks correct and is not: the count still comes out right, so nothing downstream catches it.
- A parent keeps only its lead-in; its detail belongs to its children.
- Reading material ("Resource: ...", "See also ...", a bare link) is not a requirement - leave it out. A numbered requirement that happens to be ABOUT resources is a requirement and must be kept.

3. SHORTEN, within rules 1 and 2. Condense each requirement to ONE sentence, ideally under ${maxChars} characters, so it fits a single printed line.
- If you cannot fit it without breaking rule 1, let the line run long. A requirement that wraps onto a second line is fine; a requirement that lost its count is not.
- Do not compress by merging requirements. How many rows fit on the page is decided elsewhere; your unit of work is the single requirement.
- Drop filler like "with your counselor" only when it does not change what the Scout must do.
- If a requirement is already short, keep it unchanged.
- Use plain ASCII punctuation.`
}

export interface CondenseSystemPromptOptions
  extends Omit<CondenseRulesOptions, 'unit'> {
  /**
   * One sentence naming what the condensed requirements are for, in the
   * caller's own terms — "You reformat merit badge requirements so they fit on
   * a one-page counselor sign-off sheet." The model reads it as the purpose the
   * length target serves.
   */
  task: string
}

/**
 * A ready-made system prompt for the structured-output path: the model is given
 * requirement text and returns the tree described by `requirementJsonSchema`,
 * condensed.
 *
 * Pair it with that schema. For any other protocol — a worksheet answered by
 * number, say — compose your own prompt around `condenseRules`.
 */
export function condenseSystemPrompt({
  task,
  maxChars,
}: CondenseSystemPromptOptions): string {
  return `${task}

You are given the official requirement text. Return the same requirements, restructured as a tree and condensed. The rules are ordered: 1 and 2 are hard constraints, 3 is a goal pursued only within them.

${condenseRules({ maxChars, unit: 'node' })}`
}
