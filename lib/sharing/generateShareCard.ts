import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export type ShareCaptureOptions = {
  /** jpg for the legacy goal card; png for the story card (flat tints and
   *  1pt hairlines on a dark ground band visibly in JPEG). */
  format?: 'jpg' | 'png';
  quality?: number;
  /** Output pixel size. view-shot rasterises at this size regardless of the
   *  view's on-screen scale, so a scaled-down preview still exports full-res.
   *  Both or neither: a lone width would distort. */
  width?: number;
  height?: number;
};

export async function generateShareCard(
  ref: RefObject<View>,
  options: ShareCaptureOptions = {},
): Promise<string> {
  const { format = 'jpg', quality = 0.95, width, height } = options;
  const size = width != null && height != null ? { width, height } : {};
  return captureRef(ref, {
    format,
    quality,
    result: 'tmpfile',
    ...size,
  });
}
