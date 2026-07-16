import { Platform } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import SharedGroupPreferences from 'react-native-shared-group-preferences';
import {
  drainPendingWidgetLogs,
  readPendingWidgetLogs,
  clearPendingWidgetLogs,
} from '../../lib/widgets/widgetLogQueue';
import { APP_GROUP_ID, PENDING_LOGS_KEY } from '../../lib/widgets/widgetTypes';

const prefs = SharedGroupPreferences as jest.Mocked<typeof SharedGroupPreferences>;

const setIOS = () => Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
const setAndroid = () => Object.defineProperty(Platform, 'OS', { get: () => 'android' });

beforeEach(() => {
  jest.clearAllMocks();
  setIOS();
});

describe('readPendingWidgetLogs', () => {
  it('parses a JSON string array from the App Group', async () => {
    prefs.getItem.mockResolvedValueOnce(
      JSON.stringify([{ markId: 'a', at: 1 }, { markId: 'b', at: 2 }]),
    );
    const logs = await readPendingWidgetLogs();
    expect(prefs.getItem).toHaveBeenCalledWith(PENDING_LOGS_KEY, APP_GROUP_ID);
    expect(logs.map((l) => l.markId)).toEqual(['a', 'b']);
  });

  it('tolerates an already-parsed array (auto-parsing bridge)', async () => {
    prefs.getItem.mockResolvedValueOnce([{ markId: 'x', at: 9 }] as never);
    const logs = await readPendingWidgetLogs();
    expect(logs.map((l) => l.markId)).toEqual(['x']);
  });

  it('returns [] for garbage / empty / malformed entries', async () => {
    prefs.getItem.mockResolvedValueOnce('not json');
    expect(await readPendingWidgetLogs()).toEqual([]);
    prefs.getItem.mockResolvedValueOnce('');
    expect(await readPendingWidgetLogs()).toEqual([]);
    prefs.getItem.mockResolvedValueOnce(JSON.stringify([{ nope: 1 }, { markId: '' }]));
    expect(await readPendingWidgetLogs()).toEqual([]);
  });

  it('returns [] on non-iOS without touching the native module', async () => {
    setAndroid();
    expect(await readPendingWidgetLogs()).toEqual([]);
    expect(prefs.getItem).not.toHaveBeenCalled();
  });
});

describe('drainPendingWidgetLogs', () => {
  it('applies each queued mark in order and clears the queue', async () => {
    prefs.getItem.mockResolvedValueOnce(
      JSON.stringify([{ markId: 'm1', at: 1 }, { markId: 'm2', at: 2 }]),
    );
    const applied: string[] = [];
    const count = await drainPendingWidgetLogs(async (id) => {
      applied.push(id);
    });
    expect(count).toBe(2);
    expect(applied).toEqual(['m1', 'm2']);
    expect(prefs.setItem).toHaveBeenCalledWith(PENDING_LOGS_KEY, '[]', APP_GROUP_ID);
  });

  it('clears the queue before applying (at-most-once)', async () => {
    prefs.getItem.mockResolvedValueOnce(JSON.stringify([{ markId: 'm1', at: 1 }]));
    const order: string[] = [];
    prefs.setItem.mockImplementationOnce(async () => {
      order.push('clear');
    });
    await drainPendingWidgetLogs(async () => {
      order.push('apply');
    });
    expect(order).toEqual(['clear', 'apply']);
  });

  it('keeps going when one mark fails and counts only successes', async () => {
    prefs.getItem.mockResolvedValueOnce(
      JSON.stringify([{ markId: 'ok1', at: 1 }, { markId: 'bad', at: 2 }, { markId: 'ok2', at: 3 }]),
    );
    const applied: string[] = [];
    const count = await drainPendingWidgetLogs(async (id) => {
      if (id === 'bad') throw new Error('mark not found');
      applied.push(id);
    });
    expect(count).toBe(2);
    expect(applied).toEqual(['ok1', 'ok2']);
  });

  it('is a no-op when the queue is empty', async () => {
    prefs.getItem.mockResolvedValueOnce('[]');
    const apply = jest.fn();
    const count = await drainPendingWidgetLogs(apply);
    expect(count).toBe(0);
    expect(apply).not.toHaveBeenCalled();
    expect(prefs.setItem).not.toHaveBeenCalled();
  });

  it('is a no-op on non-iOS', async () => {
    setAndroid();
    const apply = jest.fn();
    const count = await drainPendingWidgetLogs(apply);
    expect(count).toBe(0);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('clearPendingWidgetLogs', () => {
  it('writes an empty array to the App Group', async () => {
    await clearPendingWidgetLogs();
    expect(prefs.setItem).toHaveBeenCalledWith(PENDING_LOGS_KEY, '[]', APP_GROUP_ID);
  });
});
