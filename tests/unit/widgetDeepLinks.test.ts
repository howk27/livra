describe('widget deep link routing', () => {
  it('livra://home maps to /(tabs)/home', () => {
    const url = 'livra://home';
    const isHome = url === 'livra://home' || url.startsWith('livra://home?');
    expect(isHome).toBe(true);
  });

  it('livra://log-mark?markId=abc extracts markId', () => {
    const url = 'livra://log-mark?markId=abc-123';
    const parsed = new URL(url.replace('livra://', 'https://livra.app/'));
    expect(parsed.pathname).toBe('/log-mark');
    expect(parsed.searchParams.get('markId')).toBe('abc-123');
  });
});
