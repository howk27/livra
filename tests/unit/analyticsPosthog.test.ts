jest.mock('posthog-react-native', () => {
  return jest.fn().mockImplementation(() => ({
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    register: jest.fn(),
  }));
});

jest.mock('../../lib/env', () => ({
  env: {
    isDev: false,
    posthogApiKey: null as string | null,
    posthogHost: 'https://us.i.posthog.com',
  },
}));

type Loaded = {
  posthog: typeof import('../../lib/analytics/posthog');
  PostHogMock: jest.Mock;
  env: typeof import('../../lib/env')['env'];
};

/** Isolated require so each test gets its own module-level client/initAttempted state. */
function load(apiKey: string | null): Loaded {
  let result!: Loaded;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const envModule = require('../../lib/env');
    envModule.env.posthogApiKey = apiKey;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PostHogMock = require('posthog-react-native');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const posthog = require('../../lib/analytics/posthog');
    result = { posthog, PostHogMock, env: envModule.env };
  });
  return result;
}

describe('lib/analytics/posthog', () => {
  it('is disabled and never constructs a client with no API key', () => {
    const { posthog, PostHogMock } = load(null);

    expect(posthog.isAnalyticsEnabled()).toBe(false);
    expect(posthog.initAnalytics()).toBeNull();
    expect(PostHogMock).not.toHaveBeenCalled();

    // No-ops, must not throw
    expect(() => posthog.capture('mark_logged', { mark_id: 'm1' })).not.toThrow();
    expect(() => posthog.identify('u1')).not.toThrow();
    expect(() => posthog.resetAnalytics()).not.toThrow();
  });

  it('constructs exactly one client and forwards capture/identify/reset when a key is configured', () => {
    const { posthog, PostHogMock } = load('phc_test');

    expect(posthog.isAnalyticsEnabled()).toBe(true);
    const client = posthog.initAnalytics();
    expect(PostHogMock).toHaveBeenCalledTimes(1);
    expect(PostHogMock).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://us.i.posthog.com' }),
    );

    // Registers super-properties so app/web + env can be split in one project.
    expect(client!.register).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'app', environment: expect.any(String) }),
    );

    // Every event must name the JS bundle that produced it. Without this the
    // question "did the OTA reach the device" is unanswerable from the data,
    // which is exactly what stalled the 2026-09-06 weekly-review investigation.
    expect(client!.register).toHaveBeenCalledWith(
      expect.objectContaining({
        update_id: 'test-update-id',
        update_channel: 'production',
        runtime_version: 'exposdk:56.0.0',
        is_embedded_launch: false,
        is_emergency_launch: false,
        updates_enabled: true,
      }),
    );

    // Idempotent: calling init again does not construct a second client
    posthog.initAnalytics();
    expect(PostHogMock).toHaveBeenCalledTimes(1);

    posthog.capture('goal_created', { goal_id: 'g1' });
    expect(client!.capture).toHaveBeenCalledWith('goal_created', { goal_id: 'g1' });

    posthog.identify('u1', { plan: 'free' });
    expect(client!.identify).toHaveBeenCalledWith('u1', { plan: 'free' });

    posthog.resetAnalytics();
    expect(client!.reset).toHaveBeenCalledTimes(1);

    expect(posthog.getAnalyticsClient()).toBe(client);
  });

  it('still registers and returns a client when the update identity cannot be read', () => {
    // expo-updates is native-backed: it is a stub on web and can throw where
    // updates are not configured. A diagnostic must never be the reason
    // analytics stops working.
    let client: ReturnType<typeof import('../../lib/analytics/posthog').initAnalytics>;
    jest.isolateModules(() => {
      jest.doMock('expo-updates', () => ({
        get isEnabled(): boolean {
          throw new Error('updates not configured');
        },
        get updateId(): string | null {
          throw new Error('updates not configured');
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const envModule = require('../../lib/env');
      envModule.env.posthogApiKey = 'phc_test';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const posthog = require('../../lib/analytics/posthog');
      client = posthog.initAnalytics();
      expect(client).not.toBeNull();
      expect(client!.register).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'app' }),
      );
    });
    jest.dontMock('expo-updates');
  });

  it('swallows a throwing capture instead of crashing the caller', () => {
    const { posthog, PostHogMock } = load('phc_test');
    PostHogMock.mockImplementationOnce(() => ({
      capture: jest.fn(() => { throw new Error('network down'); }),
      identify: jest.fn(),
      reset: jest.fn(),
      register: jest.fn(),
    }));
    posthog.initAnalytics();
    expect(() => posthog.capture('mark_logged')).not.toThrow();
  });
});
