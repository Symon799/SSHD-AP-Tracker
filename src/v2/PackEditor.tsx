import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Item,
    Menu,
    Separator,
    useContextMenu,
    type ItemParams,
} from 'react-contexify';
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
    mapCheckIds,
    mergeMarkers,
    positionTransferredMarkers,
} from './editOperations';
import {
    ExportPackDialog,
    MapCreationDialog,
    MoveMarkersDialog,
    NameInput,
    NewPackDialog,
} from './EditorDialogs';
import { MapLinkSettings } from './EntranceBindings';
import MapAssociationSettings from './MapAssociationSettings';
import MapCanvas, { Icon } from './MapCanvas';
import {
    checkEra,
    linkDestination,
    markerEra,
    packWarnings,
    parsePack,
    placedChecks,
    type CheckEra,
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
const markerMenuId = 'v2-marker-menu';
type MarkerMenuContext = {
    ids: ReadonlySet<string>;
    isBatch: boolean;
    position: { x: number; y: number };
    destination?: string;
};
type MarkerMenuItem = ItemParams<MarkerMenuContext>;
const noMarkerTarget = ({ props }: Pick<MarkerMenuItem, 'props'>) =>
    !props?.ids.size;
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
    const [mapId, setActiveMapId] = useState(pack.maps[0].id);
    const [batchSelection, setBatchSelection] = useState<Set<string>>();
    const [choosingDestination, setChoosingDestination] =
        useState<Pick<MarkerMenuContext, 'ids' | 'isBatch'>>();
    const [clipboard, setClipboard] = useState<MapMarker[]>([]);
    const { show: showMarkerMenu } = useContextMenu<MarkerMenuContext>({
        id: markerMenuId,
    });
    const [transfer, setTransfer] = useState<{
        sourceId: string;
        sourceIds: Set<string>;
        markers: MapMarker[];
        sourceBatch?: Set<string>;
        sourceSelection?: string;
        isBatch: boolean;
    }>();
    const setMapId = (id: string) => {
        if (id !== mapId) setBatchSelection(undefined);
        setActiveMapId(id);
    };
    const map = pack.maps.find((entry) => entry.id === mapId) ?? pack.maps[0];
    const markerTitles = useMemo(
        () =>
            Object.fromEntries(
                map.markers
                    .filter((marker) => marker.kind === 'link')
                    .map((marker) => {
                        const destination = linkDestination(
                            marker,
                            pack,
                            marker.exitId
                                ? exits[marker.exitId]?.entrance?.id
                                : undefined,
                        );
                        const count = destination
                            ? mapCheckIds(
                                  pack,
                                  destination,
                                  (child) =>
                                      linkDestination(
                                          child,
                                          pack,
                                          child.exitId
                                              ? exits[child.exitId]?.entrance
                                                    ?.id
                                              : undefined,
                                      ) === child.targetMapId,
                              ).length
                            : undefined;
                        return [
                            marker.id,
                            count === undefined
                                ? marker.label
                                : `${marker.label} - ${count.toLocaleString('en-US').replaceAll(',', ' ')} ${count === 1 ? 'check' : 'checks'}`,
                        ];
                    }),
            ),
        [map, pack, exits],
    );
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
    const eraIds =
        selected?.kind === 'checks'
            ? selected.checkIds.filter(
                  (id) => !memberSelection.size || memberSelection.has(id),
              )
            : [];
    const selectedEra =
        markerEra(pack.checkEras, eraIds) ??
        (eraIds.some((id) => checkEra(pack.checkEras, id)) ? 'mixed' : '');
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
    const cancelTransfer = useCallback(() => {
        if (!transfer) return;
        setActiveMapId(transfer.sourceId);
        setBatchSelection(transfer.sourceBatch);
        setSelectedRaw(transfer.sourceSelection);
        setTransfer(undefined);
        setMessage('');
    }, [transfer]);
    useEffect(() => {
        if (!transfer) return;
        const cancelOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented)
                cancelTransfer();
        };
        window.addEventListener('keydown', cancelOnEscape);
        return () => window.removeEventListener('keydown', cancelOnEscape);
    }, [transfer, cancelTransfer]);
    const [busy, setBusy] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const [creation, setCreation] = useState<{
        mode: 'map' | 'pack' | 'submap';
        name: string;
        sourceId?: string;
        checkIds?: string[];
    }>();
    const [exporting, setExporting] = useState(false);
    const placed = useMemo(() => placedChecks(pack), [pack]);
    const placedCount = useMemo(
        () => catalogue.filter((entry) => placed.has(entry.id)).length,
        [catalogue, placed],
    );
    const regions = useMemo(
        () =>
            [...new Set(catalogue.map((entry) => entry.region))].sort((a, b) =>
                a.localeCompare(b),
            ),
        [catalogue],
    );
    const matches = useMemo(() => {
        const search = query.toLowerCase();
        return catalogue.filter(
            (entry) =>
                (!region || entry.region === region) &&
                entry.name.toLowerCase().includes(search) &&
                (!onlyUnplaced || !placed.has(entry.id)),
        );
    }, [catalogue, region, query, onlyUnplaced, placed]);
    const warnings = useMemo(
        () =>
            packWarnings(
                pack,
                new Set(catalogue.map((entry) => entry.id)),
                new Set(Object.keys(logic.areaGraph.exits)),
                new Set(Object.keys(logic.areaGraph.entrances)),
            ),
        [pack, catalogue, logic],
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
    const startTransfer = (destinationId: string) => {
        if (!choosingDestination) return;
        setChoosingDestination(undefined);
        const destination = pack.maps.find(
            (entry) => entry.id === destinationId,
        );
        if (!destination || destination === map) return;
        const markers = map.markers.filter(({ id }) =>
            choosingDestination.ids.has(id),
        );
        if (!markers.length) return;
        const selfLink = markers.find(
            (marker) =>
                marker.kind === 'link' &&
                !marker.exitId &&
                marker.targetMapId === destinationId,
        );
        if (selfLink) {
            setMessage(
                `Deselect "${selfLink.label}" before moving to ${destination.name}: the link would point to its own map.`,
            );
            return;
        }
        const taken = new Set(destination.markers.map(({ id }) => id));
        setTransfer({
            sourceId: map.id,
            sourceIds: new Set(markers.map(({ id }) => id)),
            sourceBatch: batchSelection,
            sourceSelection: selectedId,
            isBatch: choosingDestination.isBatch,
            markers: markers.map((marker) =>
                taken.has(marker.id) ? { ...marker, id: newId() } : marker,
            ),
        });
        setMapId(destinationId);
        setSelectedId(undefined);
        setMessage('');
    };
    const placeTransfer = (x: number, y: number) => {
        if (!transfer) return;
        editAction(() => {
            const markers = positionTransferredMarkers(
                transfer.markers,
                map,
                x,
                y,
            );
            commit({
                ...document,
                pack: {
                    ...pack,
                    maps: pack.maps.map((entry) => {
                        if (entry.id === transfer.sourceId)
                            return {
                                ...entry,
                                markers: entry.markers.filter(
                                    ({ id }) => !transfer.sourceIds.has(id),
                                ),
                            };
                        if (entry.id === map.id)
                            return {
                                ...entry,
                                markers: [...entry.markers, ...markers],
                            };
                        return entry;
                    }),
                },
            });
            selectMarkerResult(markers, transfer.isBatch);
            setTransfer(undefined);
        });
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
    const openMap = (id: string) => {
        setMapId(id);
        setSelectedId(undefined);
        setPlacement(undefined);
    };
    const resolveLink = (marker: MapMarker) =>
        marker.kind === 'link'
            ? linkDestination(
                  marker,
                  pack,
                  marker.exitId
                      ? exits[marker.exitId]?.entrance?.id
                      : undefined,
              )
            : undefined;
    const selectMarkerResult = (
        markers: readonly MapMarker[],
        group: boolean,
    ) => {
        setBatchSelection(
            group ? new Set(markers.map(({ id }) => id)) : undefined,
        );
        setSelectedId(group ? undefined : markers[0]?.id);
    };
    const removeMarkers = (ids: ReadonlySet<string>) =>
        editAction(() => {
            updateMap({
                ...map,
                markers: map.markers.filter(({ id }) => !ids.has(id)),
            });
            if (selectedId && ids.has(selectedId)) setSelectedId(undefined);
            if (batchSelection)
                setBatchSelection(
                    new Set([...batchSelection].filter((id) => !ids.has(id))),
                );
        });
    const pasteMarkers = ({ x, y }: MarkerMenuContext['position']) =>
        editAction(() => {
            if (!clipboard.length) return;
            const selfLink = clipboard.find(
                (marker) =>
                    marker.kind === 'link' &&
                    !marker.exitId &&
                    marker.targetMapId === map.id,
            );
            if (selfLink)
                throw new Error(
                    `Cannot paste "${selfLink.label}" onto its own destination map.`,
                );
            const markers = positionTransferredMarkers(
                clipboard,
                map,
                x,
                y,
            ).map((marker) => ({ ...marker, id: newId() }));
            updateMap({ ...map, markers: [...map.markers, ...markers] });
            selectMarkerResult(
                markers,
                markers.length > 1 || Boolean(batchSelection),
            );
        });
    const updateEra = (era: CheckEra | '') => {
        const checkEras = { ...pack.checkEras };
        for (const id of eraIds) {
            if (era) checkEras[id] = era;
            else delete checkEras[id];
        }
        commit({ ...document, pack: { ...pack, checkEras } });
    };
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
            <header
                className={`${styles.header} ${styles.editorHeader}`}
                inert={Boolean(transfer)}
            >
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
                        inert={Boolean(transfer)}
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
                    <aside
                        className={`${styles.sidebar} ${styles.inspector}`}
                        inert={Boolean(transfer)}
                    >
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
                                        <label>
                                            {memberSelection.size
                                                ? 'Timeline (selected checks)'
                                                : 'Timeline'}
                                            <select
                                                aria-label="Check timeline"
                                                value={selectedEra}
                                                disabled={!eraIds.length}
                                                onChange={(event) =>
                                                    updateEra(
                                                        event.target.value as
                                                            | CheckEra
                                                            | '',
                                                    )
                                                }
                                            >
                                                <option value="">None</option>
                                                <option value="past">
                                                    Past
                                                </option>
                                                <option value="present">
                                                    Present
                                                </option>
                                                {selectedEra === 'mixed' && (
                                                    <option
                                                        value="mixed"
                                                        disabled
                                                    >
                                                        Mixed
                                                    </option>
                                                )}
                                            </select>
                                        </label>

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
                                            removeMarkers(
                                                new Set([selected.id]),
                                            );
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
                    markerTitles={markerTitles}
                    checkEras={pack.checkEras}
                    onTransformChecks={updateMap}
                    batchSelection={batchSelection}
                    onBatchChange={setBatchSelection}
                    onMarkerMenu={(event, ids, position, isBatch) => {
                        const marker =
                            ids.size === 1
                                ? map.markers.find(({ id }) => ids.has(id))
                                : undefined;
                        showMarkerMenu({
                            event,
                            props: {
                                ids,
                                position,
                                isBatch,
                                destination: marker && resolveLink(marker),
                            },
                        });
                    }}
                    transferPreview={transfer?.markers}
                    onCancelTransfer={cancelTransfer}
                    images={images}
                    selected={selectedId}
                    onNavigateLink={(marker) => {
                        const destination = resolveLink(marker);
                        if (destination) openMap(destination);
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
                    onPlace={
                        transfer ? placeTransfer : placement ? place : undefined
                    }
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
                {(message || placement || transfer) && (
                    <span role="status" className={styles.editorNotice}>
                        {message ||
                            (transfer
                                ? `Click to place ${transfer.markers.length} ${transfer.markers.length === 1 ? 'marker' : 'markers'} on ${map.name}`
                                : placement === 'checks'
                                  ? `${selectedChecks.size} checks selected · Placement active`
                                  : 'Map-link placement active')}
                    </span>
                )}
            </footer>
            <Menu
                id={markerMenuId}
                animation={false}
                className={styles.markerMenu}
                aria-label="Map marker actions"
            >
                <Item
                    hidden={({ props }: Pick<MarkerMenuItem, 'props'>) =>
                        !props?.destination
                    }
                    onClick={({ props }: MarkerMenuItem) => {
                        if (props?.destination) openMap(props.destination);
                    }}
                >
                    <Icon name="arrow-right" /> Go to map
                </Item>
                <Item
                    hidden={noMarkerTarget}
                    disabled={pack.maps.length < 2}
                    onClick={({ props }: MarkerMenuItem) =>
                        setChoosingDestination(props)
                    }
                >
                    <Icon name="exchange-alt" /> Move to map
                </Item>
                <Item
                    hidden={noMarkerTarget}
                    onClick={({ props }: MarkerMenuItem) => {
                        if (!props) return;
                        const markers = map.markers.filter(({ id }) =>
                            props.ids.has(id),
                        );
                        setClipboard(markers);
                        setMessage(
                            `Copied ${markers.length} ${markers.length === 1 ? 'marker' : 'markers'}.`,
                        );
                    }}
                >
                    <Icon name="copy" /> Copy
                </Item>
                <Item
                    disabled={!clipboard.length}
                    onClick={({ props }: MarkerMenuItem) => {
                        if (props) pasteMarkers(props.position);
                    }}
                >
                    <Icon name="paste" /> Paste
                </Item>
                <Separator hidden={noMarkerTarget} />
                <Item
                    className={styles.markerMenuDelete}
                    hidden={noMarkerTarget}
                    onClick={({ props }: MarkerMenuItem) => {
                        if (props) removeMarkers(props.ids);
                    }}
                >
                    <Icon name="trash" /> Delete
                </Item>
            </Menu>
            {choosingDestination && (
                <MoveMarkersDialog
                    destinations={pack.maps.filter(
                        (entry) => entry.id !== map.id,
                    )}
                    onClose={() => setChoosingDestination(undefined)}
                    onContinue={startTransfer}
                />
            )}
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
