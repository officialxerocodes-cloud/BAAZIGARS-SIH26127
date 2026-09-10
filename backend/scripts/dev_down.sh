#!/usr/bin/env bash
pkill -f "uvicorn ingest" || true
pkill -f "uvicorn anpr_stub" || true
pkill -f "uvicorn api" || true
pkill -f "workers.matcher" || true
pkill -f "workers.analytics" || true
pkill -f "workers.alerts" || true
docker compose down || true
echo "down"
