# 09 -- Estado e Stores

## Visao geral

O frontend atual usa Zustand para estado local e TanStack Query para dados remotos.

Stores principais:

- `graphStore`: grafo editavel do editor
- `commandManager`: undo/redo
- `useMapStore`: viewport persistido
- `useProjectStore`: CRUD de projetos
- `areaSelectionStore`: fluxo da home
- `pipelineStore`: estado do processamento do pipeline

## `useProjectStore`

Arquivo: `apps/web/stores/useProjectStore.ts`

- consome `/api/projects` e `/api/projects/[id]`
- encapsula load/save/delete de projeto
- preserva `sewerNetwork` no payload para reidratacao posterior

## `areaSelectionStore`

Arquivo: `apps/web/stores/areaSelectionStore.ts`

Orquestra a home em tres estagios sequenciais:

1. `StreetsService.fetchStreets`
2. `ElevationService.fetchEnrichedGeoJSON`
3. `NodesApiService.extractNodes`

Estado mantido:

- bbox pendente e ativa
- status de `streets`, `topography` e `nodes`
- GeoJSON enriquecido
- contagem de ruas
- nos extraidos para preview

O campo `topography` no estado representa somente o enriquecimento de elevacao. Nao existe mais download separado de DEM nesse fluxo.

## `pipelineStore`

Arquivo: `apps/web/stores/pipelineStore.ts`

Contrato atual:

```typescript
processProject(projectId, { nodes, edges })
```

Caracteristicas:

- sempre envia `application/json`
- nao suporta mais chamada sem payload
- guarda `result`, `_cachedResult`, `status` e `error`
- permite alternar entre visualizacao pre-processamento e rede processada

## `graphStore` + `commandManager`

Esses dois stores continuam sendo o nucleo da edicao:

- `graphStore` guarda nos, arestas, selecao e modo
- `commandManager` encapsula acoes reversiveis como add/move/remove/split

O editor processa exatamente o snapshot atual desse estado.
