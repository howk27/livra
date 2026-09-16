import { captureRef } from 'react-native-view-shot';
import { generateShareCard } from '../../lib/sharing/generateShareCard';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('file:///tmp/share-card.jpg'),
}));

describe('generateShareCard', () => {
  it('calls captureRef with the provided ref and returns the URI', async () => {
    const fakeRef = { current: {} } as any;
    const uri = await generateShareCard(fakeRef);
    expect(captureRef).toHaveBeenCalledWith(fakeRef, {
      format: 'jpg',
      quality: 0.95,
      result: 'tmpfile',
    });
    expect(uri).toBe('file:///tmp/share-card.jpg');
  });

  it('throws if captureRef fails', async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('capture failed'));
    const fakeRef = { current: {} } as any;
    await expect(generateShareCard(fakeRef)).rejects.toThrow('capture failed');
  });

  it('passes png + pixel size through for the story card (spec 2026-09-15 §7)', async () => {
    const fakeRef = { current: {} } as any;
    await generateShareCard(fakeRef, { format: 'png', width: 1080, height: 1920 });
    expect(captureRef).toHaveBeenCalledWith(fakeRef, {
      format: 'png',
      quality: 0.95,
      result: 'tmpfile',
      width: 1080,
      height: 1920,
    });
  });

  it('never sends a half size: width without height is dropped', async () => {
    const fakeRef = { current: {} } as any;
    await generateShareCard(fakeRef, { width: 1080 });
    expect(captureRef).toHaveBeenLastCalledWith(fakeRef, {
      format: 'jpg',
      quality: 0.95,
      result: 'tmpfile',
    });
  });
});
