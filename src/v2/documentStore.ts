import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapDocument, MapPack } from './pack';
import { parsePack, upgradeLegacyHoverTitles } from './pack';

function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('sshd-v2-map-packs', 1);
        request.onupgradeneeded = () =>
            request.result.createObjectStore('drafts');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(new Error('Cannot open the local map-pack database.'));
    });
}

export async function saveDocument(document: MapDocument): Promise<void> {
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('drafts', 'readwrite');
            transaction.objectStore('drafts').put(document, 'current');
            transaction.oncomplete = () => resolve();
            transaction.onerror = () =>
                reject(new Error('Local save failed. Export a ZIP backup.'));
            transaction.onabort = () =>
                reject(
                    new Error(
                        'Local save was interrupted. Export a ZIP backup.',
                    ),
                );
        });
    } finally {
        db.close();
    }
}

async function loadDocument(): Promise<MapDocument | undefined> {
    const db = await database();
    try {
        return await new Promise<MapDocument | undefined>((resolve, reject) => {
            const request = db
                .transaction('drafts')
                .objectStore('drafts')
                .get('current');
            request.onsuccess = () => {
                try {
                    const value: unknown = request.result;
                    if (value === undefined) return resolve(undefined);
                    if (
                        !value ||
                        typeof value !== 'object' ||
                        !('pack' in value) ||
                        !('images' in value) ||
                        !value.images ||
                        typeof value.images !== 'object' ||
                        !Object.values(value.images).every(
                            (entry: unknown) => typeof entry === 'string',
                        )
                    )
                        throw new Error('Invalid local pack draft.');
                    const parsed = parsePack(value.pack);
                    const pack = upgradeLegacyHoverTitles(parsed);
                    resolve({
                        pack,
                        images: value.images as Record<string, string>,
                        ...(pack !== parsed
                            ? { draftRevision: window.crypto.randomUUID() }
                            : 'draftRevision' in value &&
                                typeof value.draftRevision === 'string'
                              ? { draftRevision: value.draftRevision }
                              : {}),
                    });
                } catch {
                    reject(
                        new Error(
                            'Cannot restore the local draft. Import a ZIP backup or use the demo pack.',
                        ),
                    );
                }
            };
            request.onerror = () =>
                reject(new Error('Cannot read the local pack draft.'));
        });
    } finally {
        db.close();
    }
}

export function useMapDocument(
    initial: MapDocument,
    previousDefault?: MapPack,
) {
    const [document, setDocument] = useState(() => ({
        ...initial,
        draftRevision: initial.draftRevision ?? window.crypto.randomUUID(),
    }));
    const [exportedRevision, setExportedRevision] = useState<string>();
    const [ready, setReady] = useState(false);
    const [saveState, setSaveState] = useState('Loading draft…');
    const [history, setHistory] = useState<MapDocument[]>([]);
    const [future, setFuture] = useState<MapDocument[]>([]);
    const saveQueue = useRef(Promise.resolve());
    const latestDocument = useRef(document);
    latestDocument.current = document;
    useEffect(() => {
        let active = true;
        loadDocument()
            .then((stored) => {
                if (!active) return;
                if (
                    stored &&
                    JSON.stringify(stored.pack) !==
                        JSON.stringify(previousDefault)
                )
                    setDocument({
                        ...stored,
                        draftRevision:
                            stored.draftRevision ?? window.crypto.randomUUID(),
                    });
                setSaveState('Saved locally');
            })
            .catch((error: unknown) => {
                if (active) setSaveState(String(error));
            })
            .finally(() => {
                if (active) setReady(true);
            });
        return () => {
            active = false;
        };
    }, [previousDefault]);
    useEffect(() => {
        if (!ready) return;
        let active = true;
        setExportedRevision(undefined);
        database()
            .then((db) => {
                const request = db
                    .transaction('drafts')
                    .objectStore('drafts')
                    .get(`exported:${document.pack.id}`);
                request.onsuccess = () => {
                    const value: unknown = request.result;
                    if (active && typeof value === 'string')
                        setExportedRevision(value);
                    db.close();
                };
                request.onerror = () => db.close();
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [document.pack.id, ready]);
    const markExported = async (snapshot: MapDocument) => {
        const db = await database();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction('drafts', 'readwrite');
                transaction
                    .objectStore('drafts')
                    .put(
                        snapshot.draftRevision,
                        `exported:${snapshot.pack.id}`,
                    );
                transaction.oncomplete = () => resolve();
                transaction.onerror = () =>
                    reject(new Error('Cannot save export status.'));
            });
            if (latestDocument.current.pack.id === snapshot.pack.id)
                setExportedRevision(snapshot.draftRevision);
        } finally {
            db.close();
        }
    };
    useEffect(() => {
        if (!ready) return;
        const timer = setTimeout(() => {
            setSaveState('Saving…');
            // Serialize writes so an older edit cannot overwrite a newer draft.
            saveQueue.current = saveQueue.current
                .catch(() => {})
                .then(() => saveDocument(document));
            saveQueue.current
                .then(() => {
                    if (latestDocument.current === document)
                        setSaveState('Saved locally');
                })
                .catch((error: unknown) => setSaveState(String(error)));
        }, 250);
        return () => clearTimeout(timer);
    }, [document, ready]);
    const update = useCallback(
        (next: MapDocument) => {
            const stamped = {
                ...next,
                draftRevision: window.crypto.randomUUID(),
            };
            setSaveState('Unsaved changes');
            setHistory((past) => [...past.slice(-29), document]);
            setFuture([]);
            setDocument(stamped);
            return stamped;
        },
        [document],
    );
    const undo = () => {
        const previous = history.at(-1);
        if (!previous) return;
        setSaveState('Unsaved changes');
        setFuture((items) => [document, ...items]);
        setHistory(history.slice(0, -1));
        setDocument({
            ...previous,
            draftRevision: previous.draftRevision ?? window.crypto.randomUUID(),
        });
    };
    const redo = () => {
        const next = future[0];
        if (!next) return;
        setSaveState('Unsaved changes');
        setHistory((items) => [...items, document]);
        setFuture(future.slice(1));
        setDocument({
            ...next,
            draftRevision: next.draftRevision ?? window.crypto.randomUUID(),
        });
    };
    useEffect(() => {
        if (!ready || saveState === 'Saved locally') return;
        const beforeUnload = (event: BeforeUnloadEvent) =>
            event.preventDefault();
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [ready, saveState]);
    return {
        document,
        update,
        undo,
        redo,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        ready,
        saveState,
        markExported,
        isExported: Boolean(
            document.draftRevision &&
                document.draftRevision === exportedRevision,
        ),
    };
}
