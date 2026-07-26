import fs from 'fs';
import path from 'path';
import { HEALTH_KIT_PERMISSIONS } from '../../lib/health/healthTypes';

/**
 * Every permission we ask Apple Health for must be a name react-native-health
 * actually knows.
 *
 * This matters more than it looks. The native bridge resolves each string to an
 * HKObjectType and silently DROPS anything unrecognised — no throw, no warning,
 * no failed callback. A typo is invisible at build time, invisible at runtime,
 * and shows up only as a data source that stays empty forever. 'DietaryWater'
 * (the library's internal ObjC identifier, not its JS name) sat here doing
 * exactly that until 2026-07-25.
 *
 * So the guard reads the names out of the installed package's own type
 * definitions rather than trusting a list copied by hand.
 */
function installedPermissionNames(): Set<string> {
  const dts = fs.readFileSync(
    path.join(__dirname, '../../node_modules/react-native-health/index.d.ts'),
    'utf8',
  );
  const enumStart = dts.indexOf('enum HealthPermission');
  expect(enumStart).toBeGreaterThan(-1);
  const enumBody = dts.slice(enumStart, dts.indexOf('}', enumStart));
  const names = new Set<string>();
  for (const match of enumBody.matchAll(/^\s*(\w+)\s*=\s*'([^']+)'/gm)) {
    names.add(match[2]);
  }
  return names;
}

describe('HEALTH_KIT_PERMISSIONS', () => {
  const known = installedPermissionNames();

  it('reads a non-trivial enum out of the installed package', () => {
    expect(known.size).toBeGreaterThan(50);
  });

  it.each(Object.entries(HEALTH_KIT_PERMISSIONS))(
    '%s asks only for permissions react-native-health recognises',
    (_type, permissions) => {
      for (const permission of permissions) {
        expect(known.has(permission)).toBe(true);
      }
    },
  );

  it('hydration uses the JS name Water, never the ObjC DietaryWater', () => {
    expect(HEALTH_KIT_PERMISSIONS.hydration).toEqual(['Water']);
    expect(known.has('DietaryWater')).toBe(false);
  });

  it('every mark type asks for at least one permission', () => {
    for (const [type, permissions] of Object.entries(HEALTH_KIT_PERMISSIONS)) {
      expect(permissions.length).toBeGreaterThan(0);
      expect(type).toBeTruthy();
    }
  });
});
