export interface BoundingBox {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
}

export interface ProcessingStages {
  streets: "pending" | "loading" | "success" | "error";
  topography: "pending" | "loading" | "success" | "error" | "skipped";
}

export interface ProcessingErrors {
  streets?: string;
  topography?: string;
}

export interface MapContainerProps {
  center?: [number, number];
  zoom?: number;
  onBoundingBoxChange?: (bbox: BoundingBox | null) => void;
  enableBoundingBox?: boolean;
}
