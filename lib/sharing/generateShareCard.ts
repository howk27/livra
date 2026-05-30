import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export async function generateShareCard(ref: RefObject<View>): Promise<string> {
  return captureRef(ref, {
    format: 'jpg',
    quality: 0.95,
    result: 'tmpfile',
  });
}
