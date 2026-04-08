# === Área ===
MAX_AREA_KM2 = 100
MIN_AREA_KM2 = 0.001
AREA_WARNING_THRESHOLD = 50

# === Hidráulica (NBR 9649 / 14486) ===
MANNING_N_DEFAULT = 0.013        # NBR 9649 — todos os materiais (biofilme)
MANNING_N_PVC = 0.010            # NBR 14486 — PVC novo
GAMMA_WATER = 9810               # N/m³ — peso específico da água

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

# === Nós / Snapping ===
SNAP_DISTANCE_METERS = 5.0          # m — clustering espacial de nós

# === Algoritmo (etapas do pipeline) ===
LONG_EDGE_MAX_DISTANCE = 100.0   # m — Etapa 2
REDUNDANT_NODE_MIN_DISTANCE = 20.0  # m — Etapa 3
CURVE_ANGLE_THRESHOLD = 150.0    # graus (deflexão > 30°) — Etapa 4
ELEVATION_PROMINENCE_MIN = 2.0   # m — Etapa 5
DIRECTION_CHANGE_THRESHOLD = 45.0  # graus — PV obrigatório
GRADE_BREAK_THRESHOLD = 0.03       # m/m — diferença de declividade que exige PV
MAX_TERRAIN_SLOPE = 0.15           # m/m — acima disso, subdividir para degraus

# === Roteamento ===
SLOPE_PENALTY = 10.0            # penalidade por declividade insuficiente
REUSE_BONUS = 0.5               # desconto RSPH para reutilizar arestas
