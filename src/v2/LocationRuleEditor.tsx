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
    const fields = [
        ['Room', room, setRoom],
        ['Layer', layer, setLayer],
        ['Arrival', entrance, setEntrance],
    ] as const;
    return (
        <details className={styles.bindingSection}>
            <summary>Auto map following ({rules.length})</summary>
            <input
                aria-label="Tracking stage"
                placeholder="Stage ID"
                list="v2-stage-options"
                value={stage}
                onChange={(event) => setStage(event.target.value)}
            />
            <datalist id="v2-stage-options">
                {Object.entries({ F000: 'Skyloft', ...stageRegions }).map(
                    ([id, name]) => (
                        <option key={id} value={id}>
                            {name}
                        </option>
                    ),
                )}
            </datalist>
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
                    <Icon name="plus" /> Add rule
                </button>
                <button
                    type="button"
                    disabled={
                        !telemetry.location || telemetry.state !== 'ready'
                    }
                    title="Fill the stage only; room, layer and arrival remain optional."
                    onClick={() => {
                        if (telemetry.location)
                            setStage(telemetry.location.stage);
                        setRoom('');
                        setLayer('');
                        setEntrance('');
                    }}
                >
                    <Icon name="crosshairs" /> Current stage
                </button>
            </div>
            {error && <span role="alert">{error}</span>}
            <div className={styles.arrivalList}>
                {rules.map((rule) => (
                    <div
                        className={styles.arrivalRow}
                        key={locationRuleKey(rule)}
                    >
                        <span>
                            {rule.stage}
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
