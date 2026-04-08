export type RenderedNodeCategory =
  | 'COLLECTION_POINT'
  | 'PV'
  | 'TIL'
  | 'TL'
  | 'CP'
  | 'OTHER';

export const RENDERED_NODE_ORDER: RenderedNodeCategory[] = [
  'COLLECTION_POINT',
  'PV',
  'TIL',
  'TL',
  'CP',
  'OTHER',
];

export const RENDERED_NODE_COLORS: Record<RenderedNodeCategory, string> = {
  COLLECTION_POINT: '#06b6d4',
  PV: '#f59e0b',
  TIL: '#8b5cf6',
  TL: '#ec4899',
  CP: '#22c55e',
  OTHER: '#a1a1aa',
};

export const RENDERED_NODE_LABELS: Record<RenderedNodeCategory, string> = {
  COLLECTION_POINT: 'Collection point',
  PV: 'Manhole (PV)',
  TIL: 'Inspection terminal (TIL)',
  TL: 'Cleanout terminal (TL)',
  CP: 'Passing box (CP)',
  OTHER: 'Other',
};

type RenderableNodeLike = {
  accessory_type?: string | null;
  accessoryType?: string | null;
  is_collection_point?: boolean | null;
  isCollectionPoint?: boolean | null;
};

export function getRenderedNodeCategory(node: RenderableNodeLike): RenderedNodeCategory {
  if (node.is_collection_point || node.isCollectionPoint) {
    return 'COLLECTION_POINT';
  }

  const accessoryType = node.accessory_type ?? node.accessoryType ?? null;

  switch (accessoryType) {
    case 'PV':
      return 'PV';
    case 'TIL':
      return 'TIL';
    case 'TL':
      return 'TL';
    case 'CP':
      return 'CP';
    default:
      return 'OTHER';
  }
}
