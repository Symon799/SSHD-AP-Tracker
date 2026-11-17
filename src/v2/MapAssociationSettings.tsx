import { useState } from 'react';
import { Dialog } from '../additionalComponents/Dialog';
import { useTrackerTelemetry } from '../archipelago/ClientHooks';
import { formatEntranceName } from '../logic/Entrances';
import type { Logic } from '../logic/Logic';
import { entranceOptions } from './EntranceBindings';
import { areaLabel, gameAreaRegion, gameAreas } from './gameAreas';
import {
    locationRuleKey,
    validLocationRule,
    type LocationRule,
} from './locationTracking';
import {
    applyMapAssociations,
    associationSignature,
    associationTransfers,
} from './mapAssociations';
import { Icon } from './MapCanvas';
import type { MapPack, PackMap } from './pack';
import styles from './v2.module.css';

type Props = {
    map: PackMap;
    pack: MapPack;
    logic: Logic;
    onChange: (pack: MapPack) => void;
};

function AssociationDialog({
    map,
    pack,
    logic,
    onChange,
    onClose,
}: Props & { onClose: () => void }) {
    const telemetry = useTrackerTelemetry();
    const [tab, setTab] = useState<'following' | 'entrances'>('following');
    const [rules, setDraftRules] = useState(map.trackingRules ?? []);
    const [arrivals, setDraftArrivals] = useState(map.entranceIds);
    const [query, setQuery] = useState('');
    const [region, setRegion] = useState('');
    const [room, setRoom] = useState('');
    const [layer, setLayer] = useState('');
    const [spawn, setSpawn] = useState('');
    const [error, setError] = useState('');
    const [confirmation, setConfirmation] = useState<'close' | 'apply'>();
    const dirty =
        associationSignature(rules, arrivals) !==
        associationSignature(map.trackingRules ?? [], map.entranceIds);
    const requestClose = () => {
        if (dirty) setConfirmation('close');
        else onClose();
    };
    const changeRules = (next: LocationRule[]) => {
        setDraftRules(next);
        setError('');
    };
    const changeArrivals = (next: string[]) => {
        setDraftArrivals(next);
        setError('');
    };
    const discardChanges = (closeAfter = false) => {
        setDraftRules(map.trackingRules ?? []);
        setDraftArrivals(map.entranceIds);
        setError('');
        setConfirmation(undefined);
        if (closeAfter) onClose();
    };
    const ruleFor = (stage: string): LocationRule => ({
        stage,
        ...(room !== '' ? { room: Number(room) } : {}),
        ...(layer !== '' ? { layer: Number(layer) } : {}),
        ...(spawn !== '' ? { entrance: Number(spawn) } : {}),
    });
    const addRules = (ids: string[]) => {
        const next = [
            ...new Map(
                [...rules, ...ids.map(ruleFor)].map((rule) => [
                    locationRuleKey(rule),
                    rule,
                ]),
            ).values(),
        ];
        if (!next.every(validLocationRule) || next.length > 200) {
            setError(
                'Invalid advanced conditions or more than 200 game areas.',
            );
            return;
        }
        changeRules(next);
    };
    const allStages = [
        ...new Set([
            ...Object.keys(gameAreas),
            ...pack.maps.flatMap((m) =>
                (m.trackingRules ?? []).map((r) => r.stage),
            ),
            ...(telemetry.location ? [telemetry.location.stage] : []),
        ]),
    ];
    const options =
        tab === 'following'
            ? allStages.map((id) => ({
                  id,
                  name: areaLabel(id),
                  owner: pack.maps.find(
                      (m) =>
                          m.id !== map.id &&
                          (m.trackingRules ?? []).some(
                              (r) =>
                                  locationRuleKey(r) ===
                                  locationRuleKey(ruleFor(id)),
                          ),
                  )?.name,
              }))
            : entranceOptions(logic.areaGraph.entrances).map(
                  ({ value: id, label: name }) => ({
                      id,
                      name,
                      owner: pack.maps.find(
                          (m) => m.id !== map.id && m.entranceIds.includes(id),
                      )?.name,
                  }),
              );
    const matches = options
        .filter(
            (option) =>
                (!region ||
                    tab === 'entrances' ||
                    gameAreaRegion(option.id) === region) &&
                query
                    .toLowerCase()
                    .split(/\s+/)
                    .every((part) =>
                        `${option.name} ${option.id}`
                            .toLowerCase()
                            .includes(part),
                    ),
        )
        .sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        );
    const keys = new Set(rules.map(locationRuleKey));
    const transfers = associationTransfers(pack, map.id, rules, arrivals);
    const applyChanges = (confirmTransfers = false, closeAfter = false) => {
        if (transfers.length && !confirmTransfers) {
            setConfirmation('apply');
            return;
        }
        try {
            onChange(
                applyMapAssociations(
                    pack,
                    map.id,
                    rules,
                    arrivals,
                    confirmTransfers,
                ),
            );
            setError('');
            setConfirmation(undefined);
            if (closeAfter) onClose();
        } catch (cause) {
            setConfirmation(undefined);
            setError(String(cause));
        }
    };
    const arrivalName = (id: string) =>
        formatEntranceName(logic.areaGraph.entrances[id]?.short_name ?? id);
    return (
        <Dialog
            open
            wide
            hideFooter
            title={`Map associations: ${map.name}`}
            onOpenChange={(open) => {
                if (!open) requestClose();
            }}
            focusContentOnOpen
            className={styles.associationHost}
        >
            <div className={`${styles.app} ${styles.associationDialog}`}>
                <button
                    type="button"
                    className={styles.associationClose}
                    aria-label="Close map associations"
                    title="Close map associations"
                    onClick={requestClose}
                >
                    <Icon name="times" />
                </button>
                <div
                    role="tablist"
                    aria-label="Association type"
                    className={styles.associationTabs}
                >
                    {(['following', 'entrances'] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={tab === value}
                            onClick={() => {
                                setTab(value);
                                setQuery('');
                            }}
                        >
                            {value === 'following'
                                ? 'Player following'
                                : 'Entrance destinations'}
                        </button>
                    ))}
                </div>
                <div className={styles.associationBody}>
                    <div className={styles.associationColumns}>
                        <section aria-label="Available associations">
                            <h2>
                                {tab === 'following'
                                    ? 'Game areas'
                                    : 'Entrances ending on this map'}
                            </h2>
                            <input
                                aria-label="Search associations"
                                placeholder="Search by name or ID"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            {tab === 'following' && (
                                <select
                                    aria-label="Game area region"
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                >
                                    <option value="">All regions</option>
                                    {[
                                        'Sky / Skyloft',
                                        'Faron',
                                        'Eldin',
                                        'Lanayru',
                                        'Sealed Grounds',
                                    ].map((value) => (
                                        <option key={value}>{value}</option>
                                    ))}
                                </select>
                            )}
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    disabled={!matches.length}
                                    onClick={() => {
                                        if (tab === 'following')
                                            addRules(matches.map((m) => m.id));
                                        else
                                            changeArrivals([
                                                ...new Set([
                                                    ...arrivals,
                                                    ...matches.map((m) => m.id),
                                                ]),
                                            ]);
                                    }}
                                >
                                    Select filtered
                                </button>
                                <button
                                    type="button"
                                    disabled={!matches.length}
                                    onClick={() => {
                                        const ids = new Set(
                                            matches.map((m) => m.id),
                                        );
                                        if (tab === 'following')
                                            changeRules(
                                                rules.filter(
                                                    (r) =>
                                                        !matches.some(
                                                            (m) =>
                                                                locationRuleKey(
                                                                    ruleFor(
                                                                        m.id,
                                                                    ),
                                                                ) ===
                                                                locationRuleKey(
                                                                    r,
                                                                ),
                                                        ),
                                                ),
                                            );
                                        else
                                            changeArrivals(
                                                arrivals.filter(
                                                    (id) => !ids.has(id),
                                                ),
                                            );
                                    }}
                                >
                                    Clear selection
                                </button>
                            </div>
                            {tab === 'following' && (
                                <>
                                    <button
                                        type="button"
                                        disabled={
                                            !telemetry.location ||
                                            telemetry.state !== 'ready'
                                        }
                                        onClick={() => {
                                            if (telemetry.location)
                                                addRules([
                                                    telemetry.location.stage,
                                                ]);
                                        }}
                                    >
                                        <Icon name="crosshairs" /> Use player's
                                        current area
                                    </button>
                                    <span className={styles.muted}>
                                        {telemetry.location
                                            ? `Current area: ${areaLabel(telemetry.location.stage)}`
                                            : 'Player location unavailable'}
                                    </span>
                                    <details>
                                        <summary>
                                            Advanced conditions (optional)
                                        </summary>
                                        <div className={styles.trackingFields}>
                                            {(
                                                [
                                                    ['Room', room, setRoom],
                                                    ['Layer', layer, setLayer],
                                                    [
                                                        'Spawn index',
                                                        spawn,
                                                        setSpawn,
                                                    ],
                                                ] as const
                                            ).map(([label, value, setter]) => (
                                                <label key={String(label)}>
                                                    {String(label)}
                                                    <input
                                                        aria-label={`Tracking ${label}`}
                                                        type="number"
                                                        min={0}
                                                        max={65535}
                                                        placeholder="Any"
                                                        value={value}
                                                        onChange={(e) =>
                                                            setter(
                                                                e.target.value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </details>
                                </>
                            )}
                            <div className={styles.associationOptions}>
                                {matches.map((option) => (
                                    <label key={option.id}>
                                        <input
                                            type="checkbox"
                                            aria-label={option.name}
                                            checked={
                                                tab === 'following'
                                                    ? keys.has(
                                                          locationRuleKey(
                                                              ruleFor(
                                                                  option.id,
                                                              ),
                                                          ),
                                                      )
                                                    : arrivals.includes(
                                                          option.id,
                                                      )
                                            }
                                            onChange={(e) => {
                                                if (tab === 'following') {
                                                    if (e.target.checked)
                                                        addRules([option.id]);
                                                    else
                                                        changeRules(
                                                            rules.filter(
                                                                (r) =>
                                                                    locationRuleKey(
                                                                        r,
                                                                    ) !==
                                                                    locationRuleKey(
                                                                        ruleFor(
                                                                            option.id,
                                                                        ),
                                                                    ),
                                                            ),
                                                        );
                                                } else
                                                    changeArrivals(
                                                        e.target.checked
                                                            ? [
                                                                  ...arrivals,
                                                                  option.id,
                                                              ]
                                                            : arrivals.filter(
                                                                  (id) =>
                                                                      id !==
                                                                      option.id,
                                                              ),
                                                    );
                                            }}
                                        />
                                        <span>
                                            {option.name}
                                            {option.owner && (
                                                <small>
                                                    Assigned to {option.owner}
                                                </small>
                                            )}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </section>
                        <section aria-label="Selected associations">
                            <h2>
                                {tab === 'following'
                                    ? `Associated game areas (${rules.length})`
                                    : `Associated entrances (${arrivals.length})`}
                            </h2>
                            <div className={styles.associationOptions}>
                                {tab === 'following'
                                    ? rules.map((r) => (
                                          <div
                                              key={locationRuleKey(r)}
                                              className={styles.arrivalRow}
                                          >
                                              <span>
                                                  {areaLabel(r.stage)}
                                                  {r.room !== undefined
                                                      ? ` / room ${r.room}`
                                                      : ''}
                                                  {r.layer !== undefined
                                                      ? ` / layer ${r.layer}`
                                                      : ''}
                                                  {r.entrance !== undefined
                                                      ? ` / spawn ${r.entrance}`
                                                      : ''}
                                              </span>
                                              <button
                                                  type="button"
                                                  aria-label={`Remove game area ${locationRuleKey(r)}`}
                                                  onClick={() =>
                                                      changeRules(
                                                          rules.filter(
                                                              (entry) =>
                                                                  entry !== r,
                                                          ),
                                                      )
                                                  }
                                              >
                                                  <Icon name="times" />
                                              </button>
                                          </div>
                                      ))
                                    : arrivals.map((id) => (
                                          <div
                                              key={id}
                                              className={styles.arrivalRow}
                                          >
                                              <span>{arrivalName(id)}</span>
                                              <button
                                                  type="button"
                                                  aria-label={`Remove arrival ${id}`}
                                                  onClick={() =>
                                                      changeArrivals(
                                                          arrivals.filter(
                                                              (entry) =>
                                                                  entry !== id,
                                                          ),
                                                      )
                                                  }
                                              >
                                                  <Icon name="times" />
                                              </button>
                                          </div>
                                      ))}
                            </div>
                        </section>
                    </div>
                    {error && <span role="alert">{error}</span>}
                </div>
                <div className={styles.associationFooter}>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            disabled={!dirty}
                            onClick={() => applyChanges()}
                        >
                            Apply Changes
                        </button>
                        <button
                            type="button"
                            disabled={!dirty}
                            className={styles.danger}
                            onClick={() => discardChanges()}
                        >
                            Discard Changes
                        </button>
                    </div>
                    <span
                        role="status"
                        className={
                            dirty ? styles.associationDirty : styles.muted
                        }
                    >
                        {dirty ? 'Unapplied changes' : 'No pending changes'}
                    </span>
                </div>
            </div>
            {confirmation && (
                <Dialog
                    open
                    hideFooter
                    focusContentOnOpen
                    title={
                        confirmation === 'apply'
                            ? 'Review association transfers'
                            : 'You have unapplied changes.'
                    }
                    layer={10}
                    contentClassName={styles.associationConfirmation}
                    onOpenChange={(open) => {
                        if (!open) setConfirmation(undefined);
                    }}
                >
                    <div
                        className={`${styles.app} ${styles.closeConfirmation}`}
                    >
                        {transfers.length > 0 && (
                            <section
                                className={styles.associationTransfers}
                                aria-label="Association transfers"
                            >
                                <p>
                                    Applying these changes will move{' '}
                                    {transfers.length} associations to{' '}
                                    <strong>{map.name}</strong>.
                                </p>
                                <ul>
                                    {transfers.map((transfer) => (
                                        <li
                                            key={`${transfer.kind}:${transfer.key}:${transfer.from}`}
                                        >
                                            <strong>
                                                {transfer.kind === 'area'
                                                    ? areaLabel(transfer.id)
                                                    : arrivalName(transfer.id)}
                                            </strong>
                                            <span>
                                                From {transfer.from} to{' '}
                                                {map.name}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        <div className={styles.actions}>
                            <button
                                type="button"
                                onClick={() =>
                                    applyChanges(true, confirmation === 'close')
                                }
                            >
                                {confirmation === 'close'
                                    ? 'Apply & close'
                                    : 'Apply Change'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmation(undefined)}
                            >
                                Keep editing
                            </button>
                            <button
                                type="button"
                                className={styles.danger}
                                onClick={() =>
                                    discardChanges(confirmation === 'close')
                                }
                            >
                                {confirmation === 'close'
                                    ? 'Discard & close'
                                    : 'Discard Changes'}
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
        </Dialog>
    );
}

export default function MapAssociationSettings(props: Props) {
    const [open, setOpen] = useState(false);
    return (
        <section
            className={styles.bindingSection}
            aria-label="Map associations"
        >
            <h2>Map associations</h2>
            <span>
                Player following: {props.map.trackingRules?.length ?? 0} game
                areas
            </span>
            <span>
                Entrance destinations: {props.map.entranceIds.length} entrances
            </span>
            <button type="button" onClick={() => setOpen(true)}>
                <Icon name="cog" /> Configure associations
            </button>
            {open && (
                <AssociationDialog {...props} onClose={() => setOpen(false)} />
            )}
        </section>
    );
}
