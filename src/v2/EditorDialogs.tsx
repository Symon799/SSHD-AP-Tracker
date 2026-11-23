import { useEffect, useState } from 'react';
import { Dialog } from '../additionalComponents/Dialog';
import type { PackMap } from './pack';
import styles from './v2.module.css';

export function MoveMarkersDialog({
    destinations,
    onClose,
    onContinue,
}: {
    destinations: readonly PackMap[];
    onClose: () => void;
    onContinue: (id: string) => void;
}) {
    const [destination, setDestination] = useState('');
    return (
        <Dialog
            open
            hideFooter
            title="Move to map"
            onOpenChange={(open) => !open && onClose()}
        >
            <form
                className={`${styles.app} ${styles.dialogForm}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (destination) onContinue(destination);
                }}
            >
                <label>
                    Destination map
                    <select
                        value={destination}
                        onChange={(event) => setDestination(event.target.value)}
                    >
                        <option value="" disabled>
                            Select a map
                        </option>
                        {destinations.map((map) => (
                            <option value={map.id} key={map.id}>
                                {map.name}
                            </option>
                        ))}
                    </select>
                </label>
                <div className={styles.actions}>
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" disabled={!destination}>
                        Preview placement
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

export function NameInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    return (
        <input
            id={`v2-${label.toLowerCase().replaceAll(' ', '-')}`}
            aria-label={label}
            value={draft}
            maxLength={1000}
            onChange={(event) => {
                const next = event.target.value;
                setDraft(next);
                if (next.trim()) onChange(next);
            }}
            onBlur={() => {
                if (!draft.trim()) setDraft(value);
            }}
        />
    );
}

export function MapCreationDialog({
    mode,
    initialName,
    onClose,
    onCreate,
}: {
    mode: 'map' | 'submap';
    initialName: string;
    onClose: () => void;
    onCreate: (name: string, file: File) => Promise<void>;
}) {
    const [name, setName] = useState(initialName);
    const [file, setFile] = useState<File>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
            hideFooter
            title={mode === 'submap' ? 'Create sub-map' : 'New map'}
        >
            <form
                className={`${styles.app} ${styles.dialogForm}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!file || busy) return;
                    setBusy(true);
                    onCreate(name.trim(), file)
                        .then(onClose)
                        .catch((cause: unknown) => setError(String(cause)))
                        .finally(() => setBusy(false));
                }}
            >
                <label>
                    Map name
                    <input
                        aria-label="New map name"
                        required
                        maxLength={1000}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <label>
                    Map image
                    <input
                        aria-label="New map image"
                        type="file"
                        required
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => setFile(event.target.files?.[0])}
                    />
                </label>
                {error && <p role="alert">{error}</p>}
                <div className={styles.actions}>
                    <button type="button" disabled={busy} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={busy || !name.trim() || !file}
                    >
                        {busy ? 'Creating…' : 'Create map'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

export function NewPackDialog({
    onClose,
    onCreate,
}: {
    onClose: () => void;
    onCreate: (name: string) => void;
}) {
    const [name, setName] = useState('Untitled map pack');
    return (
        <Dialog
            open
            hideFooter
            title="New map pack"
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <form
                className={`${styles.app} ${styles.dialogForm}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (name.trim()) onCreate(name.trim());
                }}
            >
                <p className={styles.dialogDescription}>
                    This will replace the current pack with the latest default
                    layout, including its maps and check groups. No map image is
                    needed.
                </p>
                <p className={styles.warningText}>
                    Changes you have not exported will be lost. Export a ZIP
                    backup before continuing.
                </p>
                <label>
                    Pack name
                    <input
                        aria-label="New pack name"
                        required
                        maxLength={1000}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                </label>
                <div className={styles.actions}>
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" disabled={!name.trim()}>
                        Create pack
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

export function ExportPackDialog({
    name,
    onClose,
    onExport,
}: {
    name: string;
    onClose: () => void;
    onExport: (name: string) => Promise<void>;
}) {
    const [value, setValue] = useState(name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
            hideFooter
            title="Export map pack"
        >
            <form
                className={`${styles.app} ${styles.dialogForm}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!value.trim() || busy) return;
                    setBusy(true);
                    onExport(value.trim())
                        .then(onClose)
                        .catch((cause: unknown) => setError(String(cause)))
                        .finally(() => setBusy(false));
                }}
            >
                <label>
                    Pack name
                    <input
                        aria-label="Export pack name"
                        required
                        maxLength={1000}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                </label>
                {error && <p role="alert">{error}</p>}
                <div className={styles.actions}>
                    <button type="button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" disabled={busy || !value.trim()}>
                        {busy ? 'Exporting…' : 'Download ZIP'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
