// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeSignRequirement } from './generateSshdDump.mjs';

describe('sign requirement compatibility', () => {
    it('expands only the published sword-only sign rule to the confirmed alternatives', () => {
        expect(
            normalizeSignRequirement('Sword', ['Signs', 'Custom Flag']),
        ).toBe(
            'Sword or Gust_Bellows or Slingshot or Clawshots or Bow or Bomb_Bag',
        );
        expect(
            normalizeSignRequirement('Sword', ['Trees', 'Custom Flag']),
        ).toBe('Sword');
    });
    it('preserves newer macros and additional access constraints', () => {
        for (const requirement of [
            'Can_Cut_Signs',
            'Sword and Clawshots',
            'Nothing',
        ]) {
            expect(normalizeSignRequirement(requirement, ['Signs'])).toBe(
                requirement,
            );
        }
    });
});
