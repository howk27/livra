/**
 * M9 Phase 5A follow-up — RootLayout must not call React Query hooks.
 *
 * RootLayout MOUNTS PersistQueryClientProvider, so its own body renders ABOVE
 * the provider: any useQuery-backed hook called there throws "No QueryClient
 * set" and the app crashes at boot. Task 6 shipped exactly that
 * (useMarksForUser/useGoals for the widget triggers) and every gate stayed
 * green — jest never renders RootLayout; the web viewer caught it. The hooks
 * now live in WidgetQuerySync, rendered inside the provider.
 *
 * Comment-stripped scan of the RootLayout function body only — RootNavigator
 * and WidgetQuerySync legitimately call these hooks from inside the provider.
 * Confirmed red against the crashing code before being kept.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '../../app/_layout.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const start = source.indexOf('export default function RootLayout');
const end = source.indexOf('function WidgetQuerySync');

describe('RootLayout renders above the QueryClient provider it mounts', () => {
  test('the layout file still has the expected anchors', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  test('no React Query hook is called in the RootLayout body', () => {
    const body = source.slice(start, end);
    expect(body).not.toMatch(/useMarksForUser\s*\(/);
    expect(body).not.toMatch(/\buseGoals\s*\(/);
    expect(body).not.toMatch(/\buseQuery\s*\(|\buseQueryClient\s*\(|\buseMutation\s*\(/);
  });
});
