"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// Importar o mapa dinamicamente para evitar erros de SSR
const Map = dynamic(() => import("./components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando mapa...</p>
      </div>
    </div>
  ),
});

interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}

export default function Home() {
  const [currentBbox, setCurrentBbox] = useState<BoundingBox | null>(null);

  const handleBoundingBoxChange = (bbox: BoundingBox | null) => {
    setCurrentBbox(bbox);
    if (bbox) {
      console.log("Bounding Box selecionado:", bbox);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          URBANUS
        </h1>
      </header>

      {/* Main Content - Map */}
      <main className="relative flex-1">
        <Map
          center={[-23.5505, -46.6333]}
          zoom={13}
          onBoundingBoxChange={handleBoundingBoxChange}
          enableBoundingBox={true}
        />
      </main>
    </div>
  );
}
