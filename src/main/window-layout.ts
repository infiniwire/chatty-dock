import type { Rectangle } from 'electron';
import type { WindowLayout } from '../shared/model';

export function layoutBounds(layout: Exclude<WindowLayout, 'restore'>, area: Rectangle): Rectangle {
  const left = Math.floor(area.width / 2);
  const top = Math.floor(area.height / 2);
  const right = { x: area.x + left, width: area.width - left };
  const bottom = { y: area.y + top, height: area.height - top };
  switch (layout) {
    case 'fill':
      return { ...area };
    case 'left':
      return { ...area, width: left };
    case 'right':
      return { ...area, ...right };
    case 'top':
      return { ...area, height: top };
    case 'bottom':
      return { ...area, ...bottom };
    case 'top-left':
      return { ...area, width: left, height: top };
    case 'top-right':
      return { ...area, ...right, height: top };
    case 'bottom-left':
      return { ...area, ...bottom, width: left };
    case 'bottom-right':
      return { ...area, ...right, ...bottom };
  }
}

export function sameBounds(a: Rectangle, b: Rectangle): boolean {
  // Native frame dimensions can round by one DIP on fractional-scale displays.
  return (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(a[key] - b[key]) <= 1);
}
