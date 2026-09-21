/**
 * Development-only escape hatch for exercising manual entrance mapping
 * without generating an entrance-randomized AP seed.
 */
export const forceSshdManualEntranceTestMode =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('entranceTest') === '1';
