import { badgeTestUtils } from '../../hooks/useBadges';

const {
  computeConsecutiveWithLogin,
  computeWindowProgress,
  uniqueSortedDates,
} = badgeTestUtils;

describe('Badge utility calculations', () => {
  it('computes full consecutive streak when logins align', () => {
    const dates = uniqueSortedDates(['2024-01-01', '2024-01-02', '2024-01-03']);
    const loginSet = new Set(['2024-01-01', '2024-01-02', '2024-01-03']);

    const { count, latestDate } = computeConsecutiveWithLogin(dates, loginSet);

    expect(count).toBe(3);
    expect(latestDate).toBe('2024-01-03');
  });

  it('stops consecutive streak when there is a missing login day', () => {
    const dates = uniqueSortedDates(['2024-01-01', '2024-01-02', '2024-01-03']);
    const loginSet = new Set(['2024-01-01', '2024-01-02']); // Missing 03

    const { count, latestDate } = computeConsecutiveWithLogin(dates, loginSet);

    expect(count).toBe(2);
    expect(latestDate).toBe('2024-01-02');
  });

  it('counts login-backed days inside rolling window', () => {
    const dates = uniqueSortedDates([
      '2023-12-10',
      '2023-12-20',
      '2023-12-30',
      '2024-01-05',
      '2024-01-10',
    ]);
    const loginSet = new Set([
      '2023-12-20',
      '2023-12-30',
      '2024-01-05',
      '2024-01-10',
    ]);

    const result = computeWindowProgress(dates, loginSet, 30, '2024-01-10');

    expect(result.count).toBe(4); // Excludes 12-10 (outside window)
    expect(result.lastDate).toBe('2024-01-10');
  });
});


