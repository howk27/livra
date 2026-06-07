import { MARK_LIBRARY, MarkDefinition } from './suggestedCounters';

const MAX_SUGGESTIONS = 5;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in',
  'on', 'at', 'by', 'my', 'i', 'want', 'become', 'be', 'get', 'do',
  'build', 'start', 'make', 'learn', 'improve', 'better', 'more',
]);

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function scoreMark(mark: MarkDefinition, tokens: string[]): number {
  let score = 0;
  const lowerTags = mark.tags.map(t => t.toLowerCase());
  for (const token of tokens) {
    for (const tag of lowerTags) {
      if (tag === token) {
        score += 2;
      } else if (tag.includes(token) || token.includes(tag)) {
        score += 1;
      }
    }
  }
  return score;
}

const FALLBACK_IDS = ['workout', 'focus', 'planning', 'sleep', 'water'];

export function getMarksForGoal(goalTitle: string): MarkDefinition[] {
  const tokens = tokenize(goalTitle);
  if (tokens.length === 0) return MARK_LIBRARY.slice(0, 3);

  const scored = MARK_LIBRARY
    .map(mark => ({ mark, score: scoreMark(mark, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ mark }) => mark);

  if (scored.length > 0) return scored;

  return FALLBACK_IDS
    .map(id => MARK_LIBRARY.find(m => m.id === id))
    .filter(Boolean) as MarkDefinition[];
}
