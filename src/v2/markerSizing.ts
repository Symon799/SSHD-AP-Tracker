// Size depends on available screen space, never on the image's native resolution.
export const MIN_MARKER_SIZE = 7;
export const MAX_MARKER_SIZE = 38;
export const CHECK_MARKER_SCALE = 0.9;
export const COMPLETED_MARKER_SCALE = 2 / 3;
export const NATIVE_MARKER_SIZE = 19;
export const MARKER_REFERENCE_WIDTH = 843;
export const MARKER_REFERENCE_HEIGHT = 465;
export const MIN_MARKER_PERCENT = 50;
export const MAX_MARKER_PERCENT = 100;

const countFormatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 0,
});

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

export function markerMetrics(
    scale: number,
    count: number,
    percent = MAX_MARKER_PERCENT,
    sizeRatio = 1,
) {
    const size =
        Math.max(
            MIN_MARKER_SIZE,
            Math.min(MAX_MARKER_SIZE, NATIVE_MARKER_SIZE * scale),
        ) *
        (percent / MAX_MARKER_PERCENT) *
        sizeRatio;
    const label = countFormatter.format(count);
    const fontSize = Math.min(
        16,
        size * 0.56,
        (size - (size < 18 ? 2 : 4) - 0.5) / (label.length * 0.75),
    );
    return { size, label, fontSize };
}
