/**
 * Parser checks. Run with `pnpm test`.
 *
 * Every fixture here is INVENTED. Real merit badge requirements are Scouting
 * America's text, and this file is meant to travel with the parser if it is
 * ever extracted into its own package — so it must carry nothing that is not
 * ours to relicense. Synthetic requirements exercise the same shapes (marker
 * styles, nesting, wrapped lines, annotations) without copying anyone's words.
 */
import assert from 'node:assert/strict'
import { parseRequirements, stripAnnotations } from './parse.js'
import { countNodes, toText } from './tree.js'
import type { Requirement } from './tree.js'

let passed = 0
const failures: Array<string> = []

function check(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
  } catch (e) {
    failures.push(
      `${name}\n    ${e instanceof Error ? e.message.split('\n')[0] : e}`,
    )
  }
}

/** The tree as "label|text" lines, indented by depth — compact enough to assert on. */
function shape(nodes: Array<Requirement>, depth = 0): Array<string> {
  return nodes.flatMap((n) => [
    `${'  '.repeat(depth)}${n.label}|${n.text}`,
    ...shape(n.children, depth + 1),
  ])
}

// ---------------------------------------------------------------- markers ---

check('arabic markers make top-level items', () => {
  const out = parseRequirements(`1. Sketch a widget.
2. Describe a gadget.`)
  assert.deepEqual(shape(out), ['1.|Sketch a widget.', '2.|Describe a gadget.'])
})

check('lettered markers nest under the arabic item above', () => {
  const out = parseRequirements(`1. Do the following:
a. Name three widgets.
b. Name three gadgets.`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  a.|Name three widgets.',
    '  b.|Name three gadgets.',
  ])
})

check('parenthesized letters are the same level as "a."', () => {
  const out = parseRequirements(`1. Do the following:
(a) Name three widgets.
(b) Name three gadgets.`)
  assert.equal(out[0].children.length, 2)
  assert.equal(out[0].children[0].label, '(a)')
})

check('parenthesized numerals nest below letters', () => {
  const out = parseRequirements(`1. Do the following:
a. Compare two widgets:
(1) By weight
(2) By color`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  a.|Compare two widgets:',
    '    (1)|By weight',
    '    (2)|By color',
  ])
})

check('roman numerals nest below letters', () => {
  const out = parseRequirements(`1. Do the following:
a. Sort the parts:
i. By size
ii. By shape
iii. By color`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  a.|Sort the parts:',
    '    i.|By size',
    '    ii.|By shape',
    '    iii.|By color',
  ])
})

// "i." is the ninth letter as well as roman one. These two fixtures pin both
// readings: only a list that just passed "h." is still counting letters.
check('a lettered list reaching i. keeps it a letter', () => {
  const out = parseRequirements(`1. Do the following:
g. Item g
h. Item h
i. Item i`)
  assert.equal(out[0].children.length, 3)
  assert.equal(out[0].children[2].children.length, 0)
})

check('v. after u. stays a letter', () => {
  const out = parseRequirements(`1. Do the following:
t. Item t
u. Item u
v. Item v`)
  assert.equal(out[0].children.length, 3)
})

check('a paste that starts mid-list still produces a tree', () => {
  const out = parseRequirements(`a. Name a widget.
b. Name a gadget.`)
  assert.equal(countNodes(out), 2)
})

// ------------------------------------------------------------ deep nesting ---

// Real outlines reuse their alphabet instead of inventing a new marker style
// for every level. These pin the reading: a marker that cannot continue any
// open list is starting a new one, however deep that lands.

check('a restarted alphabet opens a level instead of returning to an old one', () => {
  const out = parseRequirements(`1. Do the following:
(a) Compare two widgets:
(1) By weight
(2) By colour:
(a) In daylight
(b) Under lamplight`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (a)|Compare two widgets:',
    '    (1)|By weight',
    '    (2)|By colour:',
    '      (a)|In daylight',
    '      (b)|Under lamplight',
  ])
})

