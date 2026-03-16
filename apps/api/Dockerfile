FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for rasterio (GDAL and runtime libraries)
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    g++ \
    libexpat1 \
    libproj-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for rasterio to find GDAL
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV LD_LIBRARY_PATH=/usr/lib

RUN pip install uv

COPY pyproject.toml uv.lock ./
COPY py/ py/
COPY apps/api/ apps/api/

RUN uv sync

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "urbanus_api.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
