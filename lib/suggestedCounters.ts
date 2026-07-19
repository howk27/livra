import {
  MoonStarsIcon, BarbellIcon, FootprintsIcon, PersonSimpleRunIcon,
  PersonSimpleIcon, WavesIcon, BicycleIcon, DropIcon, ForkKnifeIcon,
  ProhibitIcon, FireIcon, BrainIcon, NotePencilIcon,
  HandHeartIcon, WindIcon, TargetIcon,
  CalendarCheckIcon, BookOpenTextIcon, MetronomeIcon,
  HourglassIcon, GraduationCapIcon, WalletIcon, PiggyBankIcon,
  TrendUpIcon, BriefcaseIcon, ShowerIcon,
  CakeIcon, MonitorIcon, CookingPotIcon, UsersThreeIcon,
  HouseIcon, HandshakeIcon, HeartIcon, PaintBrushIcon,
  CurrencyCircleDollarIcon,
  PenNibIcon, GlobeSimpleIcon, BowlFoodIcon,
  CigaretteIcon, CoffeeIcon, SparkleIcon,
} from 'phosphor-react-native';

export type MarkDefinition = {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  emoji: string;
  /** One plain sentence: what this mark tracks and what counts as a check-in. */
  description: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
  category: string;
  tags: string[];
  healthKitType: string | null;
  frequency_min: number;
  frequency_recommended: number;
  frequency_max: number;
  frequencyKind: 'variable' | 'fixed' | 'abstinence';
  /** Hero-step time gating (spec 2026-07-11). Absent = anytime. */
  timeAffinity?: 'daytime' | 'evening';
};

export type MarkCategory = {
  title: string;
  marks: MarkDefinition[];
};

