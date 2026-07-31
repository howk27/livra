import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * QC3 wave 2 guard — tap-target floor on the journal / mark-create touchables.
 *
 * These buttons repeatedly regressed below the 44px floor (RN sizes a button
 * from padding + content when no explicit height is set). This test walks the
 * named touchable style blocks in source and fails if any of them drops its
 * `minHeight: 44`, or if the icon-only edit/delete buttons drop their
 * hitSlop below 14 (16px icon + 2×14 = 44px effective target).
 *
 * Pattern is the design floor in `ui-design-lead` ("tap targets >= 44px");
 * `components/DailyTargetStepper.tsx` (explicit 44×44) is the reference impl.
 */

const ROOT = join(__dirname, '../../');

function styleBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`\\b${name}:\\s*\\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`style block "${name}" not found`);
  return m[1];
}

// (file, styleName) touchables that must carry an explicit 44px minimum.
// The journal compose "Add entry" button now lives in the shared composer that
// both the detail preview and the full journal screen consume (QC3 cleanup).
const MIN_HEIGHT_TARGETS: Array<[string, string]> = [
  ['app/mark/new.tsx', 'popularChip'],
  ['app/mark/new.tsx', 'dayChip'],
  ['components/journal/JournalComposer.tsx', 'addBtn'],
  ['app/goal/journal/[id].tsx', 'entrySaveBtn'],
  // Swept 2026-07-25 (k): the secondary touchables the QC3 pass left behind.
  // They were hitSlop 8 on bare Text/icon children, i.e. ~20-24pt real targets.
  ['app/goal/journal/[id].tsx', 'entryEditCancelBtn'],
  ['app/goal/journal/[id].tsx', 'cloudDismissBtn'],
  ['app/goal/[id].tsx', 'saveTitleBtn'],
  ['app/goal/[id].tsx', 'journalCloudDismissBtn'],
];

/**
 * The four touchables the 2026-07-25 (k) sweep converted from hitSlop to a real
 * box, keyed by their onPress handler. Scoped deliberately: a whole-file scan
 * cannot measure a JSX target honestly (a regex cannot tell a nested touchable
 * from its parent row, and an icon button's size lives on its glyph child, not
 * in a style block). These four are unambiguous, and they are what regressed.
 */
const BOXED_NOT_SLOPPED: Array<[string, string]> = [
  ['app/goal/journal/[id].tsx', 'onPress={() => setEditing(false)}'],
  // M9 Phase 3: the store's cloud-error hint became a local write-error state.
  // Same control, same box, same 44pt rule; only the handler was renamed.
  ['app/goal/journal/[id].tsx', 'onPress={() => setWriteError(null)}'],
  ['app/goal/[id].tsx', 'onPress={onSaveTitle}'],
  ['app/goal/[id].tsx', 'onPress={() => setWriteError(null)}'],
];

describe('journal / mark-create tap targets reach 44px (QC3 wave2)', () => {
  it.each(MIN_HEIGHT_TARGETS)('%s › %s declares minHeight: 44', (rel, name) => {
    const block = styleBlock(readFileSync(join(ROOT, rel), 'utf8'), name);
    // Either spelling passes: the literal, or the token the convention prefers
    // (headerControl.minTarget === 44, pinned by headerControlGeometry.test.ts).
    if (/minHeight:\s*headerControl\.minTarget/.test(block)) return;
    const m = block.match(/minHeight:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });

  // The two icon-only touchables in EntryRow (pencil = beginEdit, trash =
  // onDelete) keep hitSlop 14 deliberately: they sit in a roomy row where the
  // slop does not clip, and boxing them would push the row's siblings apart.
  it.each([
    ['edit (pencil)', 'onPress={beginEdit}'],
    ['delete (trash)', 'onPress={() => onDelete(entry.id)}'],
  ])('journal %s icon button carries hitSlop >= 14 on all sides', (_label, handler) => {
    const src = readFileSync(join(ROOT, 'app/goal/journal/[id].tsx'), 'utf8');
    const line = src.split('\n').find((l) => l.includes(handler) && l.includes('hitSlop'));
    expect(line).toBeDefined();
    const m = line!.match(
      /hitSlop=\{\{\s*top:\s*(\d+),\s*bottom:\s*(\d+),\s*left:\s*(\d+),\s*right:\s*(\d+)\s*\}\}/,
    );
    expect(m).not.toBeNull();
    for (const side of m!.slice(1)) {
      expect(Number(side)).toBeGreaterThanOrEqual(14);
    }
  });

  // Drift guard: these four were bare Text/icon children wearing hitSlop 8,
  // i.e. ~20-24pt of real target. They now carry a styled box instead, and
  // must not slide back — the box is the convention, the slop was the bug.
  it.each(BOXED_NOT_SLOPPED)('%s › %s carries a box, not hitSlop', (rel, handler) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const line = src.split('\n').find((l) => l.includes(handler));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/hitSlop/);
    expect(line).toMatch(/style=\{styles\.\w+\}/);
  });
});
