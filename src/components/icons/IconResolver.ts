import type { Counter } from '@/types';
import type { CounterType } from '@/src/types/counters';

type CounterLike = Pick<Counter, 'name' | 'emoji'>;

const EMAIL_EMOJIS = new Set(['📧']);
const PLANNING_EMOJIS = new Set(['🗓️', '📅']);
const FOCUS_EMOJIS = new Set(['🎯']);
const TASK_EMOJIS = new Set(['✅']);
const LANGUAGE_EMOJIS = new Set(['🗣️', '💬']);
const STUDY_EMOJIS = new Set(['📚']);
const READING_EMOJIS = new Set(['📖']);
const CALORIES_EMOJIS = new Set(['🔥']);
const SODA_FREE_EMOJIS = new Set(['🥤']);
const REST_EMOJIS = new Set(['🛌']);
const MEDITATION_EMOJIS = new Set(['🧘', '🧘‍♂️', '🧘‍♀️']);
const SLEEP_EMOJIS = new Set(['🌙', '😴']);
const GYM_EMOJIS = new Set(['🏋️', '🏋️‍♂️', '🏋️‍♀️']);
const STEPS_EMOJIS = new Set(['👣']);
const WATER_EMOJIS = new Set(['💧', '🚰', '🌊']);
const NO_SUGAR_EMOJIS = new Set(['🚫', '🍬', '🍭', '🍰']);
const NO_BEER_EMOJIS = new Set(['🍺', '🍻', '🍷']);
const NO_SPENDING_EMOJIS = new Set(['💰', '💵', '💸']);
const MOOD_EMOJIS = new Set(['😊', '😄', '😃', '🙂', '😌', '😔', '😢']);
const NO_SMOKING_EMOJIS = new Set(['🚭', '🚬']);
const SCREEN_FREE_EMOJIS = new Set(['📱', '💻', '📺', '🖥️']);
const GRATITUDE_EMOJIS = new Set(['🙏', '❤️', '💝', '💖']);
const JOURNALING_EMOJIS = new Set(['📔', '📝', '📓', '✍️']);

const safeNormalize = (value?: string | null) => (value ?? '').trim().toLowerCase();

export const resolveCounterIconType = (counter: CounterLike): CounterType | undefined => {
  const emoji = counter.emoji ?? undefined;
  if (emoji) {
    if (EMAIL_EMOJIS.has(emoji)) {
      return 'email';
    }
    if (PLANNING_EMOJIS.has(emoji)) {
      return 'planning';
    }
    if (FOCUS_EMOJIS.has(emoji)) {
      return 'focus';
    }
    if (TASK_EMOJIS.has(emoji)) {
      return 'tasks';
    }
    if (LANGUAGE_EMOJIS.has(emoji)) {
      return 'language';
    }
    if (STUDY_EMOJIS.has(emoji)) {
      return 'study';
    }
    if (READING_EMOJIS.has(emoji)) {
      return 'reading';
    }
    if (CALORIES_EMOJIS.has(emoji)) {
      return 'calories';
    }
    if (SODA_FREE_EMOJIS.has(emoji)) {
      return 'soda_free';
    }
    if (REST_EMOJIS.has(emoji)) {
      return 'rest';
    }
    if (MEDITATION_EMOJIS.has(emoji)) {
      return 'meditation';
    }
    if (SLEEP_EMOJIS.has(emoji)) {
      return 'sleep';
    }
    if (GYM_EMOJIS.has(emoji)) {
      return 'gym';
    }
    if (STEPS_EMOJIS.has(emoji)) {
      return 'steps';
    }
    if (WATER_EMOJIS.has(emoji)) {
      return 'water';
    }
    if (NO_SUGAR_EMOJIS.has(emoji)) {
      return 'no_sugar';
    }
    if (NO_BEER_EMOJIS.has(emoji)) {
      return 'no_beer';
    }
    if (NO_SPENDING_EMOJIS.has(emoji)) {
      return 'no_spending';
    }
    if (MOOD_EMOJIS.has(emoji)) {
      return 'mood';
    }
    if (NO_SMOKING_EMOJIS.has(emoji)) {
      return 'no_smoking';
    }
    if (SCREEN_FREE_EMOJIS.has(emoji)) {
      return 'screen_free';
    }
    if (GRATITUDE_EMOJIS.has(emoji)) {
      return 'gratitude';
    }
    if (JOURNALING_EMOJIS.has(emoji)) {
      return 'journaling';
    }
  }

  const name = safeNormalize(counter.name);

  if (name.includes('email') || name.includes('mail') || name.includes('inbox')) {
    return 'email';
  }

  if (name.includes('plan')) {
    return 'planning';
  }

  if (name.includes('focus')) {
    return 'focus';
  }

  if (name.includes('task') || name.includes('todo')) {
    return 'tasks';
  }

  if (name.includes('language') || name.includes('lingo')) {
    return 'language';
  }

  if (name.includes('study') || name.includes('learn')) {
    return 'study';
  }

  if (name.includes('read') || name.includes('book')) {
    return 'reading';
  }

  if (name.includes('calorie') || name.includes('burn')) {
    return 'calories';
  }

  if (name.includes('soda')) {
    return 'soda_free';
  }

  if (name.includes('rest day') || name.includes('rest-day') || name.includes('restday')) {
    return 'rest';
  }

  if (name.includes('meditat') || name.includes('mindful')) {
    return 'meditation';
  }

  if (name.includes('sleep') || name.includes('bedtime') || name.includes('bed')) {
    return 'sleep';
  }

  if (name.includes('gym') || name.includes('workout')) {
    return 'gym';
  }

  if (name.includes('step')) {
    return 'steps';
  }

  if (name.includes('water') || name.includes('hydrate') || name.includes('intake')) {
    return 'water';
  }

  if (name.includes('no sugar') || name.includes('no-sugar') || name.includes('nosugar') || name.includes('sugar free') || name.includes('sugar-free')) {
    return 'no_sugar';
  }

  if (name.includes('no beer') || name.includes('no-beer') || name.includes('nobeer') || name.includes('alcohol free') || name.includes('alcohol-free')) {
    return 'no_beer';
  }

  if (name.includes('no spending') || name.includes('no-spending') || name.includes('nospending') || name.includes('save money') || name.includes('save-money')) {
    return 'no_spending';
  }

  if (name.includes('mood') || name.includes('feeling') || name.includes('emotion')) {
    return 'mood';
  }

  if (name.includes('no smoking') || name.includes('no-smoking') || name.includes('nosmoking') || name.includes('quit smoking') || name.includes('quit-smoking')) {
    return 'no_smoking';
  }

  if (name.includes('screen free') || name.includes('screen-free') || name.includes('screenfree') || name.includes('no phone') || name.includes('no-phone')) {
    return 'screen_free';
  }

  if (name.includes('gratitude') || name.includes('thankful') || name.includes('appreciat')) {
    return 'gratitude';
  }

  if (name.includes('journal') || name.includes('diary') || name.includes('writing')) {
    return 'journaling';
  }

  return undefined;
};
