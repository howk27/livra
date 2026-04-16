import { query } from '../db';

/** Same display name (case-insensitive trim), different mark ids — safe conflict signal (no merge). */
export type DuplicateMarkNameGroup = {
  normalizedName: string;
  markCount: number;
  markIds: string[];
};

export async function detectDuplicateMarkNameGroups(userId: string): Promise<DuplicateMarkNameGroup[]> {
  const rows = await query<{ id: string; name: string }>(
    'SELECT id, name FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const k = r.name.trim().toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r.id);
  }
  return Array.from(map.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([normalizedName, markIds]) => ({
      normalizedName,
      markCount: markIds.length,
      markIds,
    }));
}
