import React from 'react';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';
import { DEFAULT_ICON_SIZE, ICON_STROKE_WIDTH } from './IconTokens';
import type { CounterSymbolProps } from '../../types/counters';
import { ContentGroup } from './IconContentGroup';

export interface PrimitiveProps {
  color: string;
  strokeWidth: number;
}

export const StepSolePrimitive: React.FC<PrimitiveProps> = ({ color, strokeWidth }) => (
  <Path
    d="M9.2 1.2C7.8 1.2 6.6 2.4 6.6 3.9v4.6c0 0.8 0.2 1.7 0.5 2.4l1 2.3c0.4 0.9 1.2 1.4 2.2 1.4s1.8-0.5 2.2-1.4l1-2.3c0.3-0.7 0.5-1.6 0.5-2.4V3.9c0-1.5-1.2-2.7-2.6-2.7H9.2z"
    fill={color}
    fillOpacity={0.18}
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export const MotionDashGroup: React.FC<PrimitiveProps> = ({ color, strokeWidth }) => (
  <>
    <Line x1="2" y1="4.2" x2="4.4" y2="3.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Line x1="1.6" y1="7.4" x2="3.8" y2="6.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </>
);

export const DumbbellPlatePrimitive: React.FC<PrimitiveProps & { x: number }> = ({ color, strokeWidth, x }) => (
  <Rect
    x={x}
    y={4}
    width={3.6}
    height={8}
    rx={1.5}
    fill={color}
    fillOpacity={0.2}
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinejoin="round"
  />
);

export const DumbbellGripPrimitive: React.FC<PrimitiveProps> = ({ color, strokeWidth }) => (
  <Rect
    x={6.2}
    y={6}
    width={4.8}
    height={4}
    rx={1.2}
    fill={color}
    fillOpacity={0.24}
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinejoin="round"
  />
);

export const DumbbellBarPrimitive: React.FC<PrimitiveProps> = ({ color, strokeWidth }) => (
  <Path d="M4.4 8h7.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
);

export const StepsIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <MotionDashGroup color={color} strokeWidth={normalizedStroke} />
          <G transform="translate(4 0)">
            <StepSolePrimitive color={color} strokeWidth={normalizedStroke} />
          </G>
        </>
      )}
    </ContentGroup>
  </Svg>
);

export const GymIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <DumbbellPlatePrimitive x={1.2} color={color} strokeWidth={normalizedStroke} />
          <DumbbellPlatePrimitive x={11} color={color} strokeWidth={normalizedStroke} />
          <DumbbellBarPrimitive color={color} strokeWidth={normalizedStroke} />
          <DumbbellGripPrimitive color={color} strokeWidth={normalizedStroke} />
        </>
      )}
    </ContentGroup>
  </Svg>
);

export const SodaFreeIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <Path
            d="M4.5 2.4h5.2l0.5-1.4"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M5.3 4.2h7.6l-0.8 7.6c-0.1 0.9-0.9 1.6-1.8 1.6H7.9c-0.9 0-1.7-0.7-1.8-1.6L5.3 4.2Z"
            fill={color}
            fillOpacity={0.18}
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinejoin="round"
          />
          <Path
            d="M11.2 4.2v-1.2c0-0.7 0.6-1.2 1.2-1.2h0.3"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
          <Line
            x1="3.6"
            y1="12.2"
            x2="14.6"
            y2="1.2"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
        </>
      )}
    </ContentGroup>
  </Svg>
);

export const WaterIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <Path
            d="M9 1.4c0 0-4 5-4 8.2 0 2.7 2.1 4.8 4.8 4.8s4.8-2.1 4.8-4.8C14.6 6.4 10.6 1.4 10.6 1.4c-0.4-0.5-1.2-0.5-1.6 0Z"
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinejoin="round"
          />
          <Path
            d="M11.4 6.2c0.8 1.2 1.2 2.1 1.2 3 0 1.6-1.2 2.8-2.8 2.8"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
        </>
      )}
    </ContentGroup>
  </Svg>
);

export const ReadingIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <Path
            d="M2.6 4.2c0.8-0.4 1.8-0.6 2.8-0.6 1 0 2 0.2 2.8 0.6v7.4c-0.8-0.4-1.8-0.6-2.8-0.6-1 0-2 0.2-2.8 0.6V4.2Z"
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinejoin="round"
          />
          <Path
            d="M8.2 4.2c0.8-0.4 1.8-0.6 2.8-0.6s2 0.2 2.8 0.6v7.4c-0.8-0.4-1.8-0.6-2.8-0.6s-2 0.2-2.8 0.6V4.2Z"
            fill={color}
            fillOpacity={0.12}
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinejoin="round"
          />
          <Path
            d="M10.9 2.8v7.2"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
          <Path
            d="M5.4 2.8v7.2"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
          <Path
            d="M8.2 6.2h2.8"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
          />
        </>
      )}
    </ContentGroup>
  </Svg>
);

export const SleepIcon: React.FC<CounterSymbolProps> = ({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE_WIDTH,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img">
    <ContentGroup strokeWidth={strokeWidth}>
      {(normalizedStroke) => (
        <>
          <Path
            d="M11.8 2.2c-0.6 0-1.2 0.1-1.7 0.3 1.9 1 3.2 3 3.2 5.3s-1.3 4.3-3.2 5.3c0.5 0.2 1.1 0.3 1.7 0.3 3 0 5.4-2.4 5.4-5.4s-2.4-5.5-5.4-5.5Z"
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinejoin="round"
          />
          <Path
            d="M5.6 4.2l1.4 0.4L5.8 6"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M7 6.6l1.2 0.3-1 0.9"
            stroke={color}
            strokeWidth={normalizedStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </ContentGroup>
  </Svg>
);



