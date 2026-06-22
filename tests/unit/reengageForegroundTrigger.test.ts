import { readFileSync } from 'fs';
import { join } from 'path';

describe('re-engage foreground trigger wiring', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8');

  it('imports the owner reschedule trigger', () => {
    expect(src).toMatch(/requestLivraLocalNotificationReschedule/);
  });

  it('invokes it (foreground path)', () => {
    expect(src.match(/requestLivraLocalNotificationReschedule/g)!.length).toBeGreaterThanOrEqual(2); // import + call
  });
});
