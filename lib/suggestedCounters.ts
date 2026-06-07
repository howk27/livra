import {
  MoonStarsIcon, BarbellIcon, FootprintsIcon, PersonSimpleRunIcon,
  PersonSimpleIcon, WavesIcon, BicycleIcon, DropIcon, ForkKnifeIcon,
  PillIcon, ProhibitIcon, FireIcon, BrainIcon, NotePencilIcon,
  HandHeartIcon, WindIcon, ChatCenteredTextIcon, TargetIcon,
  CalendarCheckIcon, BookOpenTextIcon, MetronomeIcon, PhoneSlashIcon,
  HourglassIcon, GraduationCapIcon, WalletIcon, PiggyBankIcon,
  TrendUpIcon, BriefcaseIcon, ShowerIcon, SunHorizonIcon,
  CakeIcon, MonitorIcon, CookingPotIcon, UsersThreeIcon,
  HouseIcon, HandshakeIcon, HeartIcon, PaintBrushIcon,
  ArrowsVerticalIcon, CurrencyCircleDollarIcon, BedIcon,
  PenNibIcon, GlobeSimpleIcon, BowlFoodIcon,
} from 'phosphor-react-native';

export type MarkDefinition = {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  emoji: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
  category: string;
  tags: string[];
  healthKitType: string | null;
};

export type MarkCategory = {
  title: string;
  marks: MarkDefinition[];
};

