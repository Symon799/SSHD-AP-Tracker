import { afterEach, describe, expect, it, vi } from 'vitest';
import { readViewNumber, writeViewNumber } from './LocationViewState';

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('location view preferences', () => {
    it('keeps independent positions and open states', () => {
        writeViewNumber('Central Skyloft:scroll', 147);
        writeViewNumber('Faron Woods:scroll', 52);
        writeViewNumber('Trees:open', 1);
        expect(readViewNumber('Central Skyloft:scroll')).toBe(147);
        expect(readViewNumber('Faron Woods:scroll')).toBe(52);
        expect(readViewNumber('Trees:open')).toBe(1);
        expect(readViewNumber('missing')).toBe(0);
    });

    it('ignores invalid stored positions', () => {
        for (const value of ['NaN', 'Infinity', '-12', 'invalid']) {
            localStorage.setItem('sshdLocationView:test', value);
            expect(readViewNumber('test')).toBe(0);
        }
    });

    it('remains usable when browser storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('full');
        });
        expect(readViewNumber('test')).toBe(0);
        expect(() => writeViewNumber('test', 10)).not.toThrow();
    });
});
