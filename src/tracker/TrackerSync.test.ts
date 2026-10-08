import { describe, expect, it } from 'vitest';
import {
    bootstrapManualCheckOverrides,
    mergeInventoryWithManualOverrides,
    mergeWithManualOverrides,
    migrateAbsoluteInventoryOverridesToDeltas,
    reconcileInventoryOverrides,
    reconcileManualOverrides,
    reconstructApRequiredDungeons,
} from './TrackerSync';

describe('reconcileManualOverrides', () => {
    it('keeps manual overrides on the first AP delivery', () => {
        expect(
            reconcileManualOverrides(new Set(), new Set(['a', 'b']), {
                c: true,
            }),
        ).toEqual({ c: true });
    });

    it('drops overrides for checks the server changed', () => {
        expect(
            reconcileManualOverrides(new Set(['a', 'b']), new Set(['a']), {
                a: true,
                b: false,
                c: true,
            }),
        ).toEqual({ a: true, c: true });
    });
});

describe('mergeWithManualOverrides', () => {
    it('prefers manual overrides over AP values', () => {
        expect(
            mergeWithManualOverrides(new Set(['a', 'b']), {
                b: false,
                c: true,
            }).sort((a, b) => a.localeCompare(b)),
        ).toEqual(['a', 'c']);
    });
});

describe('bootstrapManualCheckOverrides', () => {
    it('preserves existing checked locations before AP sync', () => {
        expect(bootstrapManualCheckOverrides(['manual-check'], [], {})).toEqual(
            { 'manual-check': true },
        );
    });
});

describe('reconcileInventoryOverrides', () => {
    it('keeps manual deltas on the first AP delivery', () => {
        expect(
            reconcileInventoryOverrides(
                {},
                { 'Skyview Small Key': 1 },
                { 'Skyview Boss Key': 1 },
            ),
        ).toEqual({ 'Skyview Boss Key': 1 });
    });

    it('clears a positive delta from AP=0 once AP catches up', () => {
        expect(
            reconcileInventoryOverrides(
                { 'Skyview Boss Key': 0 },
                { 'Skyview Boss Key': 1 },
                { 'Skyview Boss Key': 1, 'Skyview Small Key': 1 },
            ),
        ).toEqual({ 'Skyview Small Key': 1 });
    });

    it('keeps a positive delta when AP was already above zero', () => {
        expect(
            reconcileInventoryOverrides(
                { 'Progressive Sword': 2 },
                { 'Progressive Sword': 3 },
                { 'Progressive Sword': 1 },
            ),
        ).toEqual({ 'Progressive Sword': 1 });
    });
});

describe('mergeInventoryWithManualOverrides', () => {
    it('adds manual deltas to AP counts', () => {
        expect(
            mergeInventoryWithManualOverrides(
                { 'Skyview Small Key': 0, 'Skyview Boss Key': 0 },
                { 'Skyview Small Key': 2 },
            ),
        ).toEqual({ 'Skyview Small Key': 2, 'Skyview Boss Key': 0 });
    });

    it('clamps merged counts to item maximums', () => {
        expect(
            mergeInventoryWithManualOverrides(
                { 'Key Piece': 0 },
                { 'Key Piece': 10 },
            ),
        ).toEqual({ 'Key Piece': 5 });
    });
});

describe('migrateAbsoluteInventoryOverridesToDeltas', () => {
    it('converts legacy absolute overrides to deltas', () => {
        expect(
            migrateAbsoluteInventoryOverridesToDeltas(
                { 'Progressive Sword': 2 },
                { 'Progressive Sword': 3 },
            ),
        ).toEqual({ 'Progressive Sword': 1 });
    });
});

describe('reconstructApRequiredDungeons', () => {
    it('rebuilds AP required dungeons from saved selection and overrides', () => {
        expect(
            reconstructApRequiredDungeons(['Skyview', 'Sandship'], {
                'Earth Temple': false,
            }).sort((a, b) => a.localeCompare(b)),
        ).toEqual(['Earth Temple', 'Sandship', 'Skyview']);
    });
});
