/**
 * requirement-tree — parse numbered requirement outlines into a tree, and
 * operate on that tree.
 *
 * The parser recovers structure from the numbering alone ("1." / "a." / "(1)" /
 * "i."), joins wrapped lines, and drops the "Resource: …" annotation lines that
 * pasted handbook text carries. Nothing here touches the wording.
 */
export { parseRequirements, stripAnnotations } from './parse.js'

export {
  // types
  type Requirement,
  type RequirementBase,
  type RequirementInput,
  type HasChildren,
  type FlatRow,
  // schemas
  requirementSchema,
  requirementListSchema,
  requirementJsonSchema,
  // construction
  withIds,
  emptyRequirement,
  // queries
  isLeaf,
  countNodes,
  flatten,
  canIndent,
  canOutdent,
  // transforms
  mapTree,
  updateNode,
  removeNode,
  moveRequirement,
  toText,
} from './tree.js'
