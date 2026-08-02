/**
 * M9 Phase 6 T4 — a reset session cannot reach the tabs without setting a
 * password.
 *
 * The traced defect: the reset link's recovery session was a FULL session,
 * and app/index.tsx routed it into the tabs on relaunch — anyone holding the
 * emailed link owned the account without ever proving a password. The leash:
 * armed in _layout after setSession, enforced in index.tsx before any tab
 * redirect, cleared only after updateUser({ password }) succeeds.
 *
 * Part behavior (the module), part comment-stripped wiring scan (the three
 * enforcement points cannot silently unwire). Confirmed red pre-fix.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RECOVERY_PENDING_STORAGE_KEY,
  markRecoveryPending,
  clearRecoveryPending,
  isRecoveryPending,
  __resetRecoveryPendingForTests,
} from '../../lib/auth/recoveryPending';
import { ACCOUNT_SCOPED_STORAGE_KEYS } from '../../lib/purgeLocalUserData';

const strip = (rel: string) =>
  readFileSync(join(__dirname, '../../', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

beforeEach(async () => {
  __resetRecoveryPendingForTests();
  await AsyncStorage.clear();
});

describe('the leash itself', () => {
  it('arms, persists, and survives an in-memory reset (relaunch shape)', async () => {
    await markRecoveryPending();
    __resetRecoveryPendingForTests();
    expect(await isRecoveryPending()).toBe(true);
  });

  it('clears fully — memory and disk', async () => {
    await markRecoveryPending();
    await clearRecoveryPending();
    __resetRecoveryPendingForTests();
    expect(await isRecoveryPending()).toBe(false);
    expect(await AsyncStorage.getItem(RECOVERY_PENDING_STORAGE_KEY)).toBeNull();
  });

  it('is not pending on a fresh device', async () => {
    expect(await isRecoveryPending()).toBe(false);
  });

  it('dies with the session: the key is purge-registered', () => {
    expect(ACCOUNT_SCOPED_STORAGE_KEYS).toContain(RECOVERY_PENDING_STORAGE_KEY);
  });

  // QC-1061 item 2. The screen always had three exits; none of them moved the
  // STATE behind the screen. A recovery link mints a full session, so backing
  // out left the user authenticated with the leash still armed — every route
  // through `/` bounced them back, which is the "can't back out or cancel
  // anything" report. Abandoning the reset has to end the session, because the
  // leash's whole invariant is that it dies with the session it leashes.
  it('every abandon exit signs out; only the post-update path goes straight to sign-in', () => {
    const src = strip('app/auth/reset-password-complete.tsx');

    const straightToSignIn = src.match(/router\.replace\('\/auth\/signin'\)/g) ?? [];
    expect(straightToSignIn).toHaveLength(1);
    // ...and that one is the success path, after the leash is off.
    expect(src).toMatch(
      /clearRecoveryPending\(\)[\s\S]{0,400}?router\.replace\('\/auth\/signin'\)/,
    );

    // All three back-outs — the back arrow, the invalid-link exit and the
    // form's cancel — go through ONE shared handler, so count the call sites
    // rather than the route literal (counting the literal would read 1 and
    // pass for the wrong reason if two of the three were reverted).
    const abandonCallSites = src.match(/onPress=\{abandonReset\}/g) ?? [];
    expect(abandonCallSites).toHaveLength(3);

    // ...and that handler is the one that ends the session.
    expect(src).toMatch(
      /const abandonReset = useCallback\(\(\) => \{\s*router\.replace\('\/auth\/signing-out'\)/,
    );
  });
});

describe('the three enforcement points stay wired', () => {
  it('_layout arms the leash on the recovery setSession success path', () => {
    const layout = strip('app/_layout.tsx');
    expect(layout).toMatch(
      /await markRecoveryPending\(\);?[\s\S]{0,200}router\.replace\(\s*'\/auth\/reset-password-complete'/,
    );
  });

  it('index.tsx consults the leash BEFORE any tab redirect, and unknown blocks', () => {
    const index = strip('app/index.tsx');
    const gate = index.indexOf('recoveryPending');
    const tabs = index.indexOf('/(tabs)/focus');
    expect(gate).toBeGreaterThan(-1);
    expect(tabs).toBeGreaterThan(gate);
    expect(index).toMatch(/recoveryPending === null[\s\S]{0,120}LoadingScreen/);
    expect(index).toMatch(/if \(recoveryPending\)[\s\S]{0,120}reset-password-complete/);
  });

  it('a widget deep link cannot reach the tabs while recovery is pending (the bypass)', () => {
    // T4 security Critical: isWidgetHome/isWidgetLogMark route to the tabs on
    // EVERY url event, before the reset gate — ungated, livra://home walked a
    // recovery session straight past the leash. The gate must sit between the
    // widget-branch declarations and the first tab replace.
    const layout = strip('app/_layout.tsx');
    expect(layout).toMatch(
      /const isWidgetLogMark[\s\S]{0,600}isRecoveryPending\(\)[\s\S]{0,200}reset-password-complete[\s\S]{0,800}if \(isWidgetHome\)/,
    );
  });

  it('a persist failure is retried before the leash trusts memory alone', async () => {
    // Manual swap, NEVER spyOn/mockRestore on the shared AsyncStorage mock —
    // restore strips its implementation for every later test (decisions.md
    // 2026-07-31 d, learned the hard way).
    const original = AsyncStorage.setItem;
    let calls = 0;
    AsyncStorage.setItem = ((key: string, value: string) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('disk full'));
      return original(key, value);
    }) as typeof AsyncStorage.setItem;
    try {
      await markRecoveryPending();
    } finally {
      AsyncStorage.setItem = original;
    }
    expect(calls).toBe(2);
    // The retry landed: a relaunch-shaped read still finds the flag.
    __resetRecoveryPendingForTests();
    expect(await isRecoveryPending()).toBe(true);
  });

  it('reset-password-complete clears the leash only on the update success path', () => {
    const screen = strip('app/auth/reset-password-complete.tsx');
    expect(screen).toMatch(
      /if \(updateError\)[\s\S]{0,700}clearRecoveryPending\(\)[\s\S]{0,300}router\.replace\(\s*'\/auth\/signin'/,
    );
    expect((screen.match(/clearRecoveryPending\(\)/g) ?? []).length).toBe(1);
  });
});
