const MiB = 1024 * 1024;

export const PACK_LIMITS = {
    archive: 256 * MiB,
    expanded: 512 * MiB,
    asset: 16 * MiB,
    entries: 300,
} as const;

export function checkArchiveSize(size: number) {
    if (size > PACK_LIMITS.archive)
        throw new Error('ZIP exceeds the 256 MB limit.');
}

export function checkPackEntryLimits(
    totalSize: number,
    entries: number,
    entrySize: number,
) {
    if (
        entries > PACK_LIMITS.entries ||
        totalSize > PACK_LIMITS.expanded ||
        entrySize > PACK_LIMITS.asset
    )
        throw new Error(
            'Pack exceeds the expanded-size limits (512 MB total, 16 MB per file, 300 files).',
        );
}
