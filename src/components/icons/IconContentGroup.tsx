import React from 'react';
import { G } from 'react-native-svg';
import { DEFAULT_ICON_SIZE, ICON_PADDING_RATIO } from './IconTokens';

type ContentGroupProps = {
  strokeWidth: number;
  children: (normalizedStroke: number) => React.ReactNode;
  canvasSize?: number;
};

const clampStrokeWidth = (value: number) => Math.max(1.8, Math.min(value, 3));
const CONTENT_GRID = 16;

export const ContentGroup: React.FC<ContentGroupProps> = ({
  strokeWidth,
  children,
  canvasSize = DEFAULT_ICON_SIZE,
}) => {
  const inset = ICON_PADDING_RATIO * canvasSize;
  const scale = (canvasSize - inset * 2) / CONTENT_GRID;
  const normalizedStroke = clampStrokeWidth(strokeWidth) / scale;

  return (
    <G transform={`translate(${inset} ${inset}) scale(${scale})`}>
      {children(normalizedStroke)}
    </G>
  );
};


