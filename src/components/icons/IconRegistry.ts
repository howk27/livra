import type { CounterIconRegistryItem, CounterType } from '../../types/counters';
import {
  MailCounterIcon,
  PlanningCounterIcon,
  FocusCounterIcon,
  TasksCounterIcon,
  LanguageCounterIcon,
  StudyCounterIcon,
  ReadingCounterIcon,
  CaloriesCounterIcon,
  SodaCounterIcon,
  RestCounterIcon,
  MeditationCounterIcon,
  SleepCounterIcon,
  GymCounterIcon,
  StepsCounterIcon,
  WaterCounterIcon,
  NoSugarCounterIcon,
  NoBeerCounterIcon,
  NoSpendingCounterIcon,
  MoodCounterIcon,
  NoSmokingCounterIcon,
  ScreenFreeCounterIcon,
  GratitudeCounterIcon,
  JournalingCounterIcon,
} from './IconSvgAssets';

export const ICON_REGISTRY: Partial<Record<CounterType, CounterIconRegistryItem>> = {
  email: {
    component: MailCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Email counter icon',
  },
  planning: {
    component: PlanningCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Planning counter icon',
  },
  focus: {
    component: FocusCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Focus counter icon',
  },
  tasks: {
    component: TasksCounterIcon,
    defaultTone: 'misc',
    ariaLabel: 'Tasks counter icon',
  },
  language: {
    component: LanguageCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Language practice counter icon',
  },
  study: {
    component: StudyCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Study counter icon',
  },
  reading: {
    component: ReadingCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Reading counter icon',
  },
  calories: {
    component: CaloriesCounterIcon,
    defaultTone: 'physical',
    ariaLabel: 'Calories burned counter icon',
  },
  soda_free: {
    component: SodaCounterIcon,
    defaultTone: 'nutrition',
    ariaLabel: 'No soda counter icon',
  },
  rest: {
    component: RestCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Rest day counter icon',
  },
  meditation: {
    component: MeditationCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Meditation counter icon',
  },
  sleep: {
    component: SleepCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Sleep counter icon',
  },
  gym: {
    component: GymCounterIcon,
    defaultTone: 'physical',
    ariaLabel: 'Gym counter icon',
  },
  steps: {
    component: StepsCounterIcon,
    defaultTone: 'physical',
    ariaLabel: 'Steps counter icon',
  },
  water: {
    component: WaterCounterIcon,
    defaultTone: 'nutrition',
    ariaLabel: 'Water intake counter icon',
  },
  no_sugar: {
    component: NoSugarCounterIcon,
    defaultTone: 'nutrition',
    ariaLabel: 'No sugar counter icon',
  },
  no_beer: {
    component: NoBeerCounterIcon,
    defaultTone: 'nutrition',
    ariaLabel: 'No beer counter icon',
  },
  no_spending: {
    component: NoSpendingCounterIcon,
    defaultTone: 'misc',
    ariaLabel: 'No spending counter icon',
  },
  mood: {
    component: MoodCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Mood counter icon',
  },
  no_smoking: {
    component: NoSmokingCounterIcon,
    defaultTone: 'physical',
    ariaLabel: 'No smoking counter icon',
  },
  screen_free: {
    component: ScreenFreeCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Screen-free counter icon',
  },
  gratitude: {
    component: GratitudeCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Gratitude counter icon',
  },
  journaling: {
    component: JournalingCounterIcon,
    defaultTone: 'mind',
    ariaLabel: 'Journaling counter icon',
  },
};

export const getIconDefinition = (type: CounterType): CounterIconRegistryItem | undefined =>
  ICON_REGISTRY[type];
