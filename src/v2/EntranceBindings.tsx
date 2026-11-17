import { useState } from 'react';
import ReactSelect from 'react-select';
import { selectStyles } from '../customization/ComponentStyles';
import { formatEntranceName } from '../logic/Entrances';
import type { ExitMapping } from '../logic/Locations';
import type { Logic } from '../logic/Logic';
import { Icon } from './MapCanvas';
import { linkDestination, type MapLink, type MapPack } from './pack';
import styles from './v2.module.css';

interface EntranceOption {
    value: string;
    label: string;
    isDisabled?: boolean;
}

export function entranceOptions(
    definitions: Record<string, { short_name: string }>,
): EntranceOption[] {
    const labels = Object.values(definitions).map((entry) =>
        formatEntranceName(entry.short_name),
    );
    const counts = new Map<string, number>();
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return Object.entries(definitions)
        .map(([value, definition]) => {
            const name = formatEntranceName(definition.short_name);
            return {
                value,
                label: counts.get(name)! > 1 ? `${name} [${value}]` : name,
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

function EntrancePicker({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: EntranceOption[];
    value?: string;
    onChange: (id: string) => void;
}) {
    return (
        <div className={styles.entrancePicker}>
            <ReactSelect<EntranceOption>
                aria-label={label}
                options={options}
                value={
                    value
                        ? (options.find((option) => option.value === value) ?? {
                              value,
                              label: value,
                          })
                        : null
                }
                onChange={(option) => {
                    if (option) onChange(option.value);
                }}
                isSearchable
                placeholder="Search by name…"
                noOptionsMessage={() => 'No matching entrances'}
                filterOption={({ data }, input) =>
                    input
                        .toLowerCase()
                        .split(/\s+/)
                        .every((part) =>
                            `${data.label} ${data.value}`
                                .toLowerCase()
                                .includes(part),
                        )
                }
                menuPortalTarget={document.body}
                menuPosition="fixed"
                menuPlacement="auto"
                menuShouldScrollIntoView={false}
                styles={{
                    ...selectStyles<false, EntranceOption>(),
                    menuPortal: (base) => ({
                        ...base,
                        zIndex: 60,
                        fontSize: 12,
                    }),
                    option: (base, state) => ({
                        ...base,
                        color: state.isDisabled
                            ? 'color-mix(in srgb, var(--scheme-text) 45%, transparent)'
                            : 'var(--scheme-text)',
                        backgroundColor: state.isFocused
                            ? 'color-mix(in srgb, var(--scheme-text) 12%, var(--scheme-background))'
                            : 'var(--scheme-background)',
                    }),
                }}
            />
        </div>
    );
}

export function MapLinkSettings({
    link,
    pack,
    sourceMapId,
    logic,
    exits,
    onChange,
    onNavigate,
}: {
    link: MapLink;
    pack: MapPack;
    sourceMapId: string;
    logic: Logic;
    exits: Record<string, ExitMapping>;
    onChange: (next: MapLink) => void;
    onNavigate: (mapId: string) => void;
}) {
    const [entranceMode, setEntranceMode] = useState(Boolean(link.exitId));
    const mapped = link.exitId ? exits[link.exitId]?.entrance : undefined;
    const targetId = linkDestination(link, pack, mapped?.id);
    const target = pack.maps.find((map) => map.id === targetId);
    return (
        <section className={styles.bindingSection} aria-label="Link routing">
            <h2>Link routing</h2>
            <div className={styles.routingModes}>
                <button
                    type="button"
                    aria-pressed={!entranceMode}
                    onClick={() => {
                        setEntranceMode(false);
                        onChange({
                            ...link,
                            exitId: undefined,
                            targetMapId:
                                link.targetMapId ??
                                pack.maps.find((map) => map.id !== sourceMapId)
                                    ?.id ??
                                sourceMapId,
                        });
                    }}
                >
                    Fixed map
                </button>
                <button
                    type="button"
                    aria-pressed={entranceMode}
                    onClick={() => setEntranceMode(true)}
                >
                    Game entrance
                </button>
            </div>
            {entranceMode ? (
                <>
                    <span className={styles.fieldLabel}>Exit on this map</span>
                    <EntrancePicker
                        label="Game exit"
                        options={entranceOptions(logic.areaGraph.exits)}
                        value={link.exitId}
                        onChange={(exitId) =>
                            onChange({ ...link, exitId, navigation: undefined })
                        }
                    />
                    <div className={styles.bindingStatus} role="status">
                        {!link.exitId ? (
                            'No exit associated'
                        ) : !logic.areaGraph.exits[link.exitId] ? (
                            'Unknown exit in this logic version'
                        ) : !mapped ? (
                            'Destination not mapped in Entrances'
                        ) : (
                            <>
                                Arrival: {formatEntranceName(mapped.name)}
                                <br />
                                {target
                                    ? `Map: ${target.name}`
                                    : 'Arrival has no map assigned'}
                            </>
                        )}
                    </div>
                </>
            ) : (
                <label>
                    Destination map
                    <select
                        aria-label="Link destination map"
                        value={link.targetMapId ?? ''}
                        onChange={(event) =>
                            onChange({
                                ...link,
                                targetMapId: event.target.value,
                                exitId: undefined,
                            })
                        }
                    >
                        {!link.targetMapId && (
                            <option value="" disabled>
                                Choose a map
                            </option>
                        )}
                        {pack.maps.map((map) => (
                            <option key={map.id} value={map.id}>
                                {map.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            <button
                type="button"
                disabled={!target || (entranceMode && !link.exitId)}
                onClick={() => {
                    if (target) onNavigate(target.id);
                }}
            >
                <Icon name="sign-out-alt" /> Go to destination
            </button>
        </section>
    );
}
