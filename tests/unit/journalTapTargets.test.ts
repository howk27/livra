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
const MIN_HEIGHT_TARGETS: Array<[string, string]> = [
  ['app/mark/new.tsx', 'popularChip'],
  ['app/goal/journal/[id].tsx', 'addBtn'],
  ['app/goal/journal/[id].tsx', 'entrySaveBtn'],
  ['app/goal/[id].tsx', 'journalAddBtn'],
];

describe('journal / mark-create tap targets reach 44px (QC3 wave2)', () => {
  it.each(MIN_HEIGHT_TARGETS)('%s › %s declares minHeight: 44', (rel, name) => {
    const block = styleBlock(readFileSync(join(ROOT, rel), 'utf8'), name);
    const m = block.match(/minHeight:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });

  // Scoped to the two icon-only touchables in EntryRow (pencil = beginEdit,
  // trash = onDelete). Other hitSlop=8 buttons on this screen (back arrow,
  // Cancel, Dismiss) are labeled/large and out of QC3 wave2 scope.
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
});
