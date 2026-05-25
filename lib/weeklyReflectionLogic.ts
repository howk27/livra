import type { ReflectionTier } from './weeklyReflectionCopy';
import { getReflectionCopy } from './weeklyReflectionCopy';
import type { MarkEvent, Mark } from '../types';
import { readHealthDays } from './health/healthReader';

export function classifyMarkTier(
  markId: string,
  events: MarkEvent[],
  weekDates: string[],
  isFirstWeek: boolean,
  healthDays?: Set<string>,
): ReflectionTier {
  if (isFirstWeek) return 'first_week';

  const activeDates =
    healthDays && healthDays.size > 0
      ? healthDays
      : new Set(
          events
            .filter(
              e =>
                e.mark_id === markId &&
                !e.deleted_at &&
                e.event_type === 'increment' &&
                weekDates.includes(e.occurred_local_date),
            )
            .map(e => e.occurred_local_date),
        );

  const daysLogged = activeDates.size;
  const totalDays = weekDates.length;

  if (daysLogged === 0) return 'missing';
  if (daysLogged / totalDays >= 5 / 7) return 'strong';
  if (daysLogged / totalDays >= 3 / 7) return 'solid';
  return 'inconsistent';
}

export function isMarkFirstWeek(markCreatedAt: string, weekStart: string): boolean {
  const created = new Date(`${markCreatedAt.slice(0, 10)}T00:00:00`);
  const week = new Date(`${weekStart}T00:00:00`);
  return created >= week;
}

export type ReflectionItem = {
  mark: Mark;
  tier: ReflectionTier;
  title: string;
  body: string;
};

export async function buildReflectionItems(
  marks: Mark[],
  events: MarkEvent[],
  weekDates: string[],
  weekStart: string,
): Promise<ReflectionItem[]> {
  return Promise.all(
    marks.map(async mark => {
      let healthDays: Set<string> | undefined;

      const hkType = mark.health_kit_type;
      const hkConfig = mark.health_kit_config;

      if (hkType) {
        try {
          healthDays = await readHealthDays(
            hkType,
            weekDates,
            hkConfig ?? undefined,
          );
        } catch {
          // Health read failed — fall back to events silently
        }
      }

      const firstWeek = isMarkFirstWeek(mark.created_at, weekStart);
      const tier = classifyMarkTier(mark.id, events, weekDates, firstWeek, healthDays);
      const copy = getReflectionCopy(tier, mark.id, weekStart);
      return { mark, tier, title: copy.title, body: copy.body };
    }),
  );
}
