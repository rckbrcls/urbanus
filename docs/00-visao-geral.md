# 00 -- Visao Geral do Produto

## O que e o URBANUS

O URBANUS e uma aplicacao web para planejamento preliminar de redes coletoras de esgoto. O fluxo atual parte de uma area selecionada no mapa, busca ruas, enriquece a geometria com elevacao, extrai nos para o editor e processa um grafo editado para gerar uma `SewerNetwork`.

## Stack

| Camada | Tecnologia | Papel |
|--------|-----------|-------|
| Frontend | Next.js 15 | UI, App Router e proxies same-origin |
| Mapa | MapLibre GL JS | visualizacao e edicao espacial |
| Estado | Zustand + TanStack Query | estado local e dados do servidor |
| Backend | FastAPI | CRUD de projetos, elevacao, extracao de nos e pipeline |
| Banco | PostgreSQL + PostGIS | persistencia de projeto e rede processada |
| Grafos | NetworkX | roteamento e transformacoes da rede |
| Elevacao | OpenTopography + rasterio | enriquecimento de elevacao por vertice |

## Arquitetura de alto nivel

```text
Browser
  -> Next.js
     -> /api/streets
     -> /api/elevation/enrich
     -> /api/nodes/extract
     -> /api/projects/*
  -> FastAPI
     -> /projects
     -> /nodes/extract
     -> /elevation/enrich
     -> /projects/{id}/process
  -> PostgreSQL/PostGIS
```

## Fluxo do usuario

### 1. Selecao de area

1. o usuario desenha uma bbox no mapa
2. o frontend valida a area localmente
3. a home chama:
   - `POST /api/streets`
   - `POST /api/elevation/enrich`
   - `POST /api/nodes/extract`

### 2. Edicao

4. o projeto salvo abre no editor
5. o editor trabalha sobre `graphStore`
6. undo/redo e feito via `commandManager`

### 3. Processamento

7. o editor envia o grafo editado atual para `POST /api/projects/{id}/process`
8. o FastAPI processa esse payload como unica entrada suportada
9. o backend retorna `SewerNetwork` e persiste o snapshot para reidratacao

## Decisoes atuais importantes

- o frontend atual e o contrato de verdade para o pipeline
- nao existe mais fallback de processamento sem body
- nao existe mais rota de download direto de GeoTIFF no produto suportado
- `sewerNetwork` persistido continua sendo usado para reabrir projetos processados
