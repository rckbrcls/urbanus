# 08 -- Frontend Next.js

## Estrutura relevante

```text
apps/web/
├── app/
│   ├── page.tsx
│   ├── api/
│   │   ├── streets/route.ts
│   │   ├── elevation/enrich/route.ts
│   │   ├── nodes/extract/route.ts
│   │   ├── projects/route.ts
│   │   └── projects/[id]/
│   │       ├── route.ts
│   │       └── process/route.ts
│   └── projects/[id]/ProjectEditor.tsx
├── components/map/
├── features/map/
├── stores/
└── lib/graph/
```

## API routes ativas

| Rota | Destino | Papel |
|------|---------|-------|
| `POST /api/streets` | Overpass | buscar ruas por bbox |
| `POST /api/elevation/enrich` | FastAPI | enriquecer GeoJSON com elevacao |
| `POST /api/nodes/extract` | FastAPI | extrair nos do GeoJSON enriquecido |
| `GET/POST /api/projects` | FastAPI | listar e salvar projetos |
| `GET/DELETE /api/projects/[id]` | FastAPI | carregar e remover projeto |
| `POST /api/projects/[id]/process` | FastAPI | processar grafo editado |

Rotas removidas da superficie suportada:

- download direto de GeoTIFF no Next.js
- endpoint local legado de validacao de bbox
- endpoint local legado de persistencia de nos

## Home

A home usa `MapView` + `areaSelectionStore` para orquestrar tres etapas:

1. streets
2. topography
3. nodes

O nome visual `topography` ainda existe no estado da home, mas funcionalmente esse estagio significa apenas o enriquecimento de elevacao via `/api/elevation/enrich`.

## Editor

`app/projects/[id]/ProjectEditor.tsx` e o unico fluxo suportado para processamento:

1. abre projeto via `useProjectStore`
2. hidrata `graphStore` com o grafo salvo ou com `sewerNetwork` persistida
3. monta `nodes` e `edges` a partir do estado atual do editor
4. chama `usePipelineStore().processProject(projectId, { nodes, edges })`
5. recebe `SewerNetwork`, converte de volta para grafo e atualiza a UI

O frontend nao tem mais fallback local para chamar o processamento sem body.

Na visualizacao processada, o mapa renderiza chevrons de fluxo sobre a rede.
Esses chevrons seguem a orientacao do `LineString` retornado no `SewerNetwork`
e usam `text-keep-upright: false` no MapLibre para nao inverter a direcao em
trechos cujo bearing faria o motor "virar" o simbolo por legibilidade.

## Persistencia de projeto

`useProjectStore` faz proxy same-origin para o FastAPI. O payload de projeto continua podendo incluir `sewerNetwork`; quando presente, o editor reabre diretamente no snapshot processado salvo.

## Notas de simplificacao

- componentes e rotas nao montados no runtime atual foram removidos
- o contrato do editor com o backend foi reduzido a um unico caminho: `edited graph -> process -> SewerNetwork`
