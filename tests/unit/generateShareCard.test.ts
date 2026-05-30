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
});