export const MARK_LIBRARY: MarkDefinition[] = [
  // RECOVERY
  {
    id: 'sleep', name: 'Sleep', icon: MoonStarsIcon, emoji: '🌙',
    color: '#7B9EA6', unit: 'days', category: 'Recovery',
    tags: ['sleep', 'recovery', 'energy', 'marathon', 'performance', 'insomnia', 'rest', 'fatigue', 'tired', 'endurance', 'health', 'athlete'],
    healthKitType: 'sleep',
  },
  {
    id: 'stretch', name: 'Stretch', icon: PersonSimpleIcon, emoji: '🧘',
    color: '#7B9EA6', unit: 'sessions', category: 'Recovery',
    tags: ['flexibility', 'mobility', 'recovery', 'injury', 'yoga', 'marathon', 'run', 'athlete', 'posture', 'soreness', 'tightness'],
    healthKitType: null,
  },
  {
    id: 'rest', name: 'Rest Day', icon: BedIcon, emoji: '😴',
    color: '#7B9EA6', unit: 'days', category: 'Recovery',
    tags: ['recovery', 'overtraining', 'burnout', 'athlete', 'marathon', 'fatigue', 'rest', 'balance'],
    healthKitType: null,
  },

  // FITNESS
  {
    id: 'workout', name: 'Workout', icon: BarbellIcon, emoji: '🏋️',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['fitness', 'strength', 'muscle', 'gym', 'marathon', 'lose weight', 'bulk', 'tone', 'training', 'athlete', 'body', 'health', 'endurance', 'triathlon'],
    healthKitType: 'workout',
  },
  {
    id: 'steps', name: 'Steps', icon: FootprintsIcon, emoji: '👣',
    color: '#8A7E6B', unit: 'items', category: 'Fitness',
    tags: ['steps', 'walk', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'active', 'movement', 'walking', 'running', 'weight loss'],
    healthKitType: 'steps',
  },
  {
    id: 'run', name: 'Run', icon: PersonSimpleRunIcon, emoji: '🏃',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['running', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'jogging', 'endurance', 'triathlon', 'speed', 'pace'],
    healthKitType: null,
  },
  {
    id: 'swim', name: 'Swim', icon: WavesIcon, emoji: '🏊',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['swimming', 'triathlon', 'endurance', 'cardio', 'marathon', 'weight loss', 'low impact', 'fitness', 'athlete', 'laps'],
    healthKitType: null,
  },
  {
    id: 'cycling', name: 'Cycling', icon: BicycleIcon, emoji: '🚴',
    color: '#8A7E6B', unit: 'sessions', category: 'Fitness',
    tags: ['cycling', 'bike', 'triathlon', 'cardio', 'endurance', 'weight loss', 'commute', 'fitness', 'spin', 'race'],
    healthKitType: null,
  },

  // HEALTH
  {
    id: 'water', name: 'Water', icon: DropIcon, emoji: '💧',
    color: '#6B9E8A', unit: 'items', category: 'Health',
    tags: ['hydration', 'water', 'health', 'weight loss', 'energy', 'skin', 'detox', 'marathon', 'performance', 'kidney'],
    healthKitType: null,
  },
  {
    id: 'nutrition', name: 'Nutrition', icon: ForkKnifeIcon, emoji: '🥗',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['diet', 'eat clean', 'nutrition', 'weight loss', 'meal prep', 'health', 'muscle', 'performance', 'food', 'body'],
    healthKitType: null,
  },
  {
    id: 'vitamins', name: 'Vitamins', icon: PillIcon, emoji: '💊',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['vitamins', 'supplements', 'health', 'immunity', 'wellness', 'energy', 'nutrition', 'deficiency'],
    healthKitType: null,
  },
  {
    id: 'calories', name: 'Calories', icon: FireIcon, emoji: '🔥',
    color: '#6B9E8A', unit: 'items', category: 'Health',
    tags: ['calories', 'weight loss', 'diet', 'cut', 'bulk', 'nutrition', 'food', 'macro', 'fitness', 'body composition'],
    healthKitType: null,
  },
  {
    id: 'no-alcohol', name: 'No Alcohol', icon: ProhibitIcon, emoji: '🚫',
    color: '#6B9E8A', unit: 'days', category: 'Health',
    tags: ['sober', 'sobriety', 'dry january', 'alcohol', 'drinking', 'liver', 'health', 'sleep', 'discipline', 'addiction', 'quit'],
    healthKitType: null,
  },
  {
    id: 'meal-prep', name: 'Meal Prep', icon: BowlFoodIcon, emoji: '🍱',
    color: '#6B9E8A', unit: 'sessions', category: 'Health',
    tags: ['meal prep', 'diet', 'nutrition', 'weight loss', 'cooking', 'food', 'healthy eating', 'discipline', 'budget', 'prep'],
    healthKitType: null,
  },

  // MINDSET
  {
    id: 'meditation', name: 'Meditation', icon: BrainIcon, emoji: '🧠',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['meditation', 'stress', 'anxiety', 'focus', 'mindfulness', 'mental health', 'calm', 'clarity', 'sleep', 'peace', 'breath'],
    healthKitType: null,
  },
  {
    id: 'journaling', name: 'Journaling', icon: NotePencilIcon, emoji: '📓',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['journaling', 'reflection', 'gratitude', 'clarity', 'mental health', 'anxiety', 'writing', 'self awareness', 'growth', 'therapy'],
    healthKitType: null,
  },
  {
    id: 'gratitude', name: 'Gratitude', icon: HandHeartIcon, emoji: '🙏',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['gratitude', 'positivity', 'mindset', 'happiness', 'mental health', 'relationships', 'wellbeing', 'perspective'],
    healthKitType: null,
  },
  {
    id: 'breathwork', name: 'Breathwork', icon: WindIcon, emoji: '💨',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['breathwork', 'anxiety', 'stress', 'panic', 'calm', 'focus', 'meditation', 'energy', 'performance', 'sleep'],
    healthKitType: null,
  },
  {
    id: 'affirmations', name: 'Affirmations', icon: ChatCenteredTextIcon, emoji: '💬',
    color: '#8A6B7B', unit: 'sessions', category: 'Mindset',
    tags: ['affirmations', 'confidence', 'mindset', 'self esteem', 'positivity', 'motivation', 'identity', 'belief'],
    healthKitType: null,
  },

  // DEEP WORK
  {
    id: 'focus', name: 'Focus', icon: TargetIcon, emoji: '🎯',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['focus', 'productivity', 'deep work', 'distraction', 'adhd', 'career', 'study', 'startup', 'business', 'writing', 'coding'],
    healthKitType: null,
  },
  {
    id: 'planning', name: 'Planning', icon: CalendarCheckIcon, emoji: '🗓️',
    color: '#9E8A6B', unit: 'sessions', category: 'Deep Work',
    tags: ['planning', 'organization', 'productivity', 'career', 'business', 'goals', 'schedule', 'time management', 'project'],
    healthKitType: null,
  },
  {
    id: 'reading', name: 'Reading', icon: BookOpenTextIcon, emoji: '📖',
    color: '#8A6B7B', unit: 'sessions', category: 'Deep Work',
    tags: ['reading', 'books', 'learning', 'knowledge', 'growth', 'education', 'career', 'skill', 'vocabulary', 'writing'],
    healthKitType: null,
  },
  {
    id: 'practice', name: 'Practice', icon: MetronomeIcon, emoji: '⚡',
    color: '#7B6B9E', unit: 'sessions', category: 'Deep Work',
    tags: ['practice', 'skill', 'instrument', 'music', 'coding', 'language', 'art', 'sport', 'mastery', 'daily', 'discipline'],
    healthKitType: null,
  },
  {
    id: 'study', name: 'Study', icon: GraduationCapIcon, emoji: '🎓',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['study', 'exam', 'school', 'degree', 'certification', 'course', 'learning', 'knowledge', 'career', 'skill'],
    healthKitType: null,
  },
  {
    id: 'deep-work', name: 'Deep Work', icon: HourglassIcon, emoji: '⏳',
    color: '#8A9E8A', unit: 'sessions', category: 'Deep Work',
    tags: ['deep work', 'focus', 'productivity', 'distraction', 'startup', 'career', 'writing', 'coding', 'flow state', 'output'],
    healthKitType: null,
  },
  {
    id: 'no-phone', name: 'No Phone', icon: PhoneSlashIcon, emoji: '📵',
    color: '#8A9E8A', unit: 'days', category: 'Deep Work',
    tags: ['phone', 'screen time', 'distraction', 'focus', 'productivity', 'social media', 'addiction', 'dopamine', 'presence'],
    healthKitType: null,
  },
  {
    id: 'writing', name: 'Writing', icon: PenNibIcon, emoji: '✍️',
    color: '#7C3AED', unit: 'sessions', category: 'Deep Work',
    tags: ['writing', 'book', 'blog', 'content', 'author', 'copywriting', 'journal', 'script', 'storytelling', 'career', 'side hustle', 'novel'],
    healthKitType: null,
  },
  {
    id: 'language', name: 'Language', icon: GlobeSimpleIcon, emoji: '🗣️',
    color: '#059669', unit: 'sessions', category: 'Deep Work',
    tags: ['language', 'spanish', 'french', 'japanese', 'fluent', 'bilingual', 'travel', 'culture', 'learning', 'skill', 'korean', 'italian', 'portuguese'],
    healthKitType: null,
  },

  // FINANCE
  {
    id: 'finance', name: 'Finance', icon: WalletIcon, emoji: '💳',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['finance', 'budget', 'money', 'spending', 'debt', 'financial freedom', 'wealth', 'income', 'bills'],
    healthKitType: null,
  },
  {
    id: 'saving', name: 'Saving', icon: PiggyBankIcon, emoji: '🐷',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['saving', 'savings', 'emergency fund', 'down payment', 'house', 'financial freedom', 'retirement', 'debt', 'wealth'],
    healthKitType: null,
  },
  {
    id: 'no-spend', name: 'No Spend', icon: CurrencyCircleDollarIcon, emoji: '💸',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['no spend', 'spending', 'budget', 'frugal', 'debt', 'savings', 'discipline', 'impulse', 'financial freedom'],
    healthKitType: null,
  },
  {
    id: 'invest', name: 'Invest', icon: TrendUpIcon, emoji: '📈',
    color: '#9E7B6B', unit: 'days', category: 'Finance',
    tags: ['investing', 'investment', 'stocks', 'wealth', 'retirement', 'financial freedom', 'compound interest', 'passive income'],
    healthKitType: null,
  },
  {
    id: 'side-hustle', name: 'Side Hustle', icon: BriefcaseIcon, emoji: '💼',
    color: '#9E7B6B', unit: 'sessions', category: 'Finance',
    tags: ['side hustle', 'income', 'business', 'freelance', 'startup', 'money', 'entrepreneur', 'revenue', 'clients'],
    healthKitType: null,
  },

  // DISCIPLINE
  {
    id: 'cold-shower', name: 'Cold Shower', icon: ShowerIcon, emoji: '🚿',
    color: '#7B9EA6', unit: 'days', category: 'Discipline',
    tags: ['cold shower', 'discipline', 'energy', 'immune', 'willpower', 'mental toughness', 'habit', 'morning', 'recovery'],
    healthKitType: null,
  },
  {
    id: 'wake-early', name: 'Wake Early', icon: SunHorizonIcon, emoji: '🌅',
    color: '#9E8A6B', unit: 'days', category: 'Discipline',
    tags: ['wake early', 'morning routine', '5am', 'discipline', 'productivity', 'sleep schedule', 'routine', 'schedule'],
    healthKitType: null,
  },
  {
    id: 'no-sugar', name: 'No Sugar', icon: CakeIcon, emoji: '🚫',
    color: '#6B9E8A', unit: 'days', category: 'Discipline',
    tags: ['no sugar', 'diet', 'weight loss', 'diabetes', 'health', 'discipline', 'nutrition', 'clean eating', 'inflammation'],
    healthKitType: null,
  },
  {
    id: 'screen-time', name: 'Screen Time', icon: MonitorIcon, emoji: '📱',
    color: '#8A9E8A', unit: 'days', category: 'Discipline',
    tags: ['screen time', 'phone', 'social media', 'distraction', 'sleep', 'focus', 'addiction', 'productivity', 'presence'],
    healthKitType: null,
  },
  {
    id: 'cooking', name: 'Cooking', icon: CookingPotIcon, emoji: '🍳',
    color: '#6B9E8A', unit: 'sessions', category: 'Discipline',
    tags: ['cooking', 'meal prep', 'nutrition', 'diet', 'health', 'money', 'food', 'eating out', 'skills', 'discipline'],
    healthKitType: null,
  },
  {
    id: 'posture', name: 'Posture', icon: ArrowsVerticalIcon, emoji: '🧍',
    color: '#8A7E6B', unit: 'days', category: 'Discipline',
    tags: ['posture', 'back pain', 'ergonomics', 'health', 'desk', 'alignment', 'neck', 'spine', 'sitting'],
    healthKitType: null,
  },

  // RELATIONSHIPS
  {
    id: 'socialize', name: 'Socialize', icon: UsersThreeIcon, emoji: '👥',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['social', 'friends', 'loneliness', 'connection', 'mental health', 'relationships', 'network', 'community'],
    healthKitType: null,
  },
  {
    id: 'family', name: 'Family Time', icon: HouseIcon, emoji: '🏠',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['family', 'kids', 'marriage', 'partner', 'parents', 'relationships', 'presence', 'work life balance', 'connection'],
    healthKitType: null,
  },
  {
    id: 'networking', name: 'Networking', icon: HandshakeIcon, emoji: '🤝',
    color: '#9E8A6B', unit: 'sessions', category: 'Relationships',
    tags: ['networking', 'career', 'business', 'connections', 'job', 'clients', 'professional', 'relationships', 'growth'],
    healthKitType: null,
  },
  {
    id: 'volunteer', name: 'Volunteer', icon: HeartIcon, emoji: '❤️',
    color: '#8A6B7B', unit: 'sessions', category: 'Relationships',
    tags: ['volunteer', 'community', 'purpose', 'giving', 'social', 'relationships', 'fulfilment', 'impact', 'charity'],
    healthKitType: null,
  },

  // CREATIVE
  {
    id: 'creative', name: 'Creative', icon: PaintBrushIcon, emoji: '🎨',
    color: '#7B6B9E', unit: 'sessions', category: 'Creative',
    tags: ['creative', 'art', 'drawing', 'painting', 'design', 'music', 'writing', 'expression', 'hobby', 'skill', 'side hustle'],
    healthKitType: null,
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
