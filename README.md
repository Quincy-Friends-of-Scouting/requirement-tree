# requirement-tree

Parse numbered requirement outlines into a tree, and operate on that tree.

Requirements arrive as pasted text — a merit badge, a syllabus, a checklist —
numbered the way people number things:

```
3. Fire as a Management Tool. Discuss with your counselor how prescribed fire is used to accomplish the following:
Resource: Misconceptions and Benefits of Fire (video)
(a) Fuel reduction
(b) Fish and wildlife habitat enhancement
```

`parseRequirements` recovers the structure from the numbering alone, without
touching a word of the prose:

```ts
import { parseRequirements, toText } from 'requirement-tree'

const tree = parseRequirements(pasted)

toText(tree)
// 3. Fire as a Management Tool. Discuss with your counselor how prescribed fire is used to accomplish the following:
//   (a) Fuel reduction
//   (b) Fish and wildlife habitat enhancement
```

## What the parser handles

- **Marker styles** — `1.` `1)` `a.` `a)` `(a)` `(1)` `i.` `(5)(a)`, plus
  `Option A—` word markers.
- **Depth comes from sequence, not from a fixed table of styles.** Real
  outlines reuse their alphabet rather than inventing a style per level, so
  every line asks *does this continue a list that is already open?* — `(b)`
  after `(a)` is a sibling, while `(a)` arriving after `(2)` is starting a new
  sub-list. That reads an outline whose markers cycle:

  ```
  1.                depth 0
    (a)             depth 1
      (1)           depth 2
        (a)         depth 3   <- the alphabet starts over
          (1)       depth 4
  ```

  A parser that pinned `(a)` to depth 1 would have nowhere to put the fourth
  level, and would silently re-parent everything below it.
- **`i.` is disambiguated by context**, and falls out of the same rule. It is
  both roman one and the ninth letter; a list that just passed `h.` is still
  counting letters, and anything else reaching `i.` is starting a roman
  sub-list. Same for `v.` after `u.` and `x.` after `w.`
- **`Option A—` is a marker.** Sources use it where a branch group would
  otherwise collide with the lettered items inside each branch. The separator
  is required, so `Option A is cheaper…` stays prose.
- **Wrapped lines** rejoin the requirement above them, so text that broke across
  lines in the source comes back as one requirement.
- **Annotation lines are dropped.** Pasted handbook text carries `Resource: …`
  links under many items; they are reading material, not requirements. A line
  needs both the keyword and a colon, and markers are read first — so
  `(a) Resources: name three` is kept, and `Resources are limited…` is kept.
  Available separately as `stripAnnotations` if you want the cleaned text.
- **Indentation is a tiebreaker**, never a requirement — unindented text parses
  from markers alone. It only settles what markers genuinely cannot: a list
  that restarts at `(a)` where a level already exists, and which of two lists
  open at the same letter an incoming `(c)` belongs to.

## Tree operations

`flatten` · `mapTree` · `updateNode` · `removeNode` · `moveRequirement`
(indent/outdent) · `countNodes` · `isLeaf` · `canIndent` / `canOutdent` ·
`toText` (round-trips back to parseable text) · `withIds`

Also `requirementSchema` / `requirementListSchema` (Zod) and
`requirementJsonSchema()` for handing the shape to a language model as
structured output.

## Extending the node type

Every operation is generic over your node type, so fields you add survive:

```ts
import type { RequirementBase } from 'requirement-tree'

interface SheetRequirement extends RequirementBase<SheetRequirement> {
  signable?: boolean // e.g. "this row prints a signature rule"
}

const rows = updateNode(mine, id, { signable: true }) // still SheetRequirement[]
```

`parseRequirements` returns the plain `Requirement[]` — it has no way to invent
your fields. Adopt it with an annotation (or by passing it into a typed
parameter, which most call sites do anyway):

```ts
const rows: Array<SheetRequirement> = parseRequirements(pasted)
```

Without that, TypeScript infers the base type and rejects your own fields on
the next `updateNode`.

## Install

```bash
pnpm add github:Quincy-Friends-of-Scouting/requirement-tree
```

## Development

```bash
pnpm install
pnpm test        # parser checks — synthetic fixtures, no framework
pnpm typecheck
pnpm build       # dist/ with .d.ts; also runs on install as `prepare`
```

Fixtures are invented rather than copied from real requirement text, so the
suite carries nothing that is not ours to relicense.

## License

MIT — see [LICENSE](LICENSE).
