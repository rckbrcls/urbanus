# Documentação de Regras de Negócio: Módulo Map e Projetos

Este documento descreve as regras de negócio, fluxos de dados e lógica de implementação dos componentes de Mapa (`Map.tsx`), persistência de Projetos (`useProjectStore`) e visualização de dados topográficos no **URBANUS**.

## 1. Fluxo de Seleção e Recorte (Map Cropping)

O objetivo principal é permitir que o usuário selecione uma área de interesse no mapa, isole essa área visualmente e realize processamentos nela.

### 1.1. Seleção de Área (Bounding Box)

- **Ferramenta**: O usuário utiliza `Shift + Drag` para desenhar um retângulo.
- **Hook**: `useBoundingBoxDrawing.ts`.
- **Validação**:
  - A área selecionada é calculada em km².
  - **Restrição**: Existe um limite máximo (`MAX_AREA_KM2 = 100` km²). Se a seleção exceder esse limite, uma mensagem de erro é exibida e o fluxo de confirmação é bloqueado.
- **Evento**: Ao soltar o mouse (`mouseup`), se a seleção for válida, o estado `pendingBbox` é definido e o modal de confirmação (`showCropConfirm`) aparece.

### 1.2. Transição para Modo Recortado (Cropped View)

- **Ação**: Ao confirmar o recorte (`handleConfirmCrop`).
- **Lógica de Visualização**:
  - O componente `Map.tsx` utiliza uma chave (`key={isCropped ? 'cropped' : 'full'}`) para forçar a remontagem completa do componente Leaflet. Isso evita inconsistências visuais e problemas de redimensionamento do canvas.
  - **Cálculo de Dimensões**: As dimensões do container do mapa (`width`, `height`) são recalculadas para manter a proporção (aspect ratio) da bounding box selecionada, respeitando limites máximos de tela (ex: 90% da largura da janela).
  - **Bloqueio de Vista**: O hook `useMapInstance` utiliza `map.fitBounds` (via `lockToBox`) para ajustar o zoom e centro exatamente na bounding box.
  - **Interatividade**: No modo recortado, interações de zoom e pan do usuário são **desabilitadas** (`map.dragging.disable()`, etc.) para focar na análise da área estática.

---

## 2. Processamento de Dados (Data Processing)

Uma vez no modo recortado, o usuário pode solicitar dados da região.

### 2.1. Busca de Ruas (OpenStreetMap)

- **Fonte**: Overpass API.
- **Hook**: `useDataProcessing.ts`.
- **Lógica**: Uma query OverpassQL é construída usando a bounding box ativa. Buscam-se caminhos (`way`) com tags de `highway`.
- **Conversão**: Os dados XML/JSON do Overpass são convertidos para GeoJSON (usando `osmtogeojson`).
- **Renderização**: As ruas são desenhadas no mapa usando cores definidas em `HIGHWAY_COLORS`.

### 2.2. Dados Topográficos (GeoTIFF)

- **Fonte**: API externa (OpenTopography ou similar, simulado/implementado via fetch).
- **Formato**: GeoTIFF (imagem raster contendo dados de elevação).
- **Processamento no Client-side**:
  - O arquivo GeoTIFF é baixado como um `Blob`.
  - A biblioteca `geotiff.js` é usada para ler os pixels (rasters) da imagem.
  - **Otimização**: A função `loadElevationData` (em `elevation.ts`) lê a imagem e metadados uma única vez.

### 2.3. Enriquecimento de Dados (Data Enrichment)

Esta é uma etapa crítica onde cruzamos os dados vetoriais (ruas) com os dados raster (topografia).

- **Função**: `enrichStreetsWithElevation` (em `elevation.ts`).
- **Entrada**: GeoJSON de ruas + Blob do GeoTIFF.
- **Lógica detalhada**:
  1. Para cada **Feature** (rua) do GeoJSON:
  2. Obtemos a lista de coordenadas (vértices) da geometria `LineString`.
  3. Para cada **Vértice** (latitude, longitude):
     - Mapeamos a coordenada lat/long para a coordenada de pixel (x, y) na imagem GeoTIFF.
     - Lemos o valor de elevação daquele pixel.
     - Armazenamos este valor em dois locais:
       - Para estatísticas da rua (min, max, média).
       - **[Novo]** Num array `vertex_elevations` dentro de `properties`, mantendo a ordem dos vértices originais.
  4. O GeoJSON é atualizado com essas novas propriedades.

---

## 3. Visualização de Vértices e Topografia

Regras para exibir as informações processadas ao usuário.

### 3.1. Renderização no Mapa (Map.tsx / useMapInstance.ts)

- **Camada de Ruas**: Linhas coloridas baseadas no tipo de via.
- **Camada de Vértices**:
  - **Hook**: `useMapInstance` itera sobre as coordenadas das ruas enrichidas.
  - **Marcadores**: Para cada vértice com elevação válida, um `L.circleMarker` é criado.
  - **Estilo**: Pequenos pontos azuis (`radius: 3`).
  - **Interação**: Tooltips exibem a altitude exata (`Alt: 123.4m`) ao passar o mouse.
- **Tooltips de Rua**: Ao passar o mouse sobre a linha da rua, um resumo (Média/Min/Max) calculado a partir dos vértices é exibido.

---

## 4. Persistência de Projetos (Project Storage)

O sistema permite salvar o estado atual para visualização posterior.

### 4.1. Estrutura do Projeto (useProjectStore.ts)

Um objeto `Project` contém:

- `id`: UUID único.
- `name`: Nome definido pelo usuário.
- `bounds`: A bounding box original.
- `streets`: O **GeoJSON completo**, incluindo as propriedades enriquecidas (`elevation` stats e `vertex_elevations`).
- `stats`: Metadados rápidos (contagem de ruas, etc).
- `center` / `zoom`: Estado da câmera para restaurar a visualização.

### 4.2. Fluxo de Salvamento

1. Usuário clica em "Save Project" no modo recortado.
2. O sistema garante que o enriquecimento de dados (cálculo de elevações) foi finalizado.
3. O objeto é montado e despachado para a store Zustand (`addProject`), que persiste no `localStorage` (via middleware `persist`).

---

## 5. Visualização de Detalhes do Projeto (Project Details Page)

Arquivo: `client/app/projects/[id]/page.tsx`

### 5.1. Restauração de Estado

- O mapa é inicializado com `center`, `zoom` e `bounds` salvos.
- O componente não busca dados novamente; ele usa o GeoJSON salvo no objeto do projeto.

### 5.2. Renderização de Elementos

- **Ruas**: Usa componente `<GeoJSON />` do `react-leaflet`.
- **Vértices de Elevação**:
  - O componente itera manualmente sobre `project.streets.features`.
  - Verifica se a propriedade `vertex_elevations` existe.
  - Mapeia cada elevação para um componente `<CircleMarker />` na posição correspondente da coordenada.
  - Isso garante que a visualização salva seja idêntica à visualização no momento do processamento.

---

## 6. Considerações Técnicas e Limitações

- **Performance**: A renderização de milhares de `CircleMarker` pode ser pesada. Em implementações futuras, considerar usar `Canvas` ou `WebGL` para os pontos se a densidade aumentar muito.
- **GeoTIFF**: Assume-se projeção compatível (lat/long ou similar) para mapeamento direto de pixels.
- **Topologia**: Os vértices visualizados são puramente geométricos (pontos da linha). Não há (ainda) lógica de grafo complexa (nós de interseção vs. nós de geometria) na visualização, embora o backend Python tenha scripts para isso. Atualmente visualizamos a **geometria bruta enriquecida**.
