/**
 * Módulo Map - Exports Públicos
 *
 * Este é o ponto de entrada principal para o módulo de mapas.
 * Importações devem ser feitas a partir deste arquivo.
 */

// Types (exceto os que conflitam com services)
export type {
  LatLng,
  BoundingBox,
  ValidationError,
  ValidationWarning,
  BboxDimensions,
  ProcessingStages,
  ProcessingErrors,
  MapContainerProps,
  ViewMode,
  ProcessingStage,
  MapError,
} from "./types/map.types";

export type {
  BboxValidationResult,
  BboxValidationError,
  BboxValidationWarning,
  BboxMetadata,
  BboxErrorCode,
  BboxWarningCode,
  BboxSelectionState,
} from "./types/bbox.types";

export type {
  MapNode,
  NodeAction,
  MoveValidationResult,
  NodeValidationError,
  NodeValidationWarning,
  NodeErrorCode,
  NodeWarningCode,
  NodeDisplayOptions,
  NodeEditMode,
  NodeSelectionState,
  SelectionOptions,
  BatchResult,
} from "./types/node.types";

export type {
  DEMType,
  ElevationCacheEntry,
  ElevationFetchOptions,
  ElevationResult,
  ElevationProfile,
  StreetElevationData,
  InterpolationOptions,
} from "./types/elevation.types";

// Context
export * from "./context";

// Constants
export * from "./constants";

// Validators
export * from "./validators";

// Services (inclui tipos ElevationData, ElevationStats, GeoTIFFMetadata)
export * from "./services";

// Hooks
export * from "./hooks";

// Components
export * from "./components";

// Utils
export * from "./utils";

// Re-export from @urbanus/geo for convenience
export { GeoCalculations } from "@urbanus/geo";
