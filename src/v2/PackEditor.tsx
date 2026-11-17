import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { logicSelector } from '../logic/Selectors';
import { exitsByIdSelector } from '../tracker/Selectors';
import { CatalogueList, useCatalogue } from './Catalogue';
import { createV1CheckOrder } from './checkOrder';
import type { useMapDocument } from './documentStore';
import {
    expandGroupToMap,
    extractChecks,
    mergeMarkers,
} from './editOperations';
import {
    ExportPackDialog,
    MapCreationDialog,
    NameInput,
    NewPackDialog,
} from './EditorDialogs';
import { MapLinkSettings } from './EntranceBindings';
import MapAssociationSettings from './MapAssociationSettings';
import MapCanvas, { Icon } from './MapCanvas';
import {
    linkDestination,
    packWarnings,
    parsePack,
    placedChecks,
    type CheckMarker,
    type MapDocument,
    type MapMarker,
    type PackMap,
} from './pack';
import {
    decodeArchive,
    downloadFile,
    encodeArchive,
    importImage,
} from './packIO';
import { checkArchiveSize } from './packLimits';
import { ResizableCatalogue, ResizableWorkspace } from './ResizablePanels';
import styles from './v2.module.css';

const newId = () => window.crypto.randomUUID();
const afterPaint = () =>
    new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });

