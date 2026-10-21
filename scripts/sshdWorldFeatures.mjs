import fs from 'node:fs';

const features = JSON.parse(
    fs.readFileSync(
        new URL('../src/data/sshdWorldFeatures.json', import.meta.url),
        'utf8',
    ),
);

const setting = (name, value) => `\\SSHD Setting\\${name} == ${value}`;

/** Add current APWorld features without replacing unrelated baseline logic. */
export function applySshdWorldFeatures(dump, options) {
    const items = new Set(dump.items);
    for (const definition of features.settings) {
        const command = definition.name.replaceAll('_', '-');
        const choices = definition.options.map(
            (entry) => Object.keys(entry)[0],
        );
        const option = {
            name: definition.pretty_name,
            command,
            type: 'singlechoice',
            choices,
            default: definition.default_option,
            bits: Math.max(1, Math.ceil(Math.log2(choices.length))),
            help: definition.options.flatMap(Object.values).join(' '),
        };
        const index = options.findIndex((entry) => entry.command === command);
        if (index === -1) options.push(option);
        else options[index] = option;
        for (const choice of choices)
            items.add(setting(definition.name, choice));
    }

    for (const statue of features.statues) {
        const area = dump.areas.sub_areas[statue.world].sub_areas[statue.area];
        if (!area) throw new Error(`Missing bird statue area: ${statue.area}`);
        const id = `${area.name}\\${statue.location}`;
        dump.checks[id] = {
            'original item': 'Green Rupee',
            type: 'Bird Statues, Custom Flag',
            short_name: statue.location,
        };
        area.locations[statue.location] = 'True';
        area.hint_region = statue.location.split(' - ')[0];
        items.add(id);
        items.add(statue.item);

        const pillar =
            dump.areas.sub_areas.Sky.sub_areas[`${statue.world} Pillar`];
        const exit = `${pillar.name}\\Exit to ${statue.area}`;
        const off = setting('bird_statues_need_unlock', 'off');
        const on = setting('bird_statues_need_unlock', 'on');
        if (!pillar.exits[exit])
            throw new Error(`Missing bird statue exit: ${exit}`);
        // Keep vanilla discovery logic when disabled, but never let discovery
        // substitute for an unlock item when statue randomization is enabled.
        const discovery = Object.keys(area.locations).find((name) =>
            name.startsWith('\\Unlock '),
        );
        if (!discovery)
            throw new Error(
                `Missing bird statue discovery event: ${statue.area}`,
            );
        pillar.exits[exit] =
            `(${discovery} & ${off}) | (${statue.item} & ${on})`;
        pillar.exits[`\\Sky\\${statue.world} Region Entrance`] = off;
    }

    const cubeItems = new Set(
        Object.values(dump.checks)
            .filter((check) => check.type?.includes('Goddess Cube'))
            .map((check) => check['original item']),
    );
    const visit = (area) => {
        for (const [location, requirement] of Object.entries(
            area.locations ?? {},
        )) {
            const check =
                dump.checks[location] ??
                dump.checks[`${area.name}\\${location}`];
            if (!check?.type?.includes('Goddess Chests')) continue;
            // Preserve local obstacles and time of day; only activation changes.
            area.locations[location] = requirement
                .split(/([()&|])/)
                .map((term) => {
                    const cube = term.trim();
                    if (!cubeItems.has(cube)) return term;
                    return `((${cube} & ${setting('goddess_chest_unlock', 'locked_until_struck')}) | (\\Goddess Sword & ${setting('goddess_chest_unlock', 'unlocked_after_goddess_sword')}) | ${setting('goddess_chest_unlock', 'unlocked_from_start')})`;
                })
                .join('');
        }
        for (const child of Object.values(area.sub_areas)) visit(child);
    };
    visit(dump.areas);
    dump.items = [...items];
}
