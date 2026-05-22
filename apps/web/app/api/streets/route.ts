import { NextRequest, NextResponse } from "next/server";
import { clipFeatureCollectionToBbox } from "@urbanus/geo";

const DEFAULT_OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OVERPASS_ERROR_MESSAGE = "Unable to fetch street data from OpenStreetMap";
const DEFAULT_OVERPASS_USER_AGENT = "Urbanus/0.1 (+https://github.com/rckbrcls/urbanus)";

interface StreetsRequest {
  south: number;
  north: number;
  west: number;
  east: number;
  types?: string[];
}

const DEFAULT_HIGHWAY_TYPES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
];

interface OverpassElement {
  type: string;
  id: number;
  nodes?: number[];
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassData {
  elements: OverpassElement[];
}

function getOverpassApiUrls() {
  const urlsFromList = parseOverpassApiUrls(process.env.OVERPASS_API_URLS);
  if (urlsFromList.length > 0) {
    return urlsFromList;
  }

  const urlFromSingleValue = parseOverpassApiUrls(process.env.OVERPASS_API_URL);
  if (urlFromSingleValue.length > 0) {
    return urlFromSingleValue;
  }

  return DEFAULT_OVERPASS_API_URLS;
}

function parseOverpassApiUrls(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function getOverpassUserAgent() {
  return process.env.OVERPASS_USER_AGENT?.trim() || DEFAULT_OVERPASS_USER_AGENT;
}

async function fetchOverpassData(query: string): Promise<OverpassData> {
  const errors: string[] = [];

  for (const url of getOverpassApiUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": getOverpassUserAgent(),
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      const isHtml = response.headers.get("content-type")?.includes("text/html")
        || responseText.trimStart().startsWith("<");

      if (!response.ok || isHtml) {
        const summary = extractOverpassError(responseText) || responseText.slice(0, 500);
        errors.push(`${url}: HTTP ${response.status} ${summary}`);
        console.error("Overpass endpoint error:", url, summary);
        continue;
      }

      try {
        return JSON.parse(responseText) as OverpassData;
      } catch {
        errors.push(`${url}: invalid JSON response`);
        console.error("Overpass endpoint returned invalid JSON:", url, responseText.slice(0, 500));
      }
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "request timed out"
        : String(error);
      errors.push(`${url}: ${message}`);
      console.error("Overpass endpoint request failed:", url, message);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(errors.join(" | "));
}

function extractOverpassError(responseText: string) {
  const overpassRegex = new RegExp('<p[^>]*>.*?<strong[^>]*>Error</strong>:\\s*(.*?)</p>', "s");
  return overpassRegex.exec(responseText)?.[1]?.replace(/<[^>]+>/g, "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body: StreetsRequest = await request.json();
    const { south, north, west, east, types = DEFAULT_HIGHWAY_TYPES } = body;

    if (south == null || north == null || west == null || east == null) {
      return NextResponse.json(
        { error: "Bounding box parameters are required (south, north, west, east)" },
        { status: 400 }
      );
    }

    const latDiff = north - south;
    const lonDiff = east - west;
    const avgLat = (north + south) / 2;
    const kmPerDegreeLat = 111.32;
    const kmPerDegreeLon = 111.32 * Math.cos((avgLat * Math.PI) / 180);
    const areaKm2 = latDiff * kmPerDegreeLat * lonDiff * kmPerDegreeLon;

    const maxAreaKm2 = 100;
    if (areaKm2 > maxAreaKm2) {
      return NextResponse.json(
        {
          error: `Selected area is too large (${areaKm2.toFixed(1)} km²). Maximum: ${maxAreaKm2} km²`,
          areaKm2,
        },
        { status: 400 }
      );
    }

    const query = `
      [out:json][timeout:30];
      (
        way["highway"~"^(${types.join("|")})$"](${south},${west},${north},${east});
      );
      out body;
      >;
      out skel qt;
    `;

    let data: OverpassData;
    try {
      data = await fetchOverpassData(query);
    } catch (error) {
      console.error("All Overpass endpoints failed:", error);
      return NextResponse.json(
        { error: OVERPASS_ERROR_MESSAGE },
        { status: 502 }
      );
    }

    const geojson = convertToGeoJSON(data);
    const clipped = clipFeatureCollectionToBbox(geojson as GeoJSON.FeatureCollection, {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    });

    return NextResponse.json({
      type: "FeatureCollection",
      features: clipped.features,
      metadata: {
        totalStreets: clipped.features.length,
        areaKm2: areaKm2,
        bounds: { south, north, west, east },
      },
    });
  } catch (error) {
    console.error("Error in streets API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

function convertToGeoJSON(data: OverpassData) {
  const nodes: Record<number, [number, number]> = {};
  const ways: Array<{
    id: number;
    nodes: number[];
    tags: Record<string, string>;
  }> = [];

  for (const element of data.elements) {
    if (element.type === "node" && element.lat != null && element.lon != null) {
      nodes[element.id] = [element.lon, element.lat];
    } else if (element.type === "way" && element.nodes) {
      ways.push({
        id: element.id,
        nodes: element.nodes,
        tags: element.tags || {},
      });
    }
  }

  const features = ways
    .map((way) => {
      const coordinates = way.nodes
        .map((nodeId) => nodes[nodeId])
        .filter((coord) => coord !== undefined);

      if (coordinates.length < 2) return null;

      return {
        type: "Feature" as const,
        properties: {
          id: way.id,
          name: way.tags.name || null,
          highway: way.tags.highway,
          surface: way.tags.surface || null,
          lanes: way.tags.lanes ? parseInt(way.tags.lanes) : null,
          maxspeed: way.tags.maxspeed || null,
          oneway: way.tags.oneway === "yes",
        },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      };
    })
    .filter((f) => f !== null);

  return { type: "FeatureCollection" as const, features };
}

export async function GET() {
  return NextResponse.json({
    message: "Streets API - OpenStreetMap Overpass",
    endpoint: "POST /api/streets",
    requiredParams: {
      south: "South latitude of the bounding box",
      north: "North latitude of the bounding box",
      west: "West longitude of the bounding box",
      east: "East longitude of the bounding box",
    },
    optionalParams: {
      types: `Highway types (default: ${DEFAULT_HIGHWAY_TYPES.join(", ")})`,
    },
    maxArea: "100 km²",
  });
}
