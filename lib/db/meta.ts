import { execute, queryFirst } from './index';

type MetaRow = {
  value: string | null;
};

export const getMetaValue = async (key: string): Promise<string | null> => {
  const row = await queryFirst<MetaRow>('SELECT value FROM lc_meta WHERE key = ?', [key]);
  return row?.value ?? null;
};

export const setMetaValue = async (key: string, value: string): Promise<void> => {
  await execute('REPLACE INTO lc_meta (key, value) VALUES (?, ?)', [key, value]);
};


