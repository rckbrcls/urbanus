#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# File to track PIDs
PID_FILE=.dev_pids

echo -e "${BLUE}=== URBANUS Development Environment ===${NC}"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Prerequisite Checks
if ! command_exists mongod; then
    echo -e "${RED}Error: mongod is not installed. Please install MongoDB (e.g., brew install mongodb-community)${NC}"
    exit 1
fi

if ! command_exists pnpm; then
    echo -e "${RED}Error: pnpm is not installed. Please install it (npm install -g pnpm)${NC}"
    exit 1
fi

# 1. Start MongoDB
echo -e "${GREEN}[1/3] Starting MongoDB...${NC}"
mkdir -p mongodb_data
# Run MongoDB on port 27018 to match main.py default (or we can use 27017 and set env var)
# Using 27017 standard port and setting env var is better practice.
mongod --dbpath ./mongodb_data --port 27017 --logpath ./mongodb_data/mongod.log --fork
# Capture the PID from the flock/lock file or just rely on pkill for cleanup,
# but --fork is safer for cleanliness, we will use pkill/mongo shutdown for cleanup.

# Set environment variable for the server to connect to local 27017
export MONGO_URL="mongodb://localhost:27017/urbanus"

# 2. Start Backend Server
echo -e "${GREEN}[2/3] Starting Python Backend...${NC}"
cd server
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Run uvicorn in background
uvicorn main:app --reload --port 8000 &
SERVER_PID=$!
echo "Backend running (PID: $SERVER_PID)"
cd ..

# 3. Start Frontend Client
echo -e "${GREEN}[3/3] Starting Next.js Client...${NC}"
cd client
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    pnpm install
fi
pnpm dev &
CLIENT_PID=$!
echo "Client running (PID: $CLIENT_PID)"
cd ..

echo -e "${BLUE}=== All services started! ===${NC}"
echo -e "${BLUE}Server: http://localhost:8000${NC}"
echo -e "${BLUE}Client: http://localhost:3000${NC}"
echo -e "${BLUE}Press Ctrl+C to stop all services.${NC}"

# Cleanup function
cleanup() {
    echo -e "\n${BLUE}Stopping services...${NC}"

    # Kill Python Server
    if kill -0 $SERVER_PID 2>/dev/null; then
        kill $SERVER_PID
    fi

    # Kill Next.js Client
    if kill -0 $CLIENT_PID 2>/dev/null; then
        kill $CLIENT_PID
    fi

    # Stop MongoDB
    echo "Stopping MongoDB..."
    # Attempt graceful shutdown via mongod --shutdown if possible, or kill
    mongod --dbpath ./mongodb_data --shutdown >/dev/null 2>&1

    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

# Register the cleanup function for SIGINT (Ctrl+C)
trap cleanup SIGINT

# Keep script running
wait
