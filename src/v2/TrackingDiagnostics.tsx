import { useState } from 'react';
import { useSelector, useStore } from 'react-redux';
import { useTrackerTelemetry } from '../archipelago/ClientHooks';
import { formatEntranceName } from '../logic/Entrances';
import { logicSelector } from '../logic/Selectors';
import { useAppDispatch, type RootState } from '../store/Store';
import panelStyles from '../Tracker.module.css';
import { entrancePoolsSelector, exitsByIdSelector } from '../tracker/Selectors';
import { mapEntrance } from '../tracker/Slice';
import { reviewDiscovery } from './entranceDiscoveries';
import { matchPlayerMap } from './locationTracking';
import type { MapPack } from './pack';
import styles from './v2.module.css';

export default function TrackingDiagnostics({ pack }: { pack: MapPack }) {
    const telemetry = useTrackerTelemetry();
    const logic = useSelector(logicSelector);
    const exits = useSelector(exitsByIdSelector);
    const pools = useSelector(entrancePoolsSelector);
    const store = useStore<RootState>();
    const dispatch = useAppDispatch();
    const [result, setResult] = useState('');
    const match = matchPlayerMap(pack, telemetry.location);
    const ready = telemetry.discoveries.filter(
        (entry) =>
            reviewDiscovery(entry, telemetry.discoveries, exits, pools) ===
            'Ready',
    );
    return (
        <section
            className={panelStyles.toolsCard}
            aria-label="Player tracking diagnostics"
        >
            <div className={panelStyles.toolsTitle}>Player tracking</div>
            <div className={styles.telemetryDetails}>
                <div>Status: {telemetry.state}</div>
                <div>Sequence: {telemetry.sequence}</div>
                <div>
                    Location:{' '}
                    {telemetry.location
                        ? JSON.stringify(telemetry.location)
                        : 'No telemetry received'}
                </div>
                <div>
                    Map:{' '}
                    {match.mapId
                        ? pack.maps.find((map) => map.id === match.mapId)?.name
                        : match.reason}
                </div>
                {telemetry.issue && <div>{telemetry.issue}</div>}
                <div>Entrance discoveries: {telemetry.discoveries.length}</div>
                {Boolean(telemetry.discoveries.length) && (
                    <>
                        <div className={styles.arrivalList}>
                            {telemetry.discoveries.map((entry) => (
                                <div key={entry.exit}>
                                    {formatEntranceName(
                                        logic.areaGraph.exits[entry.exit]
                                            ?.short_name ?? entry.exit,
                                    )}
                                    {' -> '}
                                    {formatEntranceName(
                                        logic.areaGraph.entrances[
                                            entry.entrance
                                        ]?.short_name ?? entry.entrance,
                                    )}
                                    <div>
                                        {reviewDiscovery(
                                            entry,
                                            telemetry.discoveries,
                                            exits,
                                            pools,
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            disabled={!ready.length}
                            onClick={() => {
                                let applied = 0;
                                for (const entry of telemetry.discoveries) {
                                    const current = store.getState();
                                    if (
                                        reviewDiscovery(
                                            entry,
                                            telemetry.discoveries,
                                            exitsByIdSelector(current),
                                            entrancePoolsSelector(current),
                                        ) === 'Ready'
                                    ) {
                                        dispatch(
                                            mapEntrance({
                                                from: entry.exit,
                                                to: entry.entrance,
                                            }),
                                        );
                                        applied++;
                                    }
                                }
                                setResult(
                                    `Applied ${applied} discoveries; existing mappings were preserved.`,
                                );
                            }}
                        >
                            Apply compatible discoveries ({ready.length})
                        </button>
                        {result && <div role="status">{result}</div>}
                    </>
                )}
            </div>
        </section>
    );
}
