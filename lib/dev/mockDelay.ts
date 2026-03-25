import { assertDevToolsAccess } from './access';

type MockDelayOptions = {
  minMs?: number;
  maxMs?: number;
};

export const mockDelay = async (options: MockDelayOptions | number = {}): Promise<void> => {
  assertDevToolsAccess('mockDelay');
  const resolved = typeof options === 'number' ? { minMs: options, maxMs: options } : options;
  const min = Math.max(0, resolved.minMs ?? 150);
  const max = Math.max(min, resolved.maxMs ?? 600);
  const delay = Math.floor(min + Math.random() * (max - min));
  await new Promise(resolve => setTimeout(resolve, delay));
};
