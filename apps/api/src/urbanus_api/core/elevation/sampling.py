"""
Amostragem de elevação com interpolação bilinear.

Melhoria sobre o nearest-neighbor do src.sample() do rasterio,
reduzindo o erro de quantização do grid de 30m do COP30/FABDEM.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def sample_elevation_bilinear(
    src: Any,
    coordinates: list[tuple[float, float]],
) -> list[float | None]:
    """Amostra elevação com interpolação bilinear.

    Lê uma janela 2x2 ao redor de cada coordenada e interpola
    bilinearmente para obter uma estimativa mais suave.

    Args:
        src: Rasterio dataset aberto.
        coordinates: Lista de (lng, lat).

    Returns:
        Lista de elevações (m) ou None para pontos fora do raster.
    """
    from rasterio.windows import Window

    band = src.read(1)
    nodata = src.nodata
    transform = src.transform
    results: list[float | None] = []

    for lng, lat in coordinates:
        try:
            # Convert geographic coords to pixel coords
            col_f, row_f = ~transform * (lng, lat)
            col_i = int(col_f)
            row_i = int(row_f)

            # Check bounds for 2x2 window
            if (
                row_i < 0
                or row_i >= band.shape[0] - 1
                or col_i < 0
                or col_i >= band.shape[1] - 1
            ):
                # Fall back to nearest neighbor
                if 0 <= row_i < band.shape[0] and 0 <= col_i < band.shape[1]:
                    val = float(band[row_i, col_i])
                    results.append(None if (nodata is not None and val == nodata) else val)
                else:
                    results.append(None)
                continue

            # Extract 2x2 neighborhood
            q11 = float(band[row_i, col_i])
            q21 = float(band[row_i, col_i + 1])
            q12 = float(band[row_i + 1, col_i])
            q22 = float(band[row_i + 1, col_i + 1])

            # Check for nodata in any corner
            if nodata is not None and nodata in (q11, q21, q12, q22):
                # Fall back to nearest
                val = float(band[round(row_f), round(col_f)])
                results.append(None if val == nodata else val)
                continue

            # Bilinear interpolation
            dx = col_f - col_i
            dy = row_f - row_i
            val = (
                q11 * (1 - dx) * (1 - dy)
                + q21 * dx * (1 - dy)
                + q12 * (1 - dx) * dy
                + q22 * dx * dy
            )
            results.append(float(val))

        except Exception:
            results.append(None)

    return results
