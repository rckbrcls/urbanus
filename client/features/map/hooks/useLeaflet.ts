'use client';

import { useEffect, useState } from 'react';

export type LeafletModule = typeof import('leaflet');

export function useLeaflet(): LeafletModule | null {
    const [leaflet, setLeaflet] = useState<LeafletModule | null>(null);

    useEffect(() => {
        let active = true;

        import('leaflet').then((mod) => {
            if (active) {
                setLeaflet(mod);
            }
        });

        return () => {
            active = false;
        };
    }, []);

    return leaflet;
}
