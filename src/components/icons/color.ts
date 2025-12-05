const clampAlpha = (value: number) => Math.max(0, Math.min(1, value));

const expandHex = (hex: string) =>
  hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = expandHex(hex);
  if (normalized.length !== 6) {
    return hex;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const rgbToRgba = (rgb: string, alpha: number) => {
  const match = rgb
    .replace(/\s+/g, '')
    .match(/^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/i);

  if (!match) {
    return rgb;
  }

  const [, r, g, b] = match;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const applyOpacity = (color: string, alpha: number) => {
  if (!color) {
    return color;
  }

  const safeAlpha = clampAlpha(alpha);

  if (color.startsWith('#')) {
    return hexToRgba(color.slice(1), safeAlpha);
  }

  if (/^rgb\(/i.test(color)) {
    return rgbToRgba(color, safeAlpha);
  }

  return color;
};


