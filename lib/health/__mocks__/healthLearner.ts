export const roundToNearest = jest.fn((value: number, multiple: number) =>
  Math.round(value / multiple) * multiple,
);
export const computeStepGoal = jest.fn().mockReturnValue(null);
export const computeMedianWakeTime = jest.fn().mockReturnValue(null);
export const suggestStepGoal = jest.fn().mockResolvedValue(null);
export const suggestWakeTime = jest.fn().mockResolvedValue(null);
