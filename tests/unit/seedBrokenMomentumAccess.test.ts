jest.mock('../../lib/env', () => ({ env: { isDev: false } }));

import { seedBrokenMomentum } from '../../lib/db/devTools';

describe('seedBrokenMomentum dev-tools guard', () => {
  it('rejects when not a development build', async () => {
    await expect(seedBrokenMomentum()).rejects.toThrow(
      /"seedBrokenMomentum" is disabled outside development builds/
    );
  });
});
