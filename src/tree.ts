import { z } from 'zod'

/**
 * A requirement is a tree of numbered items — the shape a merit badge, a
 * syllabus, or any "1. / a. / (1)" outline already has on paper.
 *
 * `label` is the marker printed before the text ("1.", "a.", "(1)"), kept
 * separate from `text` so prose can be rewritten without touching numbering.
 *
 * The `Self` parameter lets a consumer add its own fields and keep them through
 * every operation here: a printable sheet adds `signable`, a tracker might add
 * `completedAt`. Without it, `flatten` and friends would quietly widen a
 * consumer's node type back to the base on every call.
 */
export interface RequirementBase<Self> {
  id: string
  label: string
  text: string
  children: Array<Self>
}

/** The plain tree, with no consumer-specific fields. */
export interface Requirement extends RequirementBase<Requirement> {}

/** The same tree before ids are assigned — what the parser produces. */
export interface RequirementInput {
  label: string
  text: string
  children: Array<RequirementInput>
}

export const requirementSchema: z.ZodType<RequirementInput> = z.object({
  label: z.string().default(''),
  text: z.string(),
  children: z.lazy(() => z.array(requirementSchema)).default([]),
})

export const requirementListSchema = z.array(requirementSchema)

/**
 * JSON Schema for handing this shape to a language model as structured output.
 * Kept in lockstep with the Zod schema above.
 */
export function requirementJsonSchema(maxDepth = 3): Record<string, unknown> {
  const node = (depth: number): Record<string, unknown> => ({
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description:
          'The numbering marker exactly as it appears in the source, e.g. "1.", "a.", "(1)". Empty string if the item is unnumbered.',
      },
      text: {
        type: 'string',
        description:
          'The requirement restated as one plain sentence, with the label removed.',
      },
      ...(depth > 0
        ? {
            children: {
              type: 'array',
              description:
                'Sub-requirements nested under this one. Empty when there are none.',
              items: node(depth - 1),
            },
          }
        : {}),
    },
    required: depth > 0 ? ['label', 'text', 'children'] : ['label', 'text'],
    additionalProperties: false,
  })

  return {
    type: 'object',
    properties: {
      requirements: {
        type: 'array',
        description: 'The requirements, in their original order.',
        items: node(maxDepth - 1),
      },
    },
    required: ['requirements'],
    additionalProperties: false,
  }
}

let counter = 0
function nextId() {
  counter += 1
  return `r${counter}`
}

/** Attach stable ids so UI keys and edits survive re-renders. */
export function withIds(nodes: Array<RequirementInput>): Array<Requirement> {
  return nodes.map((n) => ({
    id: nextId(),
    label: n.label,
    text: n.text,
    children: withIds(n.children),
  }))
}

export function emptyRequirement(): Requirement {
  return { id: nextId(), label: '', text: '', children: [] }
}

export function isLeaf<T extends RequirementBase<T>>(r: T) {
  return r.children.length === 0
}

/** Total number of nodes, at every depth. */
export function countNodes<T extends RequirementBase<T>>(
  nodes: Array<T>,
): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

/** Depth-first map, returning a new tree. */
export function mapTree<T extends RequirementBase<T>>(
  nodes: Array<T>,
  fn: (r: T) => T,
): Array<T> {
  return nodes.map((n) => {
    const next = fn(n)
    return { ...next, children: mapTree(next.children, fn) }
  })
}

export function updateNode<T extends RequirementBase<T>>(
  nodes: Array<T>,
  id: string,
  patch: Partial<Omit<T, 'id' | 'children'>>,
): Array<T> {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, ...patch } : n))
}

export function removeNode<T extends RequirementBase<T>>(
  nodes: Array<T>,
  id: string,
): Array<T> {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

export interface FlatRow<T> {
  requirement: T
  depth: number
  /** Position among its siblings — an editor needs it to know if it can indent. */
  siblingIndex: number
}

/** Flatten to rows in print order. */
export function flatten<T extends RequirementBase<T>>(
  nodes: Array<T>,
  depth = 0,
): Array<FlatRow<T>> {
  return nodes.flatMap((n, siblingIndex) => [
    { requirement: n, depth, siblingIndex },
    ...flatten(n.children, depth + 1),
  ])
}

/** A row can nest under the sibling above it — the first one has nothing to nest under. */
export function canIndent<T>(row: FlatRow<T>) {
  return row.siblingIndex > 0
}

/** Top-level rows have nowhere to be promoted to. */
export function canOutdent<T>(row: FlatRow<T>) {
  return row.depth > 0
}

/** Make the row the last child of its previous sibling. */
function indent<T extends RequirementBase<T>>(
  nodes: Array<T>,
  id: string,
): Array<T> {
  const i = nodes.findIndex((n) => n.id === id)

  if (i === 0) return nodes // nothing above it to nest under
  if (i > 0) {
    const next = [...nodes]
    const [moved] = next.splice(i, 1)
    const prev = next[i - 1]
    next[i - 1] = { ...prev, children: [...prev.children, moved] }
    return next
  }

  return nodes.map((n) => ({ ...n, children: indent(n.children, id) }))
}

/**
 * Promote the row to sit just after its former parent. Rows that followed it
 * under that parent come along as its children, which is how outline editors
 * behave and keeps the printed order stable.
 */
function outdent<T extends RequirementBase<T>>(
  nodes: Array<T>,
  id: string,
): Array<T> {
  const pi = nodes.findIndex((n) => n.children.some((c) => c.id === id))

  if (pi !== -1) {
    const parent = nodes[pi]
    const at = parent.children.findIndex((c) => c.id === id)
    const moved = parent.children[at]
    const trailing = parent.children.slice(at + 1)

    const next = [...nodes]
    next[pi] = { ...parent, children: parent.children.slice(0, at) }
    next.splice(pi + 1, 0, {
      ...moved,
      children: [...moved.children, ...trailing],
    })
    return next
  }

  return nodes.map((n) => ({ ...n, children: outdent(n.children, id) }))
}

/** Re-parent one row within its sibling list. */
export function moveRequirement<T extends RequirementBase<T>>(
  nodes: Array<T>,
  id: string,
  direction: 'in' | 'out',
): Array<T> {
  return direction === 'in' ? indent(nodes, id) : outdent(nodes, id)
}

/** Round-trip a tree back to the indented text format the parser accepts. */
export function toText<T extends RequirementBase<T>>(
  nodes: Array<T>,
  depth = 0,
): string {
  return nodes
    .flatMap((n) => [
      `${'  '.repeat(depth)}${[n.label, n.text].filter(Boolean).join(' ')}`,
      ...(n.children.length ? [toText(n.children, depth + 1)] : []),
    ])
    .join('\n')
}
