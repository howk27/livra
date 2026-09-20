import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Founder 2026-09-20, on the daily reminder: "the time display there is
 * hardcoded white so it's not visible on the light theme."
 *
 * Nothing was hardcoded. The iOS spinner inside @react-native-community/
 * datetimepicker paints itself from the SYSTEM appearance, not the app's — so
 * a phone in dark mode drew white digits onto Livra's light sheet, and a phone
 * in light mode would do the reverse on a dark one. The app's theme has to be
 * handed to the native view explicitly.
 *
 * Every DateTimePicker in the repo therefore passes `themeVariant`. A new one
 * that forgets fails here rather than on someone's phone.
 */

const ROOT = join(__dirname, '../../');
const SCAN_DIRS = ['app', 'components', 'src'];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `<DateTimePicker … />` element in a file, as source text. */
function pickerElements(src: string): string[] {
  const out: string[] = [];
  const re = /<DateTimePicker\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const end = src.indexOf('/>', m.index);
    if (end === -1) continue;
    out.push(src.slice(m.index, end));
  }
  return out;
}

describe('DateTimePicker follows the APP theme, not the phone', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => ({ rel: relative(ROOT, f).split(sep).join('/'), src: stripComments(readFileSync(f, 'utf8')) }))
    .filter((f) => f.src.includes('<DateTimePicker'));

  it('finds the pickers (the guard is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap((f) => pickerElements(f.src)).length).toBeGreaterThanOrEqual(3);
  });

  it('every picker is handed themeVariant', () => {
    const offenders = files.flatMap((f) =>
      pickerElements(f.src)
        .filter((el) => !/themeVariant=/.test(el))
        .map(() => f.rel),
    );
    expect(offenders).toEqual([]);
  });
});
