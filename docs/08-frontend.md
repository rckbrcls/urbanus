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
O texto da landing evita citar normas tecnicas especificas nominalmente e descreve essas validacoes de forma generica como verificacoes de engenharia.

## Editor

`app/projects/[id]/ProjectEditor.tsx` e o unico fluxo suportado para processamento:

1. abre projeto via `useProjectStore`
2. hidrata `graphStore` com o grafo salvo ou com `sewerNetwork` persistida
3. monta `nodes` e `edges` a partir do estado atual do editor
4. chama `usePipelineStore().processProject(projectId, { nodes, edges })`
5. recebe `SewerNetwork`, converte de volta para grafo e atualiza a UI

O frontend nao tem mais fallback local para chamar o processamento sem body.

Na visualizacao processada, o mapa renderiza chevrons de fluxo sobre a rede.
Esses chevrons usam as propriedades do `SewerNetwork`, mas a geometria e a
lista de arestas visiveis vem do `graphStore` quando o usuario edita o grafo.
Com isso, as setas seguem o `LineString` atualmente exibido no mapa e somem
imediatamente quando um no ou aresta e removido, sem esperar um novo
processamento. O layer continua usando `text-keep-upright: false` no MapLibre
para nao inverter a direcao em trechos cujo bearing faria o motor "virar" o
simbolo por legibilidade.
O editor expõe apenas tres modos de visualizacao para o mapa: `default`,
`streets` e `elevation`. Nos modos `default` e `streets`, os nós permanecem
com a cor neutra padrao do editor tanto antes quanto depois do processamento;
apenas as arestas e chevrons mudam de acordo com o modo ativo. No modo
`elevation`, nós, arestas e chevrons usam a rampa topografica calculada para
cada trecho. Na aba de pipeline, a rede processada ainda expõe filtros de
visibilidade para `PV` e `collection point`, mas esses filtros nao alteram a
paleta dos nós no mapa, com excecao de `collection point`, que permanece
visualmente destacado em relacao aos nós comuns. Os circulos de nós no editor,
na preview da home e na rede processada agora usam expressoes de raio
dependentes do zoom do MapLibre, com limites minimo e maximo, para evitar que
ocupem area demais quando o usuario afasta muito o mapa. O resumo exibido no
painel de pipeline foi reduzido a metricas operacionais da rede: nós,
segmentos, extensao e inalcançaveis. O frontend nao mostra mais elevatorias,
custo total nem contagem por diametro de tubo nesse painel.

## Persistencia de projeto

`useProjectStore` faz proxy same-origin para o FastAPI. O payload de projeto continua podendo incluir `sewerNetwork`; quando presente, o editor reabre diretamente no snapshot processado salvo.

Na tela `app/projects/page.tsx`, cada card e item de lista agora usa um menu de contexto (`components/ProjectContextMenu.tsx`) com acoes locais para abrir o projeto, abrir em nova aba e remover o projeto com confirmacao antes do `DELETE /api/projects/[id]`.

## Notas de simplificacao

- componentes e rotas nao montados no runtime atual foram removidos
- o contrato do editor com o backend foi reduzido a um unico caminho: `edited graph -> process -> SewerNetwork`
