/**
 * Serviço de Bounding Box
 *
 * Gerencia a lógica de criação, validação e manipulação de bounding boxes
 */

import { BboxValidator } from "../validators";
import { GeoCalculations, BoundingBox, LatLng } from "@/lib/geo";
import type {
  BboxValidationResult,
  BboxValidationError,
  BboxValidationWarning,
  BboxMetadata,
} from "../types";
import { AREA_LIMITS } from "../constants";

const { MAX_BBOX_AREA_KM2, MIN_BBOX_AREA_KM2, BBOX_AREA_WARNING_THRESHOLD } =
  AREA_LIMITS;

export class BoundingBoxService {
  private static instance: BoundingBoxService;
  private validator: BboxValidator;

  private constructor() {
    this.validator = new BboxValidator();
  }

  static getInstance(): BoundingBoxService {
    if (!this.instance) {
      this.instance = new BoundingBoxService();
    }
    return this.instance;
  }

  /**
   * Cria um bbox a partir de dois pontos de clique
   */
  createFromPoints(start: LatLng, end: LatLng): BoundingBox {
    return GeoCalculations.createBboxFromPoints(start, end);
  }

  /**
   * Valida um bbox com todas as regras de negócio
   */
  async validate(bbox: BoundingBox): Promise<BboxValidationResult> {
    const errors: BboxValidationError[] = [];
    const warnings: BboxValidationWarning[] = [];

    // 1. Validação de formato
    const formatResult = this.validator.validateFormat(bbox);
    if (!formatResult.valid) {
      return {
        valid: false,
        errors: formatResult.errors.map((e) => ({
          code: e.code as BboxValidationError["code"],
          message: e.message,
          field: e.field,
        })),
        warnings: [],
      };
    }

    // 2. Validação de coordenadas
    const coordResult = this.validator.validateCoordinates(bbox);
    if (!coordResult.valid) {
      return {
        valid: false,
        errors: coordResult.errors.map((e) => ({
          code: e.code as BboxValidationError["code"],
          message: e.message,
          field: e.field,
        })),
        warnings: [],
      };
    }

    // 3. Cálculo de área
    const area = GeoCalculations.calculateArea(bbox);

    // 4. Validação de área
    if (area > MAX_BBOX_AREA_KM2) {
      errors.push({
        code: "AREA_TOO_LARGE",
        message: `Área selecionada (${area.toFixed(2)} km²) excede o limite de ${MAX_BBOX_AREA_KM2} km²`,
        field: "area",
      });
    }

    if (area < MIN_BBOX_AREA_KM2) {
      errors.push({
        code: "AREA_TOO_SMALL",
        message: `Área selecionada (${area.toFixed(4)} km²) é menor que o mínimo de ${MIN_BBOX_AREA_KM2} km²`,
        field: "area",
      });
    }

    // 5. Avisos
    if (area > BBOX_AREA_WARNING_THRESHOLD && area <= MAX_BBOX_AREA_KM2) {
      warnings.push({
        code: "LARGE_AREA",
        message: "Áreas grandes podem demorar mais para processar",
      });
    }

    const metadata: BboxMetadata = {
      area,
      center: GeoCalculations.getCenter(bbox),
      dimensions: GeoCalculations.getDimensions(bbox),
    };

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  }

  /**
   * Calcula área de um bbox em km²
   */
  calculateArea(bbox: BoundingBox): number {
    return GeoCalculations.calculateArea(bbox);
  }

  /**
   * Expande ou contrai um bbox por uma margem
   */
  adjustByMargin(bbox: BoundingBox, marginKm: number): BoundingBox {
    return GeoCalculations.adjustBboxByMargin(bbox, marginKm);
  }

  /**
   * Converte bbox para formato de query string
   */
  toQueryParams(bbox: BoundingBox): URLSearchParams {
    return GeoCalculations.bboxToQueryParams(bbox);
  }

  /**
   * Converte bbox para formato Overpass
   */
  toOverpassBbox(bbox: BoundingBox): string {
    return GeoCalculations.bboxToOverpass(bbox);
  }

  /**
   * Verifica se uma área é válida (sem erros de tamanho)
   */
  isAreaValid(area: number): boolean {
    return area >= MIN_BBOX_AREA_KM2 && area <= MAX_BBOX_AREA_KM2;
  }
}
