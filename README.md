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

- **Marker styles** — `1.` `1)` `a.` `(a)` `(1)` `i.`, nesting in that order.
- **`i.` is disambiguated by context.** It is both roman one and the ninth
  letter; only a list that just passed `h.` is still counting letters. Same for
  `v.` after `u.` and `x.` after `w.`
- **Wrapped lines** rejoin the requirement above them, so text that broke across
  lines in the source comes back as one requirement.
- **Annotation lines are dropped.** Pasted handbook text carries `Resource: …`
  links under many items; they are reading material, not requirements. A line
  needs both the keyword and a colon, and markers are read first — so
  `(a) Resources: name three` is kept, and `Resources are limited…` is kept.
  Available separately as `stripAnnotations` if you want the cleaned text.
- **Indentation** as a fallback, when a source reuses one marker style at every
  level.

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
