# 07 -- Algoritmos Geoespaciais

## Haversine (Distancia entre Coordenadas)

Calcula a distancia do grande circulo entre dois pontos na superficie terrestre, assumindo uma esfera de raio R = 6.371.000 m.

```python
def haversine(lat1, lon1, lat2, lon2) -> float:
    """Retorna distancia em metros."""
    R = 6_371_000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lon2 - lon1)

    a = sin(dphi/2)**2 + cos(phi1) * cos(phi2) * sin(dlam/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return R * c
```

Precisao: melhor que 0.5% para distancias ate ~20 km (suficiente para redes urbanas de esgoto).

Implementacoes:
- Python: `urbanus_geo.calculations.haversine(lat1, lon1, lat2, lon2)`
- TypeScript: `GeoCalculations.calculateDistance(p1: LatLng, p2: LatLng)` (em `@urbanus/geo`)

## Calculo de Area por Bounding Box

Estimativa de area em km2 para uma bbox retangular, com correcao de latitude (aproximacao equiretangular):

```python
def area_km2(south, north, west, east) -> float:
    KM_PER_DEGREE_LAT = 111.32
    avg_lat = (south + north) / 2
    height_km = (north - south) * KM_PER_DEGREE_LAT
    width_km = (east - west) * KM_PER_DEGREE_LAT * cos(radians(avg_lat))
    return abs(height_km * width_km)
```

A correcao `cos(avg_lat)` compensa o encurtamento dos paralelos com o aumento da latitude. Para latitudes brasileiras tipicas (-30 a 0 graus), o erro e inferior a 1%.

Implementacoes:
- Python: `urbanus_geo.calculations.area_km2(south, north, west, east)`
- TypeScript: `GeoCalculations.calculateArea(bbox: BoundingBox)`

## Amostragem de Elevacao (DEM)

### Pipeline Completo

```
OpenTopography API
    |
    v
GeoTIFF (raster, formato banda unica)
    |
    v
rasterio.MemoryFile (aberto em memoria)
    |
    v
Para cada vertice (lng, lat) da LineString:
    Converter para coordenadas de pixel: (col, row) = ~transform * (lng, lat)
    Amostrar usando interpolacao bilinear
    |
    v
vertex_elevations: [float | None, ...]
```

### Nearest-Neighbor no Servico Atual

O servico atual usa `src.sample([(lng, lat)])` do rasterio para obter o valor do pixel mais proximo em cada vertice. O valor e validado contra `NODATA_THRESHOLD = -9000` e contra o `nodata` do raster.

Depois da amostragem, `services/elevation.py` aplica `_interpolate_missing_elevations` para preencher lacunas com interpolacao linear entre vertices validos da mesma `LineString`.

Arquivo: `services/elevation.py`

## Calculo de Declividade 2D

```python
def slope_2d(z_up, z_down, distance_2d) -> float:
    """Declividade = delta_z / distancia_horizontal (m/m)."""
    if distance_2d <= 0:
        return 0.0
    return (z_up - z_down) / distance_2d
```

Convencao: positivo = descendente (fluxo gravitacional). Usado na funcao de custo (Etapa 6) e no dimensionamento (Etapa 8).

Implementacoes:
- Python: `urbanus_geo.calculations.slope_2d(z_up, z_down, distance_2d)`
- TypeScript: `GeoCalculations.slope2d(zUp, zDown, distance2d)`

## Angulo entre Segmentos

Calcula o angulo interior no vertice B entre os segmentos BA e BC.

```python
def angle_at_node(a, b, c) -> float:
    """Angulo em B (graus, [0, 180])."""
    # Vetores BA e BC
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])

    # Produto escalar e magnitudes
    dot = ba[0]*bc[0] + ba[1]*bc[1]
    mag_ba = sqrt(ba[0]**2 + ba[1]**2)
    mag_bc = sqrt(bc[0]**2 + bc[1]**2)

    if mag_ba == 0 or mag_bc == 0:
        return 0.0

    cos_theta = clamp(dot / (mag_ba * mag_bc), -1, 1)
    return degrees(acos(cos_theta))
```

Usado na Etapa 4 (resolucao de curvas) para detectar angulos agudos que exigem PV.

Implementacoes:
- Python: `urbanus_geo.calculations.angle_at_node(a, b, c)`
- TypeScript: `GeoCalculations.angleAtNode(a: LatLng, b: LatLng, c: LatLng)`

## Intersecao de Retas Parametricas

Encontra o ponto de intersecao de duas retas definidas por dois pares de pontos.

```python
def line_intersection(a, b, c, d) -> tuple[float, float] | None:
    """Intersecao de L1(A->B) e L2(C->D). Retorna ponto ou None se paralelas."""
    # Direcoes
    dx1, dy1 = b[0] - a[0], b[1] - a[1]
    dx2, dy2 = d[0] - c[0], d[1] - c[1]

    denom = dx1 * dy2 - dy1 * dx2

    if abs(denom) < 1e-12:
        return None  # paralelas

    t = ((c[0] - a[0]) * dy2 - (c[1] - a[1]) * dx2) / denom

    x = a[0] + t * dx1
    y = a[1] + t * dy1

    return (x, y)
```

Usado na Etapa 4 para encontrar o ponto otimizado de intersecao das tangentes em curvas acentuadas.

## Proeminencia Topografica (BFS)

A proeminencia e uma medida de "importancia" de um pico ou vale topografico. E definida como a diferenca de elevacao entre o extremo e a sela (saddle point) mais proxima que o conecta a um extremo mais significativo.

```python
def _compute_prominence(G, start, start_z, direction, max_hops=20) -> float:
    """
    BFS limitado a max_hops nos.

    direction="down" (para maximos):
        Busca o ponto de sela mais alto entre start e um pico mais alto.
        prominence = start_z - best_saddle

    direction="up" (para minimos):
        Busca o ponto de sela mais baixo entre start e um vale mais profundo.
        prominence = best_saddle - start_z
    """
    visited = {start}
    queue = deque([(start, 0)])
    best_saddle = start_z  # sera atualizado

    while queue:
        node, hops = queue.popleft()
        if hops >= max_hops:
            continue

        for neighbor in G.neighbors(node):
            if neighbor in visited:
                continue
            visited.add(neighbor)

            z_n = G.nodes[neighbor].get("z", start_z)

            if direction == "down":
                # Para maximos: atualiza sela se encontrar caminho descendente
                best_saddle = min(best_saddle, z_n)
            else:
                # Para minimos: atualiza sela se encontrar caminho ascendente
                best_saddle = max(best_saddle, z_n)

            queue.append((neighbor, hops + 1))

    if direction == "down":
        return start_z - best_saddle
    else:
        return best_saddle - start_z
```

O limiar de proeminencia (`ELEVATION_PROMINENCE_MIN = 2.0 m`) filtra ruido do DEM -- picos e vales com menos de 2 m de proeminencia sao ignorados.

Arquivo: `core/elevation/extrema.py`
