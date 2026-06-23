import * as copy from '../../lib/copy';

describe('dead streak-era copy is removed', () => {
  it.each([
    'getDailyHeader',
    'getWeekArc',
    'getPostLogMessage',
    'getWeekSentimentHeader',
  ])('%s is no longer exported', (name) => {
    expect((copy as Record<string, unknown>)[name]).toBeUndefined();
  });
});
