export type RenderedNodeCategory =
  | 'COLLECTION_POINT'
  | 'PV';

export type VisibleRenderedNodeCategories = readonly RenderedNodeCategory[];

export const RENDERED_NODE_ORDER: RenderedNodeCategory[] = [
  'COLLECTION_POINT',
  'PV',
];

export const RENDERED_NODE_COLORS: Record<RenderedNodeCategory, string> = {
  COLLECTION_POINT: '#06b6d4',
  PV: '#f59e0b',
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

  // Legacy payloads may still carry TIL/TL/CP. Collapse them into PV so the
  // simplified UI always renders a single physical-node category.
  return 'PV';
}

export function isRenderedNodeCategoryVisible(
  category: RenderedNodeCategory,
  visibleCategories: VisibleRenderedNodeCategories,
): boolean {
  return visibleCategories.includes(category);
}
