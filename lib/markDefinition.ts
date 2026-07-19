// lib/markDefinition.ts
// Single source of truth for a mark's "what counts as one check-in" line.
// Library marks carry an authored, concrete description; custom marks get a
// concrete auto-template. AI marks persist as library marks (canonical name +
// emoji), so they resolve through the library branch. Derived at render time —
// no DB column, no sync.
import { resolveLibraryMark, type MarkCategoryInput } from './markCategoryResolve';

/** The concrete "what counts as one check-in" line for any mark. */
export function resolveMarkDefinition(mark: MarkCategoryInput): string {
  const lib = resolveLibraryMark(mark);
  if (lib) return lib.description;
  return `One check-in = each time you ${mark.name.trim().toLowerCase()}.`;
}
