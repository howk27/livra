export type ReflectionTier = 'strong' | 'solid' | 'inconsistent' | 'missing' | 'first_week';

type TierCopy = { title: string; body: string };

const TIER_COPY: Record<ReflectionTier, TierCopy[]> = {
  strong: [
    { title: 'Strong.', body: 'You showed up most days. This is how habits lock in.' },
    { title: 'Locked in.', body: "Consistent presence this week. That's the whole game." },
    { title: 'This week worked.', body: 'Most days logged. That kind of consistency compounds.' },
  ],
  solid: [
    { title: 'Solid week.', body: "Not perfect, but real. A few more weeks like this and it sticks." },
    { title: 'Building rhythm.', body: "You showed up more than you didn't. Keep building on that." },
  ],
  inconsistent: [
    { title: 'Needs more.', body: "You showed up some days, more than nothing. But you know you can do more." },
    { title: 'Uneven week.', body: 'Hit-or-miss. Reset Monday and pick one day to protect first.' },
  ],
  missing: [
    { title: "It didn't happen.", body: 'This mark got skipped this week. Monday is the reset.' },
    { title: 'No movement here.', body: "Zero this week. It's not too late to start over. Start Monday." },
  ],
  first_week: [
    { title: 'First week.', body: "The hardest part is starting. You did that. Stack another week." },
    { title: 'You started.', body: 'First week with this mark. Build on it.' },
  ],
};

function seedIndex(weekStart: string, markId: string, poolSize: number): number {
  const seed = `${weekStart}:${markId}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % poolSize;
}

export function getReflectionCopy(
  tier: ReflectionTier,
  markId: string,
  weekStart: string,
): TierCopy {
  const pool = TIER_COPY[tier];
  return pool[seedIndex(weekStart, markId, pool.length)]!;
}
