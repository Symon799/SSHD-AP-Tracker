import { expect, it } from 'vitest';
import {
    checkArchiveSize,
    checkPackEntryLimits,
    PACK_LIMITS,
} from './packLimits';

it('accepts archives above the old cap through the new boundary', () => {
    expect(() => checkArchiveSize(57 * 1024 * 1024)).not.toThrow();
    expect(() => checkArchiveSize(PACK_LIMITS.archive)).not.toThrow();
    expect(() => checkArchiveSize(PACK_LIMITS.archive + 1)).toThrow('256 MB');
});
it('enforces the same expanded, file and entry limits for import and export', () => {
    expect(() =>
        checkPackEntryLimits(65 * 1024 * 1024, 10, 12 * 1024 * 1024),
    ).not.toThrow();
    expect(() =>
        checkPackEntryLimits(
            PACK_LIMITS.expanded,
            PACK_LIMITS.entries,
            PACK_LIMITS.asset,
        ),
    ).not.toThrow();
    expect(() => checkPackEntryLimits(PACK_LIMITS.expanded + 1, 1, 1)).toThrow(
        '512 MB',
    );
    expect(() => checkPackEntryLimits(1, PACK_LIMITS.entries + 1, 1)).toThrow(
        '300 files',
    );
    expect(() =>
        checkPackEntryLimits(PACK_LIMITS.asset + 1, 1, PACK_LIMITS.asset + 1),
    ).toThrow('16 MB');
});
