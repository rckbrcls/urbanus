'use client';

import dynamic from 'next/dynamic';

const MapWrapper = dynamic(() => import('@/components/map/MapWrapper'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">...</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="flex flex-1 w-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="relative flex-1">
        <MapWrapper />
      </div>
    </div>
  );
}
