import { useLayoutEffect, useRef, useState } from 'react';

const prefix = 'sshdLocationView:';

export function readViewNumber(key: string): number {
    try {
        const value = Number(localStorage.getItem(prefix + key));
        return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
        return 0;
    }
}

export function writeViewNumber(key: string, value: number) {
    try {
        localStorage.setItem(prefix + key, String(value));
    } catch {
        // View preferences must not prevent using the tracker if storage is full.
    }
}

export function useRememberedOpen(key: string) {
    const [open, setOpen] = useState(() => readViewNumber(key) === 1);
    return [
        open,
        (value: boolean) => {
            writeViewNumber(key, Number(value));
            setOpen(value);
        },
    ] as const;
}

export function useRememberedScroll(key: string) {
    const viewport = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = viewport.current;
        const inner = content.current;
        if (!element || !inner) return;
        const target = readViewNumber(key);
        let lastPosition = target;
        let restoring = true;
        const restore = () => {
            if (!restoring) return;
            element.scrollTop = target;
            // Groups and virtual rows can take another layout pass to expand.
            if (Math.abs(element.scrollTop - target) < 1) restoring = false;
        };
        const save = () => {
            if (!restoring) {
                lastPosition = element.scrollTop;
                writeViewNumber(key, lastPosition);
            }
        };
        const interrupt = () => {
            restoring = false;
        };
        const observer = new ResizeObserver(restore);
        observer.observe(inner);
        observer.observe(element);
        element.addEventListener('scroll', save);
        const events = [
            'wheel',
            'touchstart',
            'pointerdown',
            'keydown',
        ] as const;
        for (const event of events) element.addEventListener(event, interrupt);
        restore();
        return () => {
            // A detached scroll container reports zero during region changes.
            if (!restoring) writeViewNumber(key, lastPosition);
            observer.disconnect();
            element.removeEventListener('scroll', save);
            for (const event of events)
                element.removeEventListener(event, interrupt);
        };
    }, [key]);
    return { viewport, content };
}
