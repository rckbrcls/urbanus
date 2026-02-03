import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from elevation import enrich_geojson as _enrich_geojson
from graph_processing import analyze_geojson as _analyze_geojson
from graph_processing import process_geojson as _process_geojson

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27018/urbanus")
client = AsyncIOMotorClient(MONGO_URL)
db = client.get_default_database()
projects_collection = db["projects"]

# Models
class LatLng(BaseModel):
    lat: float
    lng: float

class BoundingBox(BaseModel):
    southWest: LatLng
    northEast: LatLng

class ProjectStats(BaseModel):
    streetCount: int

class Project(BaseModel):
    id: str
    name: str
    createdAt: int
    bounds: BoundingBox
    areaKm2: float
    center: List[float]
    zoom: float
    stats: ProjectStats
    streets: Dict[str, Any]


class ElevationEnrichBbox(BaseModel):
    south: float
    north: float
    west: float
    east: float


class ElevationEnrichRequest(BaseModel):
    geojson: Dict[str, Any]
    bbox: ElevationEnrichBbox
    demType: Optional[str] = "COP30"


class GraphProcessOptions(BaseModel):
    maxEdgeLength: float
    preserveElevations: Optional[bool] = True


class GraphProcessRequest(BaseModel):
    geojson: Dict[str, Any]
    options: GraphProcessOptions


class GraphAnalyzeRequest(BaseModel):
    geojson: Dict[str, Any]
    maxEdgeLength: float


@app.get("/")
def read_root():
    return {"status": "ok"}

@app.post("/projects", response_model=Project)
async def create_project(project: Project):
    await projects_collection.replace_one({"id": project.id}, project.model_dump(), upsert=True)
    return project

@app.get("/projects", response_model=List[Project])
async def get_projects():
    projects = []
    async for p in projects_collection.find():
        projects.append(Project(**p))
    return projects

@app.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await projects_collection.find_one({"id": project_id})
    if project:
        return Project(**project)
    raise HTTPException(status_code=404, detail="Project not found")

@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    result = await projects_collection.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


@app.post("/elevation/enrich")
async def elevation_enrich(req: ElevationEnrichRequest):
    """Enrich GeoJSON with elevation from GeoTIFF (OpenTopography)."""
    try:
        enriched = _enrich_geojson(
            req.geojson,
            south=req.bbox.south,
            north=req.bbox.north,
            west=req.bbox.west,
            east=req.bbox.east,
            dem_type=req.demType or "COP30",
        )
        return enriched
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/graph/analyze")
async def graph_analyze(req: GraphAnalyzeRequest):
    if req.maxEdgeLength <= 0:
        raise HTTPException(
            status_code=400, detail="maxEdgeLength deve ser maior que zero"
        )
    try:
        return _analyze_geojson(req.geojson, req.maxEdgeLength)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/graph/process")
async def graph_process(req: GraphProcessRequest):
    if req.options.maxEdgeLength <= 0:
        raise HTTPException(
            status_code=400, detail="maxEdgeLength deve ser maior que zero"
        )
    try:
        return _process_geojson(
            req.geojson,
            req.options.maxEdgeLength,
            bool(req.options.preserveElevations),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
