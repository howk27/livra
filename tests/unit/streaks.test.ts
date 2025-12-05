import { computeStreak } from '../../hooks/useStreaks';
import { CounterEvent } from '../../types';

describe('Streak Calculation', () => {
  it('should return 0 for no events', () => {
    const events: CounterEvent[] = [];
    const result = computeStreak(events);
    
    expect(result.current).toBe(0);
    expect(result.longest).toBe(0);
  });

  it('should calculate current streak correctly', () => {
    const today = new Date('2024-01-10');
    const events: CounterEvent[] = [
      {
        id: '1',
        user_id: 'test',
        counter_id: 'test',
        event_type: 'increment',
        amount: 1,
        occurred_at: new Date('2024-01-10').toISOString(),
        occurred_local_date: '2024-01-10',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_id: 'test',
        counter_id: 'test',
        event_type: 'increment',
        amount: 1,
        occurred_at: new Date('2024-01-09').toISOString(),
        occurred_local_date: '2024-01-09',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '3',
        user_id: 'test',
        counter_id: 'test',
        event_type: 'increment',
        amount: 1,
        occurred_at: new Date('2024-01-08').toISOString(),
        occurred_local_date: '2024-01-08',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const result = computeStreak(events, today);
    
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  it('should detect broken streaks', () => {
    const today = new Date('2024-01-10');
    const events: CounterEvent[] = [
      {
        id: '1',
        user_id: 'test',
        counter_id: 'test',
        event_type: 'increment',
        amount: 1,
        occurred_at: new Date('2024-01-07').toISOString(),
        occurred_local_date: '2024-01-07',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const result = computeStreak(events, today);
    
    expect(result.current).toBe(0); // More than 1 day gap
    expect(result.longest).toBeGreaterThan(0);
  });
});

