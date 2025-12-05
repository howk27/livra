import { Counter, CounterEvent, CounterStreak } from '../types';
import { formatDisplayDate } from './date';

// Simple PDF generation - for V1 we'll use HTML to PDF conversion
// or a simple text-based PDF library. For now, this is a placeholder
// that formats the data for PDF export.

export const generateCounterPDF = (
  counter: Counter,
  events: CounterEvent[],
  streak?: CounterStreak
): string => {
  const title = `${counter.emoji || '📊'} ${counter.name}`;
  const total = `Total: ${counter.total} ${counter.unit}`;
  const lastActivity = counter.last_activity_date
    ? `Last Activity: ${formatDisplayDate(counter.last_activity_date)}`
    : 'No activity yet';
  
  const streakInfo = streak
    ? `Current Streak: ${streak.current_streak} days • Longest: ${streak.longest_streak} days`
    : '';
  
  const recentEvents = events
    .filter((e) => !e.deleted_at)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 20)
    .map((e) => `${formatDisplayDate(e.occurred_at)} - ${e.event_type} (${e.amount})`)
    .join('\n');
  
  return `
${title}
${'='.repeat(50)}

${total}
${lastActivity}
${streakInfo}

Recent Activity:
${recentEvents}

Generated on ${formatDisplayDate(new Date())}
  `.trim();
};

// In a real implementation, you'd use a library like react-native-html-to-pdf
// or convert this to a proper PDF format

