import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalOverpassUrls = process.env.OVERPASS_API_URLS;
const originalOverpassUrl = process.env.OVERPASS_API_URL;

function streetsRequest() {
  return new Request("http://localhost/api/streets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      south: -23.56,
      north: -23.55,
      west: -46.64,
      east: -46.63,
    }),
  });
}

function overpassPayload() {
  return {
    elements: [
      {
        type: "way",
        id: 1,
        nodes: [10, 11],
        tags: { highway: "residential", name: "Test Street" },
      },
      { type: "node", id: 10, lat: -23.559, lon: -46.639 },
      { type: "node", id: 11, lat: -23.551, lon: -46.631 },
    ],
  };
}

describe("POST /api/streets", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.OVERPASS_API_URLS = "https://first.test/api, https://second.test/api";
    delete process.env.OVERPASS_API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalOverpassUrls === undefined) {
      delete process.env.OVERPASS_API_URLS;
    } else {
      process.env.OVERPASS_API_URLS = originalOverpassUrls;
    }

    if (originalOverpassUrl === undefined) {
      delete process.env.OVERPASS_API_URL;
    } else {
      process.env.OVERPASS_API_URL = originalOverpassUrl;
    }
  });

  it("falls back to the next Overpass endpoint after a 406 HTML response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("<html><h1>Not Acceptable</h1></html>", {
          status: 406,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(overpassPayload(), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await POST(streetsRequest() as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://first.test/api");
    expect(fetchMock.mock.calls[1][0]).toBe("https://second.test/api");
    expect(fetchMock.mock.calls[1][1]?.body).toBeInstanceOf(URLSearchParams);
    expect(body.features).toHaveLength(1);
    expect(body.features[0].properties.name).toBe("Test Street");
  });

  it("returns a stable error when every Overpass endpoint fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(
      new Response("<html><h1>Not Acceptable</h1></html>", {
        status: 406,
        headers: { "Content-Type": "text/html" },
      }),
    ));

    const response = await POST(streetsRequest() as never);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("Unable to fetch street data from OpenStreetMap");
  });

  it("trims empty values from the comma-separated Overpass endpoint list", async () => {
    process.env.OVERPASS_API_URLS = " , https://first.test/api,  , https://second.test/api ";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(overpassPayload(), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await POST(streetsRequest() as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://first.test/api");
  });

  it("uses the single Overpass endpoint env var when the endpoint list is empty", async () => {
    process.env.OVERPASS_API_URLS = " , ";
    process.env.OVERPASS_API_URL = "https://single.test/api";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(overpassPayload(), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await POST(streetsRequest() as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://single.test/api");
  });
});
