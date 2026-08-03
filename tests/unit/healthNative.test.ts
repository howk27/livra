import { NativeModules } from 'react-native';

/**
 * getHealthNative must survive the New Architecture, where react-native-health's
 * own export is BROKEN: its index.js copies the native module with
 * `Object.assign({}, NativeModules.AppleHealthKit, { Constants })`, and the
 * bridgeless NativeModules proxy hands back module objects whose methods do not
 * enumerate — so the copy holds ONLY `Constants`. Build 63 shipped that way
 * ("Apple Health isn't available on this device" with the pod compiled in;
 * pod install logged "Configuring the target with the New Architecture",
 * RCT_NEW_ARCH_ENABLED=1 in the Xcode log).
 *
 * Red-proven 2026-08-03: with the pre-fix healthPermissions (packaged export
 * only), 4 of these 6 fail.
 */

type HealthNativeModuleT = typeof import('../../lib/health/healthNative');
type HealthPermissionsModuleT = typeof import('../../lib/health/healthPermissions');

// What the packaged export ACTUALLY looks like on a bridgeless build: the
// enumeration copy lost every method, only the JS-side Constants survive.
const BRIDGELESS_PACKAGED_EXPORT = { Constants: { Permissions: {} } };

function loadHealthModules(opts: {
  direct?: unknown;
  packaged?: unknown;
}): { native: HealthNativeModuleT; permissions: HealthPermissionsModuleT } {
  (NativeModules as Record<string, unknown>).AppleHealthKit = opts.direct;
  let native: HealthNativeModuleT | undefined;
  let permissions: HealthPermissionsModuleT | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-health', () => opts.packaged ?? BRIDGELESS_PACKAGED_EXPORT);
    native = require('../../lib/health/healthNative');
    permissions = require('../../lib/health/healthPermissions');
  });
  jest.dontMock('react-native-health');
  return { native: native!, permissions: permissions! };
}

afterEach(() => {
  delete (NativeModules as Record<string, unknown>).AppleHealthKit;
});

describe('getHealthNative', () => {
  it('resolves the DIRECT NativeModules module when the packaged copy lost its methods (New Architecture)', () => {
    const direct = { initHealthKit: jest.fn(), getSamples: jest.fn() };
    const { native } = loadHealthModules({ direct, packaged: BRIDGELESS_PACKAGED_EXPORT });
    expect(native.getHealthNative()).toBe(direct);
  });

  it('falls back to the packaged export when NativeModules has no module (old architecture / Jest)', () => {
    const packaged = { initHealthKit: jest.fn(), Constants: {} };
    const { native } = loadHealthModules({ direct: undefined, packaged });
    expect(native.getHealthNative()).toBe(packaged);
  });

  it('returns null when neither carries initHealthKit', () => {
    const { native } = loadHealthModules({ direct: undefined, packaged: BRIDGELESS_PACKAGED_EXPORT });
    expect(native.getHealthNative()).toBeNull();
  });

  it('names both probes when unavailable, so a device toast leaves evidence', () => {
    const { native } = loadHealthModules({ direct: undefined, packaged: BRIDGELESS_PACKAGED_EXPORT });
    const detail = native.describeHealthNativeAbsence();
    expect(detail).toContain('NativeModules.AppleHealthKit=missing');
    expect(detail).toContain('Constants');
  });
});

describe('requestPermissions through the resolver', () => {
  it('reaches initHealthKit on the direct module even when the packaged export is the bridgeless husk', async () => {
    const initHealthKit = jest.fn(
      (_opts: unknown, cb: (error: string) => void) => cb(''),
    );
    const { permissions } = loadHealthModules({
      direct: { initHealthKit },
      packaged: BRIDGELESS_PACKAGED_EXPORT,
    });
    await expect(permissions.requestPermissions(['hydration'])).resolves.toBeUndefined();
    expect(initHealthKit).toHaveBeenCalledTimes(1);
    const options = initHealthKit.mock.calls[0]![0] as {
      permissions: { read: string[]; write: string[] };
    };
    expect(options.permissions.read).toEqual(['Water']);
    expect(options.permissions.write).toEqual([]);
  });

  it('still reports unavailable (with the code, carrying detail) when no module exists anywhere', async () => {
    const { permissions } = loadHealthModules({
      direct: undefined,
      packaged: BRIDGELESS_PACKAGED_EXPORT,
    });
    const err = await permissions.requestPermissions(['steps']).catch((e: unknown) => e);
    expect(permissions.isHealthUnavailable(err)).toBe(true);
    expect((err as Error).message).toContain('NativeModules.AppleHealthKit=missing');
  });
});
