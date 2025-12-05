import type { ComponentType } from 'react';

export type MarkType =
  | 'email'
  | 'planning'
  | 'focus'
  | 'tasks'
  | 'language'
  | 'study'
  | 'reading'
  | 'calories'
  | 'soda_free'
  | 'rest'
  | 'meditation'
  | 'sleep'
  | 'gym'
  | 'steps'
  | 'water'
  | 'no_sugar'
  | 'no_beer'
  | 'no_spending'
  | 'mood'
  | 'no_smoking'
  | 'screen_free'
  | 'gratitude'
  | 'journaling'
  | 'custom';

export type MarkTone = 'physical' | 'nutrition' | 'mind' | 'misc';

export type MarkIconVariant = 'symbol' | 'withBackground';

export type MarkIconAnimation = 'none' | 'increment' | 'streak';

export interface MarkSymbolProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export interface MarkIconRegistryItem {
  component: ComponentType<MarkSymbolProps>;
  defaultTone: MarkTone;
  ariaLabel: string;
}


