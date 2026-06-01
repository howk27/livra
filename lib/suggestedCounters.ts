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
  ArrowsVerticalIcon, CurrencyCircleDollarIcon,
} from 'phosphor-react-native';

export type MarkDefinition = {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  emoji: string;
  color: string;
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
    color: '#7B9EA6', category: 'Recovery',
    tags: ['sleep', 'recovery', 'rest', 'health', 'performance', 'marathon', 'fitness', 'wellness'],
    healthKitType: 'sleep',
  },
  {
    id: 'stretch', name: 'Stretch', icon: PersonSimpleIcon, emoji: '🧘',
    color: '#7B9EA6', category: 'Recovery',
    tags: ['stretch', 'flexibility', 'recovery', 'yoga', 'mobility', 'fitness', 'wellness'],
    healthKitType: null,
  },
  {
    id: 'rest', name: 'Rest Day', icon: MoonStarsIcon, emoji: '😴',
    color: '#7B9EA6', category: 'Recovery',
    tags: ['rest', 'recovery', 'sleep', 'fitness', 'marathon', 'health'],
    healthKitType: null,
  },

  // FITNESS
  {
    id: 'workout', name: 'Workout', icon: BarbellIcon, emoji: '🏋️',
    color: '#8A7E6B', category: 'Fitness',
    tags: ['workout', 'fitness', 'strength', 'muscle', 'marathon', 'health', 'gym', 'lean'],
    healthKitType: 'workout',
  },
  {
    id: 'steps', name: 'Steps', icon: FootprintsIcon, emoji: '👣',
    color: '#8A7E6B', category: 'Fitness',
    tags: ['steps', 'walking', 'cardio', 'marathon', 'fitness', 'health', 'running', 'active'],
    healthKitType: 'steps',
  },
  {
    id: 'run', name: 'Run', icon: PersonSimpleRunIcon, emoji: '🏃',
    color: '#8A7E6B', category: 'Fitness',
    tags: ['running', 'cardio', 'marathon', 'fitness', 'endurance', 'race', '5k', '10k'],
    healthKitType: null,
  },
  {
    id: 'swim', name: 'Swim', icon: WavesIcon, emoji: '🏊',
    color: '#8A7E6B', category: 'Fitness',
    tags: ['swim', 'cardio', 'fitness', 'endurance', 'health', 'triathlon'],
    healthKitType: null,
  },
  {
    id: 'cycling', name: 'Cycling', icon: BicycleIcon, emoji: '🚴',
    color: '#8A7E6B', category: 'Fitness',
    tags: ['cycling', 'cardio', 'fitness', 'endurance', 'bike', 'triathlon'],
    healthKitType: null,
  },

  // HEALTH
  {
    id: 'water', name: 'Water', icon: DropIcon, emoji: '💧',
    color: '#6B9E8A', category: 'Health',
    tags: ['water', 'hydration', 'health', 'fitness', 'recovery', 'marathon', 'wellness'],
    healthKitType: null,
  },
  {
    id: 'nutrition', name: 'Nutrition', icon: ForkKnifeIcon, emoji: '🥗',
    color: '#6B9E8A', category: 'Health',
    tags: ['nutrition', 'diet', 'eating', 'health', 'weight', 'lean', 'food', 'cooking'],
    healthKitType: null,
  },
  {
    id: 'vitamins', name: 'Vitamins', icon: PillIcon, emoji: '💊',
    color: '#6B9E8A', category: 'Health',
    tags: ['vitamins', 'supplements', 'health', 'recovery', 'wellness', 'nutrition'],
    healthKitType: null,
  },
  {
    id: 'calories', name: 'Calories', icon: FireIcon, emoji: '🔥',
    color: '#6B9E8A', category: 'Health',
    tags: ['calories', 'diet', 'weight', 'lean', 'nutrition', 'fitness', 'cutting'],
    healthKitType: null,
  },
  {
    id: 'no-alcohol', name: 'No Alcohol', icon: ProhibitIcon, emoji: '🚫',
    color: '#6B9E8A', category: 'Health',
    tags: ['alcohol', 'sobriety', 'health', 'wellness', 'discipline', 'habit', 'quit'],
    healthKitType: null,
  },

  // MINDSET
  {
    id: 'meditation', name: 'Meditation', icon: BrainIcon, emoji: '🧠',
    color: '#8A6B7B', category: 'Mindset',
    tags: ['meditation', 'mindfulness', 'mental health', 'calm', 'focus', 'stress', 'anxiety', 'wellness'],
    healthKitType: null,
  },
  {
    id: 'journaling', name: 'Journaling', icon: NotePencilIcon, emoji: '📓',
    color: '#8A6B7B', category: 'Mindset',
    tags: ['journaling', 'writing', 'reflection', 'mental health', 'clarity', 'mindfulness'],
    healthKitType: null,
  },
  {
    id: 'gratitude', name: 'Gratitude', icon: HandHeartIcon, emoji: '🙏',
    color: '#8A6B7B', category: 'Mindset',
    tags: ['gratitude', 'mental health', 'mindfulness', 'positivity', 'wellness', 'happiness'],
    healthKitType: null,
  },
  {
    id: 'breathwork', name: 'Breathwork', icon: WindIcon, emoji: '💨',
    color: '#8A6B7B', category: 'Mindset',
    tags: ['breathwork', 'calm', 'stress', 'anxiety', 'mental health', 'meditation', 'wellness'],
    healthKitType: null,
  },
  {
    id: 'affirmations', name: 'Affirmations', icon: ChatCenteredTextIcon, emoji: '💬',
    color: '#8A6B7B', category: 'Mindset',
    tags: ['affirmations', 'mindset', 'positivity', 'mental health', 'confidence', 'motivation'],
    healthKitType: null,
  },

  // DEEP WORK
  {
    id: 'focus', name: 'Focus', icon: TargetIcon, emoji: '🎯',
    color: '#8A9E8A', category: 'Deep Work',
    tags: ['focus', 'productivity', 'deep work', 'business', 'skill', 'learning', 'coding'],
    healthKitType: null,
  },
  {
    id: 'planning', name: 'Planning', icon: CalendarCheckIcon, emoji: '🗓️',
    color: '#9E8A6B', category: 'Deep Work',
    tags: ['planning', 'productivity', 'business', 'goals', 'organization', 'finance', 'career'],
    healthKitType: null,
  },
  {
    id: 'reading', name: 'Reading', icon: BookOpenTextIcon, emoji: '📖',
    color: '#8A6B7B', category: 'Deep Work',
    tags: ['reading', 'learning', 'books', 'knowledge', 'skill', 'education', 'growth'],
    healthKitType: null,
  },
  {
    id: 'practice', name: 'Practice', icon: MetronomeIcon, emoji: '⚡',
    color: '#7B6B9E', category: 'Deep Work',
    tags: ['practice', 'skill', 'learning', 'music', 'discipline', 'mastery', 'instrument'],
    healthKitType: null,
  },
  {
    id: 'study', name: 'Study', icon: GraduationCapIcon, emoji: '🎓',
    color: '#8A9E8A', category: 'Deep Work',
    tags: ['study', 'learning', 'education', 'exam', 'school', 'knowledge', 'certification'],
    healthKitType: null,
  },
  {
    id: 'deep-work', name: 'Deep Work', icon: HourglassIcon, emoji: '⏳',
    color: '#8A9E8A', category: 'Deep Work',
    tags: ['deep work', 'focus', 'productivity', 'business', 'skill', 'coding', 'writing'],
    healthKitType: null,
  },
  {
    id: 'no-phone', name: 'No Phone', icon: PhoneSlashIcon, emoji: '📵',
    color: '#8A9E8A', category: 'Deep Work',
    tags: ['phone', 'distraction', 'focus', 'deep work', 'discipline', 'productivity', 'detox'],
    healthKitType: null,
  },

  // FINANCE
  {
    id: 'finance', name: 'Finance', icon: WalletIcon, emoji: '💳',
    color: '#9E7B6B', category: 'Finance',
    tags: ['finance', 'money', 'saving', 'budget', 'financial', 'wealth', 'business'],
    healthKitType: null,
  },
  {
    id: 'saving', name: 'Saving', icon: PiggyBankIcon, emoji: '🐷',
    color: '#9E7B6B', category: 'Finance',
    tags: ['saving', 'money', 'budget', 'financial', 'wealth', 'frugal', 'debt'],
    healthKitType: null,
  },
  {
    id: 'no-spend', name: 'No Spend', icon: CurrencyCircleDollarIcon, emoji: '💸',
    color: '#9E7B6B', category: 'Finance',
    tags: ['spending', 'budget', 'frugal', 'saving', 'financial', 'discipline', 'debt'],
    healthKitType: null,
  },
  {
    id: 'invest', name: 'Invest', icon: TrendUpIcon, emoji: '📈',
    color: '#9E7B6B', category: 'Finance',
    tags: ['investing', 'wealth', 'finance', 'money', 'business', 'stocks', 'crypto'],
    healthKitType: null,
  },
  {
    id: 'side-hustle', name: 'Side Hustle', icon: BriefcaseIcon, emoji: '💼',
    color: '#9E7B6B', category: 'Finance',
    tags: ['side hustle', 'business', 'income', 'money', 'entrepreneurship', 'freelance'],
    healthKitType: null,
  },

  // DISCIPLINE
  {
    id: 'cold-shower', name: 'Cold Shower', icon: ShowerIcon, emoji: '🚿',
    color: '#7B9EA6', category: 'Discipline',
    tags: ['cold shower', 'discipline', 'health', 'mental toughness', 'recovery', 'routine'],
    healthKitType: null,
  },
  {
    id: 'wake-early', name: 'Wake Early', icon: SunHorizonIcon, emoji: '🌅',
    color: '#9E8A6B', category: 'Discipline',
    tags: ['wake up', 'morning', 'discipline', 'routine', 'productivity', 'sleep', 'early'],
    healthKitType: null,
  },
  {
    id: 'no-sugar', name: 'No Sugar', icon: CakeIcon, emoji: '🚫',
    color: '#6B9E8A', category: 'Discipline',
    tags: ['sugar', 'diet', 'discipline', 'health', 'nutrition', 'weight', 'habit', 'quit'],
    healthKitType: null,
  },
  {
    id: 'screen-time', name: 'Screen Time', icon: MonitorIcon, emoji: '📱',
    color: '#8A9E8A', category: 'Discipline',
    tags: ['screen time', 'phone', 'discipline', 'focus', 'mental health', 'detox'],
    healthKitType: null,
  },
  {
    id: 'cooking', name: 'Cooking', icon: CookingPotIcon, emoji: '🍳',
    color: '#6B9E8A', category: 'Discipline',
    tags: ['cooking', 'nutrition', 'health', 'diet', 'discipline', 'money', 'saving'],
    healthKitType: null,
  },
  {
    id: 'posture', name: 'Posture', icon: ArrowsVerticalIcon, emoji: '🧍',
    color: '#8A7E6B', category: 'Discipline',
    tags: ['posture', 'health', 'ergonomics', 'back', 'discipline', 'wellness', 'desk'],
    healthKitType: null,
  },

  // RELATIONSHIPS
  {
    id: 'socialize', name: 'Socialize', icon: UsersThreeIcon, emoji: '👥',
    color: '#8A6B7B', category: 'Relationships',
    tags: ['social', 'friends', 'relationships', 'mental health', 'networking', 'community'],
    healthKitType: null,
  },
  {
    id: 'family', name: 'Family Time', icon: HouseIcon, emoji: '🏠',
    color: '#8A6B7B', category: 'Relationships',
    tags: ['family', 'relationships', 'mental health', 'balance', 'love', 'home'],
    healthKitType: null,
  },
  {
    id: 'networking', name: 'Networking', icon: HandshakeIcon, emoji: '🤝',
    color: '#9E8A6B', category: 'Relationships',
    tags: ['networking', 'business', 'relationships', 'career', 'social', 'entrepreneurship'],
    healthKitType: null,
  },
  {
    id: 'volunteer', name: 'Volunteer', icon: HeartIcon, emoji: '❤️',
    color: '#8A6B7B', category: 'Relationships',
    tags: ['volunteer', 'community', 'giving', 'relationships', 'purpose', 'charity'],
    healthKitType: null,
  },

  // CREATIVE
  {
    id: 'creative', name: 'Creative', icon: PaintBrushIcon, emoji: '🎨',
    color: '#7B6B9E', category: 'Creative',
    tags: ['creative', 'art', 'writing', 'music', 'skill', 'expression', 'hobby', 'design'],
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

// Backwards compatibility — do not use in new code
export type SuggestedMark = MarkDefinition;
export type SuggestedCounter = MarkDefinition;
export const SUGGESTED_MARKS_BY_CATEGORY = MARK_LIBRARY_BY_CATEGORY;
export const ALL_SUGGESTED_MARKS = MARK_LIBRARY;
export const ALL_SUGGESTED_COUNTERS = MARK_LIBRARY;
export const SUGGESTED_COUNTERS_BY_CATEGORY = MARK_LIBRARY_BY_CATEGORY;
