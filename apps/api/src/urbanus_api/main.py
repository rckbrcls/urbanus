import os
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from urbanus_api.models import (
    Project,
    NodesExtractRequest,
    ElevationEnrichRequest,
)
from urbanus_api.elevation import enrich_geojson as _enrich_geojson
from urbanus_api.nodes import extract_nodes as _extract_nodes

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


@app.post("/nodes/extract")
async def nodes_extract(req: NodesExtractRequest):
    """Extract nodes from enriched GeoJSON."""
    try:
        result = _extract_nodes(req.geojson, mode=req.mode)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
