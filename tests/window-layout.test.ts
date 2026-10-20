import { describe, expect, it } from 'vitest';
import { layoutBounds } from '../src/main/window-layout';

describe('desktop window placement', () => {
  const area = { x: -1920, y: 40, width: 1919, height: 1039 };
  it.each([
    ['fill', { x: -1920, y: 40, width: 1919, height: 1039 }],
    ['left', { x: -1920, y: 40, width: 959, height: 1039 }],
    ['right', { x: -961, y: 40, width: 960, height: 1039 }],
    ['top', { x: -1920, y: 40, width: 1919, height: 519 }],
    ['bottom', { x: -1920, y: 559, width: 1919, height: 520 }],
    ['top-left', { x: -1920, y: 40, width: 959, height: 519 }],
    ['top-right', { x: -961, y: 40, width: 960, height: 519 }],
    ['bottom-left', { x: -1920, y: 559, width: 959, height: 520 }],
    ['bottom-right', { x: -961, y: 559, width: 960, height: 520 }],
  ] as const)(
    'places %s inside a negative-origin work area without rounding gaps',
    (preset, expected) => {
      expect(layoutBounds(preset, area)).toEqual(expected);
      expect(area).toEqual({ x: -1920, y: 40, width: 1919, height: 1039 });
    },
  );
});