export default function PackEditor({
    store,
    defaultDocument,
}: {
    store: ReturnType<typeof useMapDocument>;
    defaultDocument: MapDocument;
}) {
    const {
        document,
        update,
        undo,
        redo,
        canUndo,
        canRedo,
        saveState,
        isExported,
        markExported,
    } = store;
    const { pack, images } = document;
    const logic = useSelector(logicSelector);
    const exits = useSelector(exitsByIdSelector);
    const catalogue = useCatalogue();
    const orderChecks = useMemo(() => createV1CheckOrder(logic), [logic]);
    const [mapId, setMapId] = useState(pack.maps[0].id);
    const map = pack.maps.find((entry) => entry.id === mapId) ?? pack.maps[0];
    const mapListRef = useRef<HTMLDivElement>(null);
    const activeMapRef = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        const list = mapListRef.current;
        const active = activeMapRef.current;
        if (!list || !active) return;
        const viewport = list.getBoundingClientRect();
        const button = active.getBoundingClientRect();
        // Reveal only inside the map list, without moving the page or other panels.
        if (button.top < viewport.top)
            list.scrollTop -= viewport.top - button.top;
        else if (button.bottom > viewport.bottom)
            list.scrollTop += button.bottom - viewport.bottom;
    });
    const [selectedId, setSelectedRaw] = useState<string>();
    const [memberSelection, setMemberSelection] = useState<Set<string>>(
        () => new Set(),
    );
    const [memberQuery, setMemberQuery] = useState('');
    const setSelectedId = (id: string | undefined) => {
        setSelectedRaw(id);
        setMemberSelection(new Set());
        setMemberQuery('');
    };
    const selected = map.markers.find((entry) => entry.id === selectedId);
    const [query, setQuery] = useState('');
    const [region, setRegion] = useState('');
    const [onlyUnplaced, setOnlyUnplaced] = useState(false);
    const [selectedChecks, setSelectedChecks] = useState<Set<string>>(
        () => new Set(),
    );
    const [placement, setPlacement] = useState<'checks' | 'link'>();
    const [target, setTarget] = useState(
        () => pack.maps.find((entry) => entry.id !== map.id)?.id ?? map.id,
    );
    const linkTarget = pack.maps.some((entry) => entry.id === target)
        ? target
        : pack.maps[0].id;
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const [creation, setCreation] = useState<{
        mode: 'map' | 'pack' | 'submap';
        name: string;
        sourceId?: string;
        checkIds?: string[];
    }>();
    const [exporting, setExporting] = useState(false);
    const placed = placedChecks(pack);
    const placedCount = catalogue.filter((entry) =>
        placed.has(entry.id),
    ).length;
    const regions = useMemo(
        () =>
            [...new Set(catalogue.map((entry) => entry.region))].sort((a, b) =>
                a.localeCompare(b),
            ),
        [catalogue],
    );
    const matches = catalogue.filter(
        (entry) =>
            (!region || entry.region === region) &&
            entry.name.toLowerCase().includes(query.toLowerCase()) &&
            (!onlyUnplaced || !placed.has(entry.id)),
    );
    const warnings = packWarnings(
        pack,
        new Set(catalogue.map((entry) => entry.id)),
        new Set(Object.keys(logic.areaGraph.exits)),
        new Set(Object.keys(logic.areaGraph.entrances)),
    );
    const names = useMemo(
        () =>
            Object.fromEntries(
                catalogue.map((entry) => [entry.id, entry.name]),
            ),
        [catalogue],
    );
    const editAction = (action: () => void) => {
        try {
            action();
        } catch (error) {
            setMessage(String(error));
        }
    };
    const memberMatches =
        selected?.kind === 'checks'
            ? orderChecks(selected.checkIds).filter((id) =>
                  (names[id] ?? id)
                      .toLowerCase()
                      .includes(memberQuery.toLowerCase()),
              )
            : [];
    const commit = (next: MapDocument) => {
        parsePack(next.pack);
        const stamped = update(next);
        setMessage('');
        return stamped;
    };
    const updateMap = (next: PackMap) =>
        commit({
            ...document,
            pack: {
                ...pack,
                maps: pack.maps.map((entry) =>
                    entry.id === map.id ? next : entry,
                ),
            },
        });
    const updateMarker = (next: MapMarker) =>
        updateMap({
            ...map,
            markers: map.markers.map((marker) =>
                marker.id === next.id ? next : marker,
            ),
        });
    const extractSelection = (
        sourceId: string,
        ids: string[],
        position?: { x: number; y: number },
        targetId?: string,
        keepSourceSelected = false,
    ) => {
        const next = extractChecks(
            map,
            sourceId,
            ids,
            names,
            newId,
            position,
            targetId,
        );
        const created = next.markers.find(
            (entry) => !map.markers.some((old) => old.id === entry.id),
        );
        updateMap(next);
        if (
            !keepSourceSelected ||
            !next.markers.some((entry) => entry.id === sourceId)
        ) {
            setSelectedId(targetId ?? created?.id ?? sourceId);
        }
    };
    const toggleCheck = (id: string) =>
        setSelectedChecks((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const perform = async (action: () => Promise<void>) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            setMessage(String(error));
        } finally {
            setBusy(false);
            setImportStatus('');
        }
    };
    const addImage = async (
        file: File,
        replace: boolean,
        name?: string,
        sourceId?: string,
        selectedIds?: string[],
    ) => {
        const image = await importImage(file);
        const path = `images/${newId()}.${file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png'}`;
        if (sourceId) {
            const result = expandGroupToMap(
                pack,
                map.id,
                sourceId,
                newId,
                {
                    name: name ?? 'New map',
                    image: path,
                    width: image.width,
                    height: image.height,
                },
                selectedIds,
            );
            commit({
                pack: result.pack,
                images: { ...images, [path]: image.url },
            });
            setMapId(result.mapId);
            setSelectedId(undefined);
            setPlacement(undefined);
            return;
        }
        const nextMap: PackMap = replace
            ? {
                  ...map,
                  image: path,
                  width: image.width,
                  height: image.height,
                  markers: map.markers.map((marker) => ({
                      ...marker,
                      x: Math.round((marker.x / map.width) * image.width),
                      y: Math.round((marker.y / map.height) * image.height),
                  })),
              }
            : {
                  id: newId(),
                  name: name ?? file.name.replace(/\.[^.]+$/, ''),
                  image: path,
                  width: image.width,
                  height: image.height,
                  entranceIds: [],
                  markers: [],
              };
        commit({
            pack: {
                ...pack,
                maps: replace
                    ? pack.maps.map((entry) =>
                          entry.id === map.id ? nextMap : entry,
                      )
                    : [...pack.maps, nextMap],
            },
            images: { ...images, [path]: image.url },
        });
        setMapId(nextMap.id);
        setSelectedId(undefined);
        setSelectedChecks(new Set());
        setPlacement(undefined);
        setTarget(nextMap.id);
    };
    const place = (x: number, y: number) => {
        if (!placement) return;
        const checkIds = [...selectedChecks];
        if (placement === 'checks' && !checkIds.length) {
            setMessage('Select at least one check.');
            return;
        }
        const marker: MapMarker =
            placement === 'checks'
                ? {
                      id: newId(),
                      kind: 'checks',
                      label:
                          checkIds.length === 1
                              ? logic.checks[checkIds[0]].name
                              : 'Multi-check',
                      x,
                      y,
                      checkIds,
                  }
                : {
                      id: newId(),
                      kind: 'link',
                      label:
                          pack.maps.find((entry) => entry.id === linkTarget)
                              ?.name ?? 'Map link',
                      x,
                      y,
                      targetMapId: linkTarget,
                  };
        updateMap({ ...map, markers: [...map.markers, marker] });
        setSelectedId(marker.id);
        setSelectedChecks(new Set());
        setPlacement(undefined);
    };
    const deleteMap = () => {
        if (
            pack.maps.length <= 1 ||
            !window.confirm(`Delete ${map.name} and links pointing to it?`)
        )
            return;
        const maps = pack.maps
            .filter((entry) => entry.id !== map.id)
            .map((entry) => ({
                ...entry,
                markers: entry.markers.filter(
                    (marker) =>
                        marker.kind !== 'link' || marker.targetMapId !== map.id,
                ),
            }));
        commit({ ...document, pack: { ...pack, maps } });
        setMapId(maps[0].id);
        setSelectedId(undefined);
    };
    const changeReferences = (marker: CheckMarker, ids: string[]) => {
        if (!ids.length) return;
        updateMarker({ ...marker, checkIds: [...new Set(ids)] });
    };
    return (
        <div className={styles.app}>
            <header className={`${styles.header} ${styles.editorHeader}`}>
                <div className={styles.packIdentity}>
                    <div className={styles.packHeading}>
                        <label htmlFor="v2-pack-name">Map pack</label>
                        <span
                            role="status"
                            className={styles.saveStatus}
                            data-state={
                                saveState === 'Saved locally'
                                    ? isExported
                                        ? 'complete'
                                        : 'pending'
                                    : [
                                            'Saving…',
                                            'Loading draft…',
                                            'Unsaved changes',
                                        ].includes(saveState)
                                      ? 'pending'
                                      : 'error'
                            }
                        >
                            {saveState} ·{' '}
                            {isExported ? 'Exported' : 'Unexported changes'}
                        </span>
                    </div>
                    <NameInput
                        label="Pack name"
                        value={pack.name}
                        onChange={(name) =>
                            commit({
                                ...document,
                                pack: { ...pack, name },
                            })
                        }
                    />
                </div>
                <div className={styles.actions}>
                    <button
                        type="button"
                        onClick={() => setCreation({ mode: 'pack', name: '' })}
                    >
                        <Icon name="file" /> New pack
                    </button>
                    <button
                        type="button"
                        aria-label="Undo"
                        title="Undo"
                        onClick={undo}
                        disabled={!canUndo}
                    >
                        <Icon name="undo" />
                    </button>
                    <button
                        type="button"
                        aria-label="Redo"
                        title="Redo"
                        onClick={redo}
                        disabled={!canRedo}
                    >
                        <Icon name="redo" />
                    </button>
                    <label className={styles.fileLabel}>
                        <Icon name="folder-open" /> Import pack
                        <input
                            aria-label="Import pack"
                            type="file"
                            accept=".zip"
                            disabled={busy}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file)
                                    void perform(async () => {
                                        setMessage('');
                                        checkArchiveSize(file.size);
                                        setImportStatus('Reading map pack…');
                                        await afterPaint();
                                        const bytes = new Uint8Array(
                                            await file.arrayBuffer(),
                                        );
                                        setImportStatus(
                                            'Processing maps and images…',
                                        );
                                        await afterPaint();
                                        const next = decodeArchive(bytes);
                                        setImportStatus('Finalizing import…');
                                        await afterPaint();
                                        const stamped = commit(next);
                                        await markExported(stamped);
                                        setMapId(next.pack.maps[0].id);
                                        setSelectedId(undefined);
                                        setMessage('Map pack imported.');
                                    });
                            }}
                        />
                    </label>
                    {importStatus && (
                        <span
                            role="status"
                            aria-label="Pack import status"
                            aria-live="polite"
                        >
                            <i
                                className="fas fa-spinner fa-spin"
                                aria-hidden="true"
                            />{' '}
                            {importStatus}
                        </span>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setExporting(true)}
                    >
                        <Icon name="download" /> Export pack
                    </button>
                </div>
                <nav>
                    <Link to="/v2">Preview Tracker</Link>
                </nav>
            </header>
            <ResizableWorkspace
                storageKey="editor"
                left={
                    <aside
                        className={`${styles.sidebar} ${styles.editorCatalogue}`}
                    >
                        <ResizableCatalogue
                            maps={
                                <>
                                    <div className={styles.sectionHeading}>
                                        <h2>Maps ({pack.maps.length})</h2>
                                        <button
                                            type="button"
                                            aria-label="New map"
                                            title="New map"
                                            onClick={() =>
                                                setCreation({
                                                    mode: 'map',
                                                    name: '',
                                                })
                                            }
                                        >
                                            <Icon name="plus" />
                                        </button>
                                    </div>
                                    <div
                                        className={`${styles.list} ${styles.scroll}`}
                                        role="navigation"
                                        aria-label="Maps"
                                        ref={mapListRef}
                                    >
                                        {pack.maps.map((entry) => (
                                            <button
                                                type="button"
                                                key={entry.id}
                                                ref={
                                                    entry.id === map.id
                                                        ? activeMapRef
                                                        : undefined
                                                }
                                                aria-label={`Edit ${entry.name}`}
                                                aria-pressed={
                                                    entry.id === map.id
                                                }
                                                onClick={() => {
                                                    setMapId(entry.id);
                                                    setSelectedId(undefined);
                                                    setPlacement(undefined);
                                                }}
                                            >
                                                <Icon name="map" /> {entry.name}
                                                <small>
                                                    {entry.markers.length}{' '}
                                                    checks / links
                                                </small>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            }
                        >
                            <div className={styles.sectionHeading}>
                                <h2>Check catalogue</h2>
                            </div>
                            <div className={styles.catalogueFilters}>
                                <input
                                    aria-label="Search catalogue"
                                    placeholder="Search checks"
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                />
                                <div className={styles.catalogueActions}>
                                    <button
                                        type="button"
                                        disabled={!matches.length}
                                        onClick={() =>
                                            setSelectedChecks(
                                                new Set(
                                                    matches.map(
                                                        (entry) => entry.id,
                                                    ),
                                                ),
                                            )
                                        }
                                    >
                                        Select all
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!selectedChecks.size}
                                        onClick={() =>
                                            setSelectedChecks(new Set())
                                        }
                                    >
                                        Clear
                                    </button>
                                </div>
                                <select
                                    aria-label="Catalogue region"
                                    value={region}
                                    onChange={(event) =>
                                        setRegion(event.target.value)
                                    }
                                >
                                    <option value="">All regions</option>
                                    {regions.map((entry) => (
                                        <option key={entry} value={entry}>
                                            {entry}
                                        </option>
                                    ))}
                                </select>
                                <label className={styles.unplacedFilter}>
                                    <input
                                        type="checkbox"
                                        checked={onlyUnplaced}
                                        onChange={(event) =>
                                            setOnlyUnplaced(
                                                event.target.checked,
                                            )
                                        }
                                    />
                                    Unplaced
                                </label>
                            </div>
                            <span className={styles.muted}>
                                {matches.length} matches · {selectedChecks.size}{' '}
                                selected
                            </span>
                            <div className={styles.scroll}>
                                <CatalogueList
                                    height="fill"
                                    entries={matches}
                                    selected={selectedChecks}
                                    onToggle={toggleCheck}
                                />
                            </div>
                            <button
                                type="button"
                                aria-pressed={placement === 'checks'}
                                disabled={!selectedChecks.size}
                                onClick={() =>
                                    setPlacement(
                                        placement === 'checks'
                                            ? undefined
                                            : 'checks',
                                    )
                                }
                            >
                                <Icon name="map-marker-alt" /> Place selected
                                checks
                            </button>
                            <button
                                type="button"
                                disabled={
                                    !selected ||
                                    selected.kind !== 'checks' ||
                                    !selectedChecks.size
                                }
                                onClick={() => {
                                    if (selected?.kind === 'checks') {
                                        changeReferences(selected, [
                                            ...selected.checkIds,
                                            ...selectedChecks,
                                        ]);
                                        setSelectedChecks(new Set());
                                    }
                                }}
                            >
                                Add to selected group
                            </button>
                        </ResizableCatalogue>
                    </aside>
                }
                right={
                    <aside className={`${styles.sidebar} ${styles.inspector}`}>
                        <section className={styles.selectionHeader}>
                            <h2>
                                <label htmlFor="v2-current-selection">
                                    Current selection
                                </label>
                            </h2>
                            <select
                                id="v2-current-selection"
                                aria-label="Select check or link"
                                value={selected?.id ?? ''}
                                onChange={(event) => {
                                    setSelectedId(
                                        event.target.value || undefined,
                                    );
                                    setPlacement(undefined);
                                }}
                            >
                                <option value="">{map.name} (Map)</option>
                                {map.markers.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.label}
                                    </option>
                                ))}
                            </select>
                        </section>
                        <h2 className={styles.selectionType}>
                            <span>Type: </span>
                            {selected
                                ? selected.kind === 'link'
                                    ? 'Map link'
                                    : selected.checkIds.length > 1
                                      ? 'Multi-check'
                                      : 'Check'
                                : 'Map'}
                        </h2>
                        {selected ? (
                            <>
                                <div className={styles.selectionIdentity}>
                                    <label htmlFor="v2-selection-name">
                                        {selected.kind === 'link'
                                            ? 'Link name'
                                            : selected.checkIds.length > 1
                                              ? 'Group name'
                                              : 'Check name'}
                                        <NameInput
                                            label="Selection name"
                                            value={selected.label}
                                            onChange={(label) =>
                                                updateMarker({
                                                    ...selected,
                                                    label,
                                                })
                                            }
                                        />
                                    </label>
                                    {selected.kind === 'checks' && (
                                        <label className={styles.row}>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    selected.showNameOnHover ??
                                                    false
                                                }
                                                onChange={(event) =>
                                                    updateMarker({
                                                        ...selected,
                                                        showNameOnHover:
                                                            event.target
                                                                .checked,
                                                    })
                                                }
                                            />
                                            Show name on hover
                                        </label>
                                    )}
                                </div>
                                <div className={styles.coordinates}>
                                    {(['x', 'y'] as const).map((axis) => (
                                        <label key={axis}>
                                            {axis.toUpperCase()}
                                            <input
                                                aria-label={axis.toUpperCase()}
                                                type="number"
                                                min={0}
                                                max={
                                                    axis === 'x'
                                                        ? map.width
                                                        : map.height
                                                }
                                                value={selected[axis]}
                                                onChange={(event) =>
                                                    updateMarker({
                                                        ...selected,
                                                        [axis]: Math.max(
                                                            0,
                                                            Math.min(
                                                                axis === 'x'
                                                                    ? map.width
                                                                    : map.height,
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                            ),
                                                        ),
                                                    })
                                                }
                                            />
                                        </label>
                                    ))}
                                </div>
                                {selected.kind === 'checks' ? (
                                    <>
                                        <label>
                                            Location note
                                            <textarea
                                                className={styles.locationNote}
                                                rows={1}
                                                value={selected.note ?? ''}
                                                onChange={(event) =>
                                                    updateMarker({
                                                        ...selected,
                                                        note: event.target
                                                            .value,
                                                    })
                                                }
                                            />
                                        </label>
                                        <span className={styles.memberCount}>
                                            {selected.checkIds.length} checks
                                        </span>

                                        <div className={styles.memberSearchRow}>
                                            <input
                                                aria-label="Search group members"
                                                placeholder="Search group members"
                                                value={memberQuery}
                                                onChange={(event) =>
                                                    setMemberQuery(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                            <div
                                                className={
                                                    styles.catalogueActions
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    aria-label="Select all group checks"
                                                    disabled={
                                                        !memberMatches.length
                                                    }
                                                    onClick={() =>
                                                        setMemberSelection(
                                                            new Set(
                                                                memberMatches,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    Select all
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Clear group selection"
                                                    disabled={
                                                        !memberSelection.size
                                                    }
                                                    onClick={() =>
                                                        setMemberSelection(
                                                            new Set(),
                                                        )
                                                    }
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                        <div className={styles.memberList}>
                                            <CatalogueList
                                                height={226}
                                                dragSource={selected.id}
                                                entries={memberMatches.map(
                                                    (id) => ({
                                                        id,
                                                        name: names[id] ?? id,
                                                        region:
                                                            logic.checks[id]
                                                                ?.area ?? '',
                                                        type:
                                                            logic.checks[id]
                                                                ?.type ?? '',
                                                    }),
                                                )}
                                                selected={memberSelection}
                                                onToggle={(id) =>
                                                    setMemberSelection(
                                                        (current) => {
                                                            const next =
                                                                new Set(
                                                                    current,
                                                                );
                                                            if (next.has(id))
                                                                next.delete(id);
                                                            else next.add(id);
                                                            return next;
                                                        },
                                                    )
                                                }
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!memberSelection.size}
                                            onClick={() =>
                                                editAction(() => {
                                                    extractSelection(
                                                        selected.id,
                                                        [...memberSelection],
                                                    );
                                                })
                                            }
                                        >
                                            <Icon name="object-ungroup" />{' '}
                                            Extract selected (
                                            {memberSelection.size})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCreation({
                                                    mode: 'submap',
                                                    name: memberSelection.size
                                                        ? `${selected.label} (selection)`
                                                        : selected.label,
                                                    sourceId: selected.id,
                                                    checkIds:
                                                        memberSelection.size
                                                            ? [
                                                                  ...memberSelection,
                                                              ]
                                                            : undefined,
                                                })
                                            }
                                        >
                                            <Icon name="map" />{' '}
                                            {memberSelection.size
                                                ? 'Create sub-map from selected'
                                                : 'Create sub-map from group'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <MapLinkSettings
                                            key={`${selected.id}:${Boolean(selected.exitId)}`}
                                            link={selected}
                                            pack={pack}
                                            sourceMapId={map.id}
                                            logic={logic}
                                            exits={exits}
                                            onChange={updateMarker}
                                            onNavigate={(id) => {
                                                setMapId(id);
                                                setSelectedId(undefined);
                                                setPlacement(undefined);
                                            }}
                                        />
                                    </>
                                )}
                                <section
                                    className={styles.selectionActions}
                                    aria-label="Remove selection"
                                >
                                    <button
                                        type="button"
                                        className={styles.danger}
                                        onClick={() => {
                                            updateMap({
                                                ...map,
                                                markers: map.markers.filter(
                                                    (entry) =>
                                                        entry.id !==
                                                        selected.id,
                                                ),
                                            });
                                            setSelectedId(undefined);
                                        }}
                                    >
                                        <Icon name="trash" /> Delete{' '}
                                        {selected.kind === 'link'
                                            ? 'map link'
                                            : selected.checkIds.length > 1
                                              ? 'multi-check'
                                              : 'check'}
                                    </button>
                                </section>
                            </>
                        ) : (
                            <>
                                <label htmlFor="v2-map-name">
                                    Map name
                                    <NameInput
                                        label="Map name"
                                        value={map.name}
                                        onChange={(name) =>
                                            updateMap({
                                                ...map,
                                                name,
                                            })
                                        }
                                    />
                                </label>
                                <label className={styles.fileLabel}>
                                    <Icon name="image" /> Replace map image
                                    <input
                                        aria-label="Replace map image"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        disabled={busy}
                                        onChange={(event) => {
                                            const file =
                                                event.target.files?.[0];
                                            event.target.value = '';
                                            if (file)
                                                void perform(() =>
                                                    addImage(file, true),
                                                );
                                        }}
                                    />
                                </label>
                                <MapAssociationSettings
                                    key={map.id}
                                    map={map}
                                    pack={pack}
                                    logic={logic}
                                    onChange={(next) =>
                                        commit({ ...document, pack: next })
                                    }
                                />
                                <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={pack.maps.length <= 1}
                                    onClick={deleteMap}
                                >
                                    <Icon name="trash" /> Delete map
                                </button>
                            </>
                        )}
                        <section className={styles.inspectorSection}>
                            <h2>Create map link</h2>
                            <label>
                                Destination map
                                <select
                                    aria-label="New link destination"
                                    value={linkTarget}
                                    onChange={(event) =>
                                        setTarget(event.target.value)
                                    }
                                >
                                    {pack.maps.map((entry) => (
                                        <option key={entry.id} value={entry.id}>
                                            {entry.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                aria-pressed={placement === 'link'}
                                onClick={() =>
                                    setPlacement(
                                        placement === 'link'
                                            ? undefined
                                            : 'link',
                                    )
                                }
                            >
                                <Icon name="link" /> Place link on map
                            </button>
                        </section>
                        {placement && (
                            <button
                                type="button"
                                onClick={() => setPlacement(undefined)}
                            >
                                Cancel placement
                            </button>
                        )}
                        {warnings.length > 0 && (
                            <details>
                                <summary>
                                    Pack issues ({warnings.length})
                                </summary>
                                <div className={styles.list}>
                                    {warnings.slice(0, 50).map((warning) => (
                                        <span key={warning}>{warning}</span>
                                    ))}
                                </div>
                            </details>
                        )}
                    </aside>
                }
            >
                <MapCanvas
                    key={map.id}
                    map={map}
                    images={images}
                    selected={selectedId}
                    onNavigateLink={(marker) => {
                        const destination = linkDestination(
                            marker,
                            pack,
                            marker.exitId
                                ? exits[marker.exitId]?.entrance?.id
                                : undefined,
                        );
                        if (destination) {
                            setMapId(destination);
                            setSelectedId(undefined);
                            setPlacement(undefined);
                        }
                    }}
                    onSelect={(marker) => {
                        setSelectedId(marker.id);
                        setPlacement(undefined);
                    }}
                    onMove={(id, x, y, mergeInto) => {
                        if (mergeInto) {
                            editAction(() => {
                                updateMap(mergeMarkers(map, id, mergeInto));
                                setSelectedId(mergeInto);
                            });
                            return;
                        }
                        const marker = map.markers.find(
                            (entry) => entry.id === id,
                        );
                        if (marker) updateMarker({ ...marker, x, y });
                    }}
                    onPlace={placement ? place : undefined}
                    onBackgroundClick={() => setSelectedId(undefined)}
                    onDropCheck={(payload, x, y, targetId) =>
                        editAction(() => {
                            const data: unknown = JSON.parse(payload);
                            if (
                                !data ||
                                typeof data !== 'object' ||
                                !('sourceId' in data) ||
                                typeof data.sourceId !== 'string' ||
                                !('checkIds' in data) ||
                                !Array.isArray(data.checkIds) ||
                                !data.checkIds.every(
                                    (id: unknown) => typeof id === 'string',
                                )
                            )
                                throw new Error('Invalid check drag data.');
                            extractSelection(
                                data.sourceId,
                                data.checkIds,
                                { x, y },
                                targetId,
                                !targetId,
                            );
                        })
                    }
                />
            </ResizableWorkspace>
            <footer className={`${styles.footer} ${styles.editorFooter}`}>
                <span
                    className={
                        placedCount === catalogue.length
                            ? styles.completeStatus
                            : styles.errorStatus
                    }
                >
                    {placedCount}/{catalogue.length} checks placed
                </span>
                <span>{pack.maps.length} maps</span>
                {(message || placement) && (
                    <span role="status" className={styles.editorNotice}>
                        {message ||
                            (placement === 'checks'
                                ? `${selectedChecks.size} checks selected · Placement active`
                                : 'Map-link placement active')}
                    </span>
                )}
            </footer>
            {creation?.mode === 'pack' ? (
                <NewPackDialog
                    onClose={() => setCreation(undefined)}
                    onCreate={(name) => {
                        const next = defaultDocument;
                        commit({
                            ...next,
                            pack: { ...next.pack, id: newId(), name },
                        });
                        setMapId(next.pack.maps[0].id);
                        setSelectedId(undefined);
                        setSelectedChecks(new Set());
                        setPlacement(undefined);
                        setTarget(next.pack.maps[0].id);
                        setCreation(undefined);
                    }}
                />
            ) : (
                creation && (
                    <MapCreationDialog
                        mode={creation.mode}
                        initialName={creation.name}
                        onClose={() => setCreation(undefined)}
                        onCreate={(name, file) =>
                            addImage(
                                file,
                                false,
                                name,
                                creation.sourceId,
                                creation.checkIds,
                            )
                        }
                    />
                )
            )}
            {exporting && (
                <ExportPackDialog
                    name={pack.name}
                    onClose={() => setExporting(false)}
                    onExport={async (name) => {
                        const snapshot =
                            name === pack.name
                                ? document
                                : commit({
                                      ...document,
                                      pack: { ...pack, name },
                                  });
                        downloadFile(
                            await encodeArchive(snapshot),
                            `${name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'map-pack'}.zip`,
                        );
                        await markExported(snapshot);
                    }}
                />
            )}
        </div>
    );
}
