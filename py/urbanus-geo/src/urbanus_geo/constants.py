# === Área ===
MAX_AREA_KM2 = 100
MIN_AREA_KM2 = 0.001
AREA_WARNING_THRESHOLD = 50

# === Hidráulica (NBR 9649 / 14486) ===
MANNING_N_DEFAULT = 0.013        # NBR 9649 — todos os materiais (biofilme)
MANNING_N_PVC = 0.010            # NBR 14486 — PVC novo
GAMMA_WATER = 9810               # N/m³ — peso específico da água

# Tensão trativa mínima (Pa)
MIN_TRACTIVE_STRESS = 1.0        # NBR 9649 (n=0.013)
MIN_TRACTIVE_STRESS_PVC = 0.6    # NBR 14486 (n=0.010)

# Lâmina e velocidade
MAX_FLOW_DEPTH_RATIO = 0.75      # y/D máximo
MAX_VELOCITY = 5.0               # m/s
MIN_FLOW_RATE = 1.5              # L/s — vazão mínima qualquer trecho

# Diâmetros nominais (mm)
PIPE_DIAMETERS = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000]
MIN_DIAMETER_COLLECTOR = 150     # DN mín. coletor
MIN_DIAMETER_LATERAL = 100       # DN mín. ramal

# Recobrimento mínimo (m)
MIN_COVER_STREET = 0.90
MIN_COVER_SIDEWALK = 0.65

# PV — Poço de Visita
MAX_PV_SPACING = 100             # m (80-120 conforme equipamento)
MIN_PV_SPACING = 80
PV_MIN_LID_DIAMETER = 0.60      # m
PV_MIN_CHAMBER_SIZE = 0.80      # m

# === Vazão (estimativa) ===
PER_CAPITA_CONSUMPTION = 150     # L/hab/dia (150-200, usar 150 conservador)
RETURN_COEFFICIENT = 0.80        # C
K1_MAX_DAILY = 1.2
K2_MAX_HOURLY = 1.5
INFILTRATION_RATE_MIN = 0.05     # L/s por km
INFILTRATION_RATE_MAX = 1.0      # L/s por km

# === Declividade mínima ===
# I_min = 0.0055 × Qi^(-0.47) — implementar como função em calculations.py

# === Algoritmo (etapas do pipeline) ===
LONG_EDGE_MAX_DISTANCE = 100.0   # m — Etapa 2
REDUNDANT_NODE_MIN_DISTANCE = 20.0  # m — Etapa 3
CURVE_ANGLE_THRESHOLD = 150.0    # graus (deflexão > 30°) — Etapa 4
ELEVATION_PROMINENCE_MIN = 2.0   # m — Etapa 5
DIRECTION_CHANGE_THRESHOLD = 45.0  # graus — PV obrigatório

# === Custos (elevatórias) ===
PUMP_CAPEX_MIN = 150_000        # R$ (Q ≤ 7.5 L/s)
PUMP_CAPEX_MAX = 500_000        # R$
PUMP_HORIZON_YEARS = 20
PUMP_DISCOUNT_RATE = 0.10       # 8-12%, usar 10%
MAX_GRAVITY_DEPTH = 4.5         # m — além disso, elevatória é mais econômica

# === Custo de tubulação (função de custo das arestas) ===
PIPE_UNIT_COST = 1.0            # custo unitário por metro (normalizado)
EXCAVATION_A_COEF = 1.0         # C(d) = a×d² + b×d
EXCAVATION_B_COEF = 0.5
SLOPE_PENALTY = 10.0            # penalidade por declividade insuficiente
PUMP_PENALTY = 100_000          # penalidade alta para bombeamento
REUSE_BONUS = 0.5               # desconto RSPH para reutilizar arestas
