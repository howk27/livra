export const toUserMessage = (error: any, fallback: string = 'Something went wrong. Please try again.') => {
  const message = typeof error === 'string' ? error : error?.message || '';
  const normalized = message.toLowerCase();

  if (!message) return fallback;

  if (normalized.includes('network') || normalized.includes('timeout')) {
    return 'Network issue. Please check your connection and try again.';
  }

  if (normalized.includes('invalid login') || normalized.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }

  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (normalized.includes('already verified')) {
    return 'Your email is already verified.';
  }

  if (normalized.includes('expired')) {
    return 'This link has expired. Please request a new one.';
  }

  return message || fallback;
};

