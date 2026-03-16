from __future__ import annotations

import math

from urbanus_geo.constants import GAMMA_WATER, MANNING_N_DEFAULT

KM_PER_DEGREE_LAT = 111.32


def area_km2(south: float, north: float, west: float, east: float) -> float:
    """Estimate area (km²) from a lat/lng bounding box."""
    avg_lat = (north + south) / 2
    km_per_deg_lon = KM_PER_DEGREE_LAT * max(0.01, abs(math.cos(math.radians(avg_lat))))
    return (north - south) * KM_PER_DEGREE_LAT * (east - west) * km_per_deg_lon


# === Hidráulica (Manning / NBR 9649) ===


def manning_velocity(rh: float, slope: float, n: float = MANNING_N_DEFAULT) -> float:
    """V = (1/n) × R_h^(2/3) × I^(1/2) — Fórmula de Manning.

    Args:
        rh: Raio hidráulico (m).
        slope: Declividade (m/m), deve ser > 0.
        n: Coeficiente de Manning.

    Returns:
        Velocidade (m/s).
    """
    if slope <= 0 or rh <= 0:
        return 0.0
    return (1.0 / n) * (rh ** (2.0 / 3.0)) * math.sqrt(slope)


def hydraulic_radius_partial(diameter: float, depth: float) -> float:
    """Raio hidráulico para seção circular parcialmente cheia.

    Args:
        diameter: Diâmetro interno do tubo (m).
        depth: Profundidade da lâmina d'água (m).

    Returns:
        Raio hidráulico R_h (m).
    """
    if diameter <= 0 or depth <= 0 or depth > diameter:
        return 0.0
    y_over_d = depth / diameter
    theta = 2.0 * math.acos(1.0 - 2.0 * y_over_d)
    area = (diameter ** 2 / 8.0) * (theta - math.sin(theta))
    perimeter = (diameter / 2.0) * theta
    if perimeter == 0:
        return 0.0
    return area / perimeter


def tractive_stress(rh: float, slope: float, gamma: float = GAMMA_WATER) -> float:
    """τ = γ × R_h × I — Tensão trativa (Pa).

    Args:
        rh: Raio hidráulico (m).
        slope: Declividade (m/m).
        gamma: Peso específico da água (N/m³).

    Returns:
        Tensão trativa (Pa).
    """
    return gamma * rh * slope


def min_slope(qi_ls: float) -> float:
    """I_min = 0.0055 × Qi^(-0.47) — NBR 9649 §5.1.4.

    Args:
        qi_ls: Vazão de início de plano (L/s). Mínimo 1.5 L/s.

    Returns:
        Declividade mínima (m/m).
    """
    qi = max(qi_ls, 1.5)
    return 0.0055 * (qi ** -0.47)


def critical_velocity(rh: float, g: float = 9.81) -> float:
    """V_c = 6 × √(g × R_h) — Velocidade crítica.

    Args:
        rh: Raio hidráulico (m).
        g: Aceleração da gravidade (m/s²).

    Returns:
        Velocidade crítica (m/s).
    """
    if rh <= 0:
        return 0.0
    return 6.0 * math.sqrt(g * rh)


def flow_rate(area: float, velocity: float) -> float:
    """Q = A × V — Vazão (m³/s)."""
    return area * velocity


def sewage_flow_estimate(
    population: int,
    per_capita: float = 150.0,
    return_coef: float = 0.80,
) -> float:
    """Q_d = (P × q × C) / 86400 — Vazão média de esgoto (L/s).

    Args:
        population: População atendida.
        per_capita: Consumo per capita (L/hab/dia).
        return_coef: Coeficiente de retorno (C).

    Returns:
        Vazão média (L/s).
    """
    return (population * per_capita * return_coef) / 86400.0


def peak_flow(
    q_d: float,
    k1: float = 1.2,
    k2: float = 1.5,
    q_inf: float = 0.0,
    q_c: float = 0.0,
) -> float:
    """Q_f,max = K1 × K2 × Q_d + Q_inf + Q_c — Vazão máxima final (L/s).

    Args:
        q_d: Vazão média de esgoto (L/s).
        k1: Coeficiente do dia de maior consumo.
        k2: Coeficiente da hora de maior consumo.
        q_inf: Vazão de infiltração (L/s).
        q_c: Vazão concentrada / industrial (L/s).

    Returns:
        Vazão de pico (L/s).
    """
    return k1 * k2 * q_d + q_inf + q_c


def pump_npv(
    capex: float,
    annual_opex: float,
    years: int = 20,
    rate: float = 0.10,
) -> float:
    """VPL = CAPEX + Σ(OPEX / (1+r)^t) — Valor presente líquido de elevatória.

    Args:
        capex: Custo de investimento (R$).
        annual_opex: Custo operacional anual (R$).
        years: Horizonte de análise (anos).
        rate: Taxa de desconto anual.

    Returns:
        VPL total (R$).
    """
    total = capex
    for t in range(1, years + 1):
        total += annual_opex / ((1.0 + rate) ** t)
    return total


# === Geoespacial ===


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em metros entre dois pontos (Haversine).

    Args:
        lat1, lon1: Coordenadas do ponto 1 (graus).
        lat2, lon2: Coordenadas do ponto 2 (graus).

    Returns:
        Distância (metros).
    """
    R = 6_371_000  # raio médio da Terra em metros
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def slope_2d(z_up: float, z_down: float, distance_2d: float) -> float:
    """Declividade = Δz / distância horizontal (m/m).

    Args:
        z_up: Elevação a montante (m).
        z_down: Elevação a jusante (m).
        distance_2d: Distância horizontal (m).

    Returns:
        Declividade (m/m). Positivo = desce de z_up para z_down.
    """
    if distance_2d <= 0:
        return 0.0
    return (z_up - z_down) / distance_2d


def tube_elevation(terrain_z: float, cover: float, diameter_m: float) -> float:
    """z_tubo = z_terreno - recobrimento - diâmetro.

    Calcula a cota do geratriz inferior (invert) do tubo.

    Args:
        terrain_z: Cota do terreno (m).
        cover: Recobrimento mínimo (m).
        diameter_m: Diâmetro do tubo (m).

    Returns:
        Cota da geratriz inferior (m).
    """
    return terrain_z - cover - diameter_m


def angle_at_node(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
) -> float:
    """Ângulo interno em B entre segmentos BA e BC (graus).

    Args:
        a: Coordenadas (lat, lng) do ponto A.
        b: Coordenadas (lat, lng) do ponto B (vértice).
        c: Coordenadas (lat, lng) do ponto C.

    Returns:
        Ângulo em graus [0, 180].
    """
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])
    dot = ba[0] * bc[0] + ba[1] * bc[1]
    mag_ba = math.sqrt(ba[0] ** 2 + ba[1] ** 2)
    mag_bc = math.sqrt(bc[0] ** 2 + bc[1] ** 2)
    if mag_ba == 0 or mag_bc == 0:
        return 0.0
    cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return math.degrees(math.acos(cos_angle))


def line_intersection(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> tuple[float, float] | None:
    """Interseção de retas L1(A→B) e L2(C→D), forma paramétrica.

    Returns:
        Ponto de interseção (x, y) ou None se paralelas.
    """
    dx1, dy1 = b[0] - a[0], b[1] - a[1]
    dx2, dy2 = d[0] - c[0], d[1] - c[1]
    denom = dx1 * dy2 - dy1 * dx2
    if abs(denom) < 1e-12:
        return None
    t = ((c[0] - a[0]) * dy2 - (c[1] - a[1]) * dx2) / denom
    return (a[0] + t * dx1, a[1] + t * dy1)
