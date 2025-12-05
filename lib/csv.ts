import { Counter, CounterEvent } from '../types';
import { formatDisplayDate, formatDisplayTime } from './date';

export const generateCounterCSV = (
  counter: Counter,
  events: CounterEvent[]
): string => {
  const header = 'Date,Time,Type,Amount,Total\n';
  
  const rows = events
    .filter((e) => !e.deleted_at)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .map((event) => {
      const date = formatDisplayDate(event.occurred_at);
      const time = formatDisplayTime(event.occurred_at);
      const type = event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1);
      const amount = event.event_type === 'reset' ? 0 : event.amount;
      
      return `${date},${time},${type},${amount}`;
    })
    .join('\n');
  
  return header + rows;
};

export const generateAllCountersCSV = (
  counters: Counter[],
  events: Map<string, CounterEvent[]>
): string => {
  // Only include essential data: Mark Name, Start Date, Total Count, Last Activity
  const header = 'Mark Name,Start Date,Total Count,Unit,Last Activity Date\n';
  
  const rows: string[] = [];
  
  counters
    .filter((counter) => !counter.deleted_at)
    .forEach((counter) => {
      const startDate = formatDisplayDate(counter.created_at);
      const lastActivity = counter.last_activity_date 
        ? formatDisplayDate(counter.last_activity_date)
        : 'Never';
      
      rows.push(
        `"${counter.name}",${startDate},${counter.total},${counter.unit},${lastActivity}`
      );
    });
  
  return header + rows.join('\n');
};