export const MARK_LIBRARY: MarkDefinition[] = [
  // RECOVERY
  {
    id: 'sleep', name: 'Sleep', icon: MoonStarsIcon, emoji: '🌙', timeAffinity: 'evening',
    description: 'Nights you get the sleep you planned for; check in the morning after.',
    color: '#7B9EA6', unit: 'days', category: 'Recovery',
    tags: ['sleep', 'recovery', 'energy', 'marathon', 'performance', 'insomnia', 'rest', 'fatigue', 'tired', 'endurance', 'health', 'athlete'],
    healthKitType: 'sleep',
    frequency_min: 7, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'fixed',
  },
  {
    id: 'stretch', name: 'Stretch', icon: PersonSimpleIcon, emoji: '🧘',
    description: 'Sessions spent stretching or working on mobility, however short.',
    color: '#7B9EA6', unit: 'sessions', category: 'Recovery',
    tags: ['flexibility', 'mobility', 'recovery', 'injury', 'yoga', 'marathon', 'run', 'athlete', 'posture', 'soreness', 'tightness'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },

  // FITNESS
  {
    id: 'workout', name: 'Workout', icon: BarbellIcon, emoji: '🏋️', timeAffinity: 'daytime',
    description: 'Any training session you set out to do, from a full gym session to a circuit at home.',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['fitness', 'strength', 'muscle', 'gym', 'marathon', 'lose weight', 'bulk', 'tone', 'training', 'athlete', 'body', 'health', 'endurance', 'triathlon'],
    healthKitType: 'workout',
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
  {
    id: 'steps', name: 'Steps', icon: FootprintsIcon, emoji: '👣', timeAffinity: 'daytime',
    description: 'Days you reach the step target you set, counted from your phone or watch.',
    color: '#8A7E6B', unit: 'items', category: 'Fitness',
    tags: ['steps', 'walk', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'active', 'movement', 'walking', 'running', 'weight loss'],
    healthKitType: 'steps',
    frequency_min: 5, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'run', name: 'Run', icon: PersonSimpleRunIcon, emoji: '🏃', timeAffinity: 'daytime',
    description: 'Each run you complete, whatever the distance or pace.',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['running', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'jogging', 'endurance', 'triathlon', 'speed', 'pace'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
  {
    id: 'swim', name: 'Swim', icon: WavesIcon, emoji: '🏊', timeAffinity: 'daytime',
    description: 'Each swim, counted once you are out of the water.',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['swimming', 'triathlon', 'endurance', 'cardio', 'marathon', 'weight loss', 'low impact', 'fitness', 'athlete', 'laps'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
  {
    id: 'cycling', name: 'Cycling', icon: BicycleIcon, emoji: '🚴', timeAffinity: 'daytime',
    description: 'Each ride you complete, indoors or out.',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['cycling', 'bike', 'triathlon', 'cardio', 'endurance', 'weight loss', 'commute', 'fitness', 'spin', 'race'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },

  // HEALTH
  {
    id: 'water', name: 'Water', icon: DropIcon, emoji: '💧',
    description: 'Days you drink the amount of water you were aiming for.',
    color: '#6B9E8A', unit: 'items', category: 'Health',
    tags: ['hydration', 'water', 'health', 'weight loss', 'energy', 'skin', 'detox', 'marathon', 'performance', 'kidney'],
    healthKitType: null,
    frequency_min: 5, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'nutrition', name: 'Nutrition', icon: ForkKnifeIcon, emoji: '🥗',
    description: 'Days your eating went the way you planned, checked at the day\'s end.',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['diet', 'eat clean', 'nutrition', 'weight loss', 'meal prep', 'health', 'muscle', 'performance', 'food', 'body'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'calories', name: 'Calories', icon: FireIcon, emoji: '🔥',
    description: 'Days you stay inside the calorie range you set.',
    color: '#6B9E8A', unit: 'items', category: 'Health',
    tags: ['calories', 'weight loss', 'diet', 'cut', 'bulk', 'nutrition', 'food', 'macro', 'fitness', 'body composition'],
    healthKitType: null,
    frequency_min: 5, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'no-alcohol', name: 'No Alcohol', icon: ProhibitIcon, emoji: '🚫',
    description: 'Days you go without alcohol.',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['sober', 'sobriety', 'dry january', 'alcohol', 'drinking', 'liver', 'health', 'sleep', 'discipline', 'addiction', 'quit'],
    healthKitType: null,
    frequency_min: 7, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'abstinence',
  },
  {
    id: 'meal-prep', name: 'Meal Prep', icon: BowlFoodIcon, emoji: '🍱',
    description: 'Each session spent preparing meals ahead of time.',
    color: '#6B9E8A', unit: 'sessions', category: 'Health',
    tags: ['meal prep', 'diet', 'nutrition', 'weight loss', 'cooking', 'food', 'healthy eating', 'discipline', 'budget', 'prep'],
    healthKitType: null,
    frequency_min: 1, frequency_recommended: 2, frequency_max: 3, frequencyKind: 'variable',
  },
  {
    id: 'no-nicotine', name: 'No Nicotine', icon: CigaretteIcon, emoji: '🚭',
    description: 'Days you go without nicotine, whether cigarettes, vapes, or pouches.',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['smoking', 'vaping', 'quit', 'cigarettes', 'nicotine', 'tobacco', 'vape', 'sober', 'cravings', 'lungs'],
    healthKitType: null,
    frequency_min: 7, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'abstinence',
  },
  {
    id: 'no-caffeine', name: 'Cut Caffeine', icon: CoffeeIcon, emoji: '☕',
    description: 'Days you kept caffeine to the limit you set for yourself.',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['caffeine', 'coffee', 'energy drink', 'cut', 'reduce', 'jitters', 'sleep', 'anxiety', 'quit'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'skincare', name: 'Skincare', icon: SparkleIcon, emoji: '🧴',
    description: 'Days you did the skincare routine you planned.',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['skin', 'skincare', 'acne', 'routine', 'face', 'complexion', 'glow', 'moisturize', 'clear skin'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },

  // MINDSET
  {
    id: 'meditation', name: 'Meditation', icon: BrainIcon, emoji: '🧠', timeAffinity: 'evening',
    description: 'Each meditation session, however long you sit.',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['meditation', 'stress', 'anxiety', 'focus', 'mindfulness', 'mental health', 'calm', 'clarity', 'sleep', 'peace', 'breath'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'journaling', name: 'Journaling', icon: NotePencilIcon, emoji: '📓', timeAffinity: 'evening',
    description: 'Each entry you write, however brief.',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['journaling', 'reflection', 'gratitude', 'clarity', 'mental health', 'anxiety', 'writing', 'self awareness', 'growth', 'therapy'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'gratitude', name: 'Gratitude', icon: HandHeartIcon, emoji: '🙏', timeAffinity: 'evening',
    description: 'Each time you note down something you are grateful for.',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['gratitude', 'positivity', 'mindset', 'happiness', 'mental health', 'relationships', 'wellbeing', 'perspective'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'breathwork', name: 'Breathwork', icon: WindIcon, emoji: '💨',
    description: 'Each deliberate breathing session you complete.',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['breathwork', 'anxiety', 'stress', 'panic', 'calm', 'focus', 'meditation', 'energy', 'performance', 'sleep'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },

  // DEEP WORK
  {
    id: 'focus', name: 'Focus', icon: TargetIcon, emoji: '🎯',
    description: 'Each focused block of work you finish without switching tasks.',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['focus', 'productivity', 'deep work', 'distraction', 'adhd', 'career', 'study', 'startup', 'business', 'writing', 'coding'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },
  {
    id: 'planning', name: 'Planning', icon: CalendarCheckIcon, emoji: '🗓️',
    description: 'Each time you sit down to plan your day or week.',
    color: '#9E8A6B', unit: 'sessions', category: 'Deep Work',
    tags: ['planning', 'organization', 'productivity', 'career', 'business', 'goals', 'schedule', 'time management', 'project'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'reading', name: 'Reading', icon: BookOpenTextIcon, emoji: '📖', timeAffinity: 'evening',
    description: 'Each reading session, however many pages you get through.',
    color: '#8A6B7B', unit: 'sessions', category: 'Deep Work',
    tags: ['reading', 'books', 'learning', 'knowledge', 'growth', 'education', 'career', 'skill', 'vocabulary', 'writing'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'practice', name: 'Practice', icon: MetronomeIcon, emoji: '⚡',
    description: 'Each practice session on the skill you are working on.',
    color: '#7B6B9E', unit: 'sessions', category: 'Deep Work',
    tags: ['practice', 'skill', 'instrument', 'music', 'coding', 'language', 'art', 'sport', 'mastery', 'daily', 'discipline'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },
  {
    id: 'study', name: 'Study', icon: GraduationCapIcon, emoji: '🎓',
    description: 'Each study session you complete.',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['study', 'exam', 'school', 'degree', 'certification', 'course', 'learning', 'knowledge', 'career', 'skill'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },
  {
    id: 'deep-work', name: 'Deep Work', icon: HourglassIcon, emoji: '⏳',
    description: 'Each uninterrupted stretch of deep work you finish.',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['deep work', 'focus', 'productivity', 'distraction', 'startup', 'career', 'writing', 'coding', 'flow state', 'output'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },
  {
    id: 'writing', name: 'Writing', icon: PenNibIcon, emoji: '✍️',
    description: 'Each writing session, whatever the word count.',
    color: '#7C3AED', unit: 'sessions', category: 'Deep Work',
    tags: ['writing', 'book', 'blog', 'content', 'author', 'copywriting', 'journal', 'script', 'storytelling', 'career', 'side hustle', 'novel'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },
  {
    id: 'language', name: 'Language', icon: GlobeSimpleIcon, emoji: '🗣️',
    description: 'Each session spent learning or practicing the language.',
    color: '#059669', unit: 'sessions', category: 'Deep Work',
    tags: ['language', 'spanish', 'french', 'japanese', 'fluent', 'bilingual', 'travel', 'culture', 'learning', 'skill', 'korean', 'italian', 'portuguese'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 4, frequency_max: 6, frequencyKind: 'variable',
  },

  // FINANCE
  {
    id: 'finance', name: 'Finance', icon: WalletIcon, emoji: '💳',
    description: 'Days you review your money: balances, bills, or spending.',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['finance', 'budget', 'money', 'spending', 'debt', 'financial freedom', 'wealth', 'income', 'bills'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'saving', name: 'Saving', icon: PiggyBankIcon, emoji: '🐷',
    description: 'Days you move money into savings or hold to your saving plan.',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['saving', 'savings', 'emergency fund', 'down payment', 'house', 'financial freedom', 'retirement', 'debt', 'wealth'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'no-spend', name: 'No Spend', icon: CurrencyCircleDollarIcon, emoji: '💸',
    description: 'Days you spend nothing beyond your essentials.',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['no spend', 'spending', 'budget', 'frugal', 'debt', 'savings', 'discipline', 'impulse', 'financial freedom'],
    healthKitType: null,
    frequency_min: 7, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'abstinence',
  },
  {
    id: 'invest', name: 'Invest', icon: TrendUpIcon, emoji: '📈',
    description: 'Days you invest or review your investments.',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['investing', 'investment', 'stocks', 'wealth', 'retirement', 'financial freedom', 'compound interest', 'passive income'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
  {
    id: 'side-hustle', name: 'Side Hustle', icon: BriefcaseIcon, emoji: '💼',
    description: 'Each session of work on your side project or business.',
    color: '#9E7B6B', unit: 'sessions', category: 'Finance',
    tags: ['side hustle', 'income', 'business', 'freelance', 'startup', 'money', 'entrepreneur', 'revenue', 'clients'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },

  // DISCIPLINE
  {
    id: 'cold-shower', name: 'Cold Shower', icon: ShowerIcon, emoji: '🚿',
    description: 'Days you take a cold shower.',
    color: '#7B9EA6', unit: 'days', category: 'Discipline',
    tags: ['cold shower', 'discipline', 'energy', 'immune', 'willpower', 'mental toughness', 'habit', 'morning', 'recovery'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'no-sugar', name: 'No Sugar', icon: CakeIcon, emoji: '🚫',
    description: 'Days you go without added sugar.',
    color: '#6B9E8A', unit: 'days', category: 'Discipline',
    tags: ['no sugar', 'diet', 'weight loss', 'diabetes', 'health', 'discipline', 'nutrition', 'clean eating', 'inflammation'],
    healthKitType: null,
    frequency_min: 7, frequency_recommended: 7, frequency_max: 7, frequencyKind: 'abstinence',
  },
  {
    id: 'screen-time', name: 'Screen Time', icon: MonitorIcon, emoji: '📱',
    description: 'Days you stay within the screen time you set.',
    color: '#8A9E8A', unit: 'days', category: 'Discipline',
    tags: ['screen time', 'phone', 'social media', 'distraction', 'sleep', 'focus', 'addiction', 'productivity', 'presence'],
    healthKitType: null,
    frequency_min: 3, frequency_recommended: 5, frequency_max: 7, frequencyKind: 'variable',
  },
  {
    id: 'cooking', name: 'Cooking', icon: CookingPotIcon, emoji: '🍳',
    description: 'Each meal you cook instead of buying.',
    color: '#6B9E8A', unit: 'sessions', category: 'Discipline',
    tags: ['cooking', 'meal prep', 'nutrition', 'diet', 'health', 'money', 'food', 'eating out', 'skills', 'discipline'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },

  // RELATIONSHIPS
  {
    id: 'socialize', name: 'Socialize', icon: UsersThreeIcon, emoji: '👥',
    description: 'Each time you see or speak to friends.',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['social', 'friends', 'loneliness', 'connection', 'mental health', 'relationships', 'network', 'community'],
    healthKitType: null,
    frequency_min: 1, frequency_recommended: 2, frequency_max: 4, frequencyKind: 'variable',
  },
  {
    id: 'family', name: 'Family Time', icon: HouseIcon, emoji: '🏠',
    description: 'Each stretch of time you spend with family, phone away.',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['family', 'kids', 'marriage', 'partner', 'parents', 'relationships', 'presence', 'work life balance', 'connection'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
  {
    id: 'networking', name: 'Networking', icon: HandshakeIcon, emoji: '🤝',
    description: 'Each conversation with someone new in your field.',
    color: '#9E8A6B', unit: 'sessions', category: 'Relationships',
    tags: ['networking', 'career', 'business', 'connections', 'job', 'clients', 'professional', 'relationships', 'growth'],
    healthKitType: null,
    frequency_min: 1, frequency_recommended: 2, frequency_max: 3, frequencyKind: 'variable',
  },
  {
    id: 'volunteer', name: 'Volunteer', icon: HeartIcon, emoji: '❤️',
    description: 'Each time you give time to a cause or your community.',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['volunteer', 'community', 'purpose', 'giving', 'social', 'relationships', 'fulfilment', 'impact', 'charity'],
    healthKitType: null,
    frequency_min: 1, frequency_recommended: 1, frequency_max: 2, frequencyKind: 'variable',
  },

  // CREATIVE
  {
    id: 'creative', name: 'Creative', icon: PaintBrushIcon, emoji: '🎨',
    description: 'Each session spent making something.',
    color: '#7B6B9E', unit: 'sessions', category: 'Creative',
    tags: ['creative', 'art', 'drawing', 'painting', 'design', 'music', 'writing', 'expression', 'hobby', 'skill', 'side hustle'],
    healthKitType: null,
    frequency_min: 2, frequency_recommended: 3, frequency_max: 5, frequencyKind: 'variable',
  },
];

export const MARK_LIBRARY_BY_CATEGORY: MarkCategory[] = Object.entries(
  MARK_LIBRARY.reduce((acc, mark) => {
    if (!acc[mark.category]) acc[mark.category] = [];
    acc[mark.category].push(mark);
    return acc;
  }, {} as Record<string, MarkDefinition[]>)
).map(([title, marks]) => ({ title, marks }));

export const MARK_LIBRARY_BY_ID: Record<string, MarkDefinition> = Object.fromEntries(
  MARK_LIBRARY.map(m => [m.id, m])
);

// Backwards compatibility — do not use in new code
export type SuggestedMark = MarkDefinition;
export type SuggestedCounter = MarkDefinition;
export const SUGGESTED_MARKS_BY_CATEGORY = MARK_LIBRARY_BY_CATEGORY;
export const ALL_SUGGESTED_MARKS = MARK_LIBRARY;
export const ALL_SUGGESTED_COUNTERS = MARK_LIBRARY;
export const SUGGESTED_COUNTERS_BY_CATEGORY = MARK_LIBRARY_BY_CATEGORY;
