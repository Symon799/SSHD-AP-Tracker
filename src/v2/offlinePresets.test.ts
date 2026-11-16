import { load } from 'js-yaml';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import type { OptionDefs } from '../permalink/SettingsTypes';
import { offlinePresets, offlineSettings } from './offlinePresets';

const options = load(
    fs.readFileSync('testData/sshd-options.yaml', 'utf8'),
) as OptionDefs;
it.each(offlinePresets)('uses valid option values for %s', (preset) => {
    const settings = offlineSettings(options, preset) as Record<
        string,
        unknown
    >;
    for (const option of options) {
        if (option.type === 'singlechoice' && option.permalink !== false)
            expect(option.choices).toContain(settings[option.command]);
    }
});
it('keeps bundles and blades mutually exclusive and includes other sanity checks', () => {
    const bundles = offlineSettings(options, 'all-bundles') as Record<
        string,
        unknown
    >;
    const blades = offlineSettings(options, 'all-blades') as Record<
        string,
        unknown
    >;
    expect(bundles['grass-shuffle']).toBe('bundles');
    expect(blades['grass-shuffle']).toBe('blades');
    for (const key of ['sign', 'tree', 'pot', 'barrel', 'pumpkin'])
        expect(blades[`${key}-shuffle`]).toBe('on');
});