check('the alphabet can cycle more than once', () => {
  const out = parseRequirements(`1. Top:
(a) Second:
(1) Third:
(a) Fourth:
(1) Fifth:
(a) Sixth`)
  let node = out[0]
  for (let depth = 1; depth <= 5; depth += 1) {
    assert.equal(node.children.length, 1, `depth ${depth}`)
    node = node.children[0]
  }
  assert.equal(node.text, 'Sixth')
})

check('a sibling closes the levels opened below it', () => {
  const out = parseRequirements(`1. Do the following:
(a) Sort the parts:
(1) By size
(2) By shape
(b) Count the parts.`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (a)|Sort the parts:',
    '    (1)|By size',
    '    (2)|By shape',
    '  (b)|Count the parts.',
  ])
})

check('arabic markers can reappear below letters', () => {
  const out = parseRequirements(`5. Do the following:
(a) Name a widget.
(b) Do ONE of the following:
1. Sketch a gadget.
2. Sketch a sprocket.
6. Describe a sprocket.`)
  assert.deepEqual(shape(out), [
    '5.|Do the following:',
    '  (a)|Name a widget.',
    '  (b)|Do ONE of the following:',
    '    1.|Sketch a gadget.',
    '    2.|Sketch a sprocket.',
    '6.|Describe a sprocket.',
  ])
})

check('a lone "i." still starts a roman sub-list below a numbered one', () => {
  const out = parseRequirements(`1. Do the following:
(1) Sort the parts:
i. By size
ii. By shape`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (1)|Sort the parts:',
    '    i.|By size',
    '    ii.|By shape',
  ])
})

// ----------------------------------------------------------- option markers ---

check('"Option A—" is a marker, and options are siblings', () => {
  const out = parseRequirements(`2. Complete ONE of the following options:
Option A—Widgets. Do ALL of the following:
(a) Sketch a widget.
(b) Name three widgets.
Option B—Gadgets. Do ALL of the following:
(a) Sketch a gadget.`)
  assert.deepEqual(shape(out), [
    '2.|Complete ONE of the following options:',
    '  Option A—|Widgets. Do ALL of the following:',
    '    (a)|Sketch a widget.',
    '    (b)|Name three widgets.',
    '  Option B—|Gadgets. Do ALL of the following:',
    '    (a)|Sketch a gadget.',
  ])
})

check('other option separators are accepted', () => {
  for (const line of ['Option A: Widgets', 'Option A. Widgets', 'Option A - Widgets']) {
    const out = parseRequirements(`1. Pick one:\n${line}`)
    assert.equal(out[0].children.length, 1, line)
    assert.equal(out[0].children[0].text, 'Widgets', line)
  }
})

check('prose merely opening with the words is not an option marker', () => {
  const out = parseRequirements(`1. Option A is cheaper, so explain the tradeoff.`)
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'Option A is cheaper, so explain the tradeoff.')
})

// --------------------------------------------------------- compound markers ---

check('a compound marker nests under the level it names', () => {
  const out = parseRequirements(`1. Do the following:
(a) Grow TWO of these:
(1)(a) Barley
(1)(b) Millet`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (a)|Grow TWO of these:',
    '    (1)(a)|Barley',
    '    (1)(b)|Millet',
  ])
})

// ------------------------------------------------------ indentation as hint ---

check('indentation keeps a restarted list from opening a level', () => {
  const out = parseRequirements(`1. Do the following:
  (a) Sketch a widget.
  (b) Sketch a gadget.
  (a) Sketch it again.`)
  assert.equal(out[0].children.length, 3)
  assert.equal(out[0].children[2].text, 'Sketch it again.')
})

check('indentation picks between two lists open at the same letter', () => {
  const out = parseRequirements(`1. Do the following:
  (a) Alpha
  (b) Beta:
    (1) One
    (2) Two:
      (a) Deep alpha
      (b) Deep beta
  (c) Gamma`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (a)|Alpha',
    '  (b)|Beta:',
    '    (1)|One',
    '    (2)|Two:',
    '      (a)|Deep alpha',
    '      (b)|Deep beta',
    '  (c)|Gamma',
  ])
})

