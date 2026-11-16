import { defaultSettings } from '../permalink/Settings';
import type { OptionDefs } from '../permalink/SettingsTypes';

export const offlinePresets = [
    ['simple', 'Simple'],
    ['signs', 'Simple + Signs'],
    ['trees', 'Simple + Trees'],
    ['grass', 'Simple + Grass bundles'],
    ['all-bundles', 'All checks (grass bundles)'],
    ['all-blades', 'All checks (grass blades)'],
] as const;
export type OfflinePreset = (typeof offlinePresets)[number][0];

export function offlineSettings(options: OptionDefs, preset: OfflinePreset) {
    const settings = defaultSettings(options);
    const all = preset.startsWith('all-');
    Object.assign(settings, {
        'sign-shuffle': all || preset === 'signs' ? 'on' : 'off',
        'tree-shuffle': all || preset === 'trees' ? 'on' : 'off',
        'grass-shuffle':
            preset === 'all-blades'
                ? 'blades'
                : all || preset === 'grass'
                  ? 'bundles'
                  : 'off',
    });
    if (all)
        Object.assign(settings, {
            'pot-shuffle': 'on',
            'pumpkin-shuffle': 'on',
            'barrel-shuffle': 'on',
            'stamina-fruit-shuffle': 'on',
            'hidden-item-shuffle': 'on',
            'npc-closet-shuffle': 'randomized',
            'rupee-shuffle': 'advanced',
            'underground-rupee-shuffle': 'on',
            'beedle-shop-shuffle': 'randomized',
            'goddess-chest-shuffle': 'on',
            'decouple-goddess-cubes-and-chests': 'on',
            'bird-statues-give-items': 'on',
            'gossip-stone-treasure-shuffle': 'on',
            'tadtone-shuffle': 'on',
            'trial-treasure-shuffle': 10,
            'excluded-locations': [],
        });
    return settings;
}
