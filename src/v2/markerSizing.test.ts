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
it('scales from half to full size after applying normal marker bounds', () => {
    for (const scale of [0.01, 1, 100]) {
        expect(markerMetrics(scale, 42, 50).size).toBe(
            markerMetrics(scale, 42).size / 2,
        );
    }
    expect(markerMetrics(1, 12579).label).toBe('13K');
});
it('fits count labels at the smallest marker size', () => {
    for (const count of [1, 42, 999, 12579]) {
        const metrics = markerMetrics(0.01, count, 50);
        expect(metrics.fontSize).toBeGreaterThan(0);
        expect(
            metrics.label.length * metrics.fontSize * 0.75,
        ).toBeLessThanOrEqual(metrics.size - 2);
    }
    expect(markerMetrics(1, 999).fontSize).toBeLessThan(
        markerMetrics(1, 1).fontSize,
    );
});