check('unindented text is still parsed by markers alone', () => {
  const out = parseRequirements(`1. Do the following:
(a) Sketch a widget.
(b) Sketch a gadget.
2. Describe a sprocket.`)
  assert.deepEqual(shape(out), [
    '1.|Do the following:',
    '  (a)|Sketch a widget.',
    '  (b)|Sketch a gadget.',
    '2.|Describe a sprocket.',
  ])
})

// ------------------------------------------------------------ wrapped text ---

check('an unmarked line continues the requirement above it', () => {
  const out = parseRequirements(`1. Explain to your counselor how a widget is
assembled from parts.
2. Next.`)
  assert.equal(
    out[0].text,
    'Explain to your counselor how a widget is assembled from parts.',
  )
})

check('leading unnumbered prose becomes its own item', () => {
  const out = parseRequirements(`Complete every requirement below.
1. Sketch a widget.`)
  assert.equal(out.length, 2)
  assert.equal(out[0].label, '')
})

// ------------------------------------------------------------- annotations ---

const ANNOTATED = `3. Widget Care. Discuss with your counselor how routine care accomplishes the following:
Resource: Caring For Your Widget (video)
(a) Longer service life
Resource: Widget Maintenance Basics (video)
(b) Fewer breakdowns
Resource: Why Widgets Fail (video)`

check('annotation lines are dropped from the tree', () => {
  assert.deepEqual(shape(parseRequirements(ANNOTATED)), [
    '3.|Widget Care. Discuss with your counselor how routine care accomplishes the following:',
    '  (a)|Longer service life',
    '  (b)|Fewer breakdowns',
  ])
})

check('annotations never merge into the preceding requirement', () => {
  for (const node of parseRequirements(ANNOTATED)[0].children) {
    assert.equal(
      node.text.includes('Resource'),
      false,
      `leaked into: ${node.text}`,
    )
  }
})

check('a marked requirement about resources is kept', () => {
  const out = parseRequirements(`1. Do the following:
(a) Resources: name three renewable ones
(b) Name two others`)
  assert.equal(out[0].children.length, 2)
  assert.equal(out[0].children[0].text, 'Resources: name three renewable ones')
})

check('prose merely starting with the word is kept (no colon)', () => {
  const out = parseRequirements(
    `1. Resources are limited, so explain conservation.`,
  )
  assert.equal(out[0].text, 'Resources are limited, so explain conservation.')
})

check('a wrapped annotation takes its continuation lines with it', () => {
  const out = parseRequirements(`(a) Longer service life
Resource: Widget Maintenance Basics
https://example.org/widget-maintenance
(b) Fewer breakdowns`)
  assert.equal(shape(out).join('\n').includes('example.org'), false)
})

check('a blank line ends an annotation block', () => {
  const text = stripAnnotations(`1. Sketch a widget.
Resource: Sketching Widgets (video)

Then label every part you drew.
2. Next.`)
  assert.equal(text.includes('Resource:'), false)
  assert.equal(text.includes('Then label every part'), true)
})

check('plural and spacing variants are all annotations', () => {
  for (const line of [
    'Resource: A',
    'Resources: A',
    'resource : A',
    'RESOURCE: A',
  ]) {
    assert.equal(
      stripAnnotations(`1. Item\n${line}`).includes('A'),
      false,
      line,
    )
  }
})

check('stripAnnotations is idempotent', () => {
  const once = stripAnnotations(ANNOTATED)
  assert.equal(stripAnnotations(once), once)
})

check('stripAnnotations leaves clean input untouched', () => {
  const clean = `1. Sketch a widget.\n2. Describe a gadget.`
  assert.equal(stripAnnotations(clean), clean)
})

// ---------------------------------------------------------------- round trip ---

check('toText round-trips through the parser', () => {
  const source = `1. Do the following:
a. Name three widgets.
b. Compare two gadgets:
(1) By weight
(2) By color
2. Describe a sprocket.`
  const once = parseRequirements(source)
  assert.deepEqual(shape(parseRequirements(toText(once))), shape(once))
})

check('empty and whitespace input produce no requirements', () => {
  assert.deepEqual(parseRequirements(''), [])
  assert.deepEqual(parseRequirements('   \n\n  '), [])
})

// -------------------------------------------------------------------- report ---

for (const f of failures) console.error(`  ✗ ${f}`)
console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
