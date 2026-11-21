// Size depends on available screen space, never on the image's native resolution.
export const MIN_MARKER_SIZE = 7;
export const MAX_MARKER_SIZE = 38;
export const COMPLETED_MARKER_SCALE = 2 / 3;
export const NATIVE_MARKER_SIZE = 19;
export const MARKER_REFERENCE_WIDTH = 843;
export const MARKER_REFERENCE_HEIGHT = 465;
export const COUNT_VISIBILITY_SIZE = 18;

export function markerDisplayScale(
    width: number,
    height: number,
    zoom: number,
) {
    return (
        Math.max(
            0.05,
            Math.min(
                (width - 48) / MARKER_REFERENCE_WIDTH,
                (height - 48) / MARKER_REFERENCE_HEIGHT,
            ),
        ) * zoom
    );
}

export function markerMetrics(scale: number, count: number) {
    const size = Math.max(
        MIN_MARKER_SIZE,
        Math.min(MAX_MARKER_SIZE, NATIVE_MARKER_SIZE * scale),
    );
    const label = new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 0,
    }).format(count);
    const fontSize = Math.min(
        16,
        Math.max(9, size * 0.46),
        (size - 4) / (label.length * 0.65),
    );
    const showCount = size >= COUNT_VISIBILITY_SIZE;
    return { size, label, fontSize, showCount };
}
