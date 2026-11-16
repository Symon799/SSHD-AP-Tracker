import { useState } from 'react';
import { useTrackerTelemetry } from '../archipelago/ClientHooks';
import stageRegions from '../data/stageToRegion.json';
import {
    locationRuleKey,
    validLocationRule,
    type LocationRule,
} from './locationTracking';
import { Icon } from './MapCanvas';
import type { MapPack, PackMap } from './pack';
import styles from './v2.module.css';

export default function LocationRuleEditor({
    map,
    pack,
    onChange,
}: {
    map: PackMap;
    pack: MapPack;
    onChange: (map: PackMap) => void;
}) {
    const telemetry = useTrackerTelemetry();
    const [stage, setStage] = useState('');
    const [room, setRoom] = useState('');
    const [layer, setLayer] = useState('');
    const [entrance, setEntrance] = useState('');
    const [error, setError] = useState('');
    const rules = map.trackingRules ?? [];
    const stages: Record<string, string> = { F000: 'Skyloft', ...stageRegions };
    for (const rule of pack.maps.flatMap((entry) => entry.trackingRules ?? []))
        stages[rule.stage] ??= 'Other game area';
    if (telemetry.location)
        stages[telemetry.location.stage] ??= 'Current game area';
    if (stage) stages[stage] ??= 'Other game area';
    const fields = [
        ['Room', room, setRoom],
        ['Layer', layer, setLayer],
        ['Arrival', entrance, setEntrance],
    ] as const;
    return (
        <details className={styles.bindingSection}>
            <summary>
                Auto-follow: game areas for this map ({rules.length})
            </summary>
            <select
                aria-label="Tracking stage"
                value={stage}
                onChange={(event) => setStage(event.target.value)}
            >
                <option value="">Choose a game area</option>
                {Object.entries(stages)
                    .sort(
                        (a, b) =>
                            a[1].localeCompare(b[1]) ||
                            a[0].localeCompare(b[0]),
                    )
                    .map(([id, name]) => (
                        <option key={id} value={id}>
                            {name} ({id})
                        </option>
                    ))}
            </select>
            <div className={styles.trackingFields}>
                {fields.map(([label, value, setter]) => (
                    <label key={label}>
                        {label}
                        <input
                            aria-label={`Tracking ${label}`}
                            type="number"
                            min={0}
                            max={65535}
                            placeholder="Any"
                            value={value}
                            onChange={(event) => setter(event.target.value)}
                        />
                    </label>
                ))}
            </div>
            <div className={styles.actions}>
                <button
                    type="button"
                    disabled={!stage.trim() || rules.length >= 200}
                    onClick={() => {
                        const rule: LocationRule = {
                            stage: stage.trim(),
                            ...(room !== '' ? { room: Number(room) } : {}),
                            ...(layer !== '' ? { layer: Number(layer) } : {}),
                            ...(entrance !== ''
                                ? { entrance: Number(entrance) }
                                : {}),
                        };
                        if (!validLocationRule(rule)) {
                            setError(
                                'Invalid stage or room/layer/arrival number.',
                            );
                            return;
                        }
                        const owner = pack.maps.find((entry) =>
                            (entry.trackingRules ?? []).some(
                                (current) =>
                                    locationRuleKey(current) ===
                                    locationRuleKey(rule),
                            ),
                        );
                        if (owner) {
                            setError(
                                `This rule already belongs to ${owner.name}.`,
                            );
                            return;
                        }
                        onChange({ ...map, trackingRules: [...rules, rule] });
                        setError('');
                    }}
                >
                    <Icon name="plus" /> Associate game area
                </button>
                <button
                    type="button"
                    disabled={
                        !telemetry.location || telemetry.state !== 'ready'
                    }
                    title="Select the player's current game area. Available only when the client sends player location data."
                    onClick={() => {
                        if (telemetry.location)
                            setStage(telemetry.location.stage);
                        setRoom('');
                        setLayer('');
                        setEntrance('');
                    }}
                >
                    <Icon name="crosshairs" /> Use player's area
                </button>
            </div>
            {error && <span role="alert">{error}</span>}
            <div
                className={styles.arrivalList}
                aria-label="Game areas associated with this map"
            >
                {rules.map((rule) => (
                    <div
                        className={styles.arrivalRow}
                        key={locationRuleKey(rule)}
                    >
                        <span>
                            {stages[rule.stage]} ({rule.stage})
                            {rule.room !== undefined
                                ? ` / room ${rule.room}`
                                : ''}
                            {rule.layer !== undefined
                                ? ` / layer ${rule.layer}`
                                : ''}
                            {rule.entrance !== undefined
                                ? ` / arrival ${rule.entrance}`
                                : ''}
                        </span>
                        <button
                            type="button"
                            aria-label={`Remove tracking rule ${locationRuleKey(rule)}`}
                            title="Remove tracking rule"
                            onClick={() =>
                                onChange({
                                    ...map,
                                    trackingRules: rules.filter(
                                        (current) => current !== rule,
                                    ),
                                })
                            }
                        >
                            <Icon name="times" />
                        </button>
                    </div>
                ))}
            </div>
        </details>
    );
}
