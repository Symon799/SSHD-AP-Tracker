import { expect, it } from 'vitest';
import {
    markerDisplayScale,
    markerMetrics,
    MAX_MARKER_SIZE,
    MIN_MARKER_SIZE,
} from './markerSizing';

it('scales markers within readable limits', () => {
    expect(markerMetrics(0.01, 1).size).toBe(MIN_MARKER_SIZE);
    expect(markerMetrics(100, 1).size).toBe(MAX_MARKER_SIZE);
    expect(markerMetrics(0.5, 1).size).toBeLessThan(markerMetrics(1, 1).size);
    expect(markerMetrics(1, 1).size).toBe(19);
    expect(markerMetrics(2, 1).size).toBe(38);
});
it('uses viewport dimensions and zoom instead of image resolution', () => {
    expect(markerDisplayScale(891, 513, 1)).toBe(1);
    expect(markerDisplayScale(891, 513, 2)).toBe(2);
    expect(markerDisplayScale(1734, 978, 1)).toBe(2);
    expect(markerDisplayScale(400, 300, 1)).toBeLessThan(1);
});
it('hides counts on small markers and restores them when zooming', () => {
    expect(markerMetrics(0.4, 42).showCount).toBe(false);
    expect(markerMetrics(1, 42).showCount).toBe(true);
    expect(markerMetrics(0.7, 999).showCount).toBe(false);
    expect(markerMetrics(1, 12579).label).toBe('13K');
});
it('hides one, two and three digit counts at the same size and fits their text', () => {
    for (const count of [1, 42, 999, 12579]) {
        expect(markerMetrics(17.9 / 19, count).showCount).toBe(false);
        const metrics = markerMetrics(18 / 19, count);
        expect(metrics.showCount).toBe(true);
        expect(
            metrics.label.length * metrics.fontSize * 0.65,
        ).toBeLessThanOrEqual(metrics.size - 4);
    }
    expect(markerMetrics(1, 999).fontSize).toBeLessThan(
        markerMetrics(1, 1).fontSize,
    );
});
