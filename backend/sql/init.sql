-- Delhi ANPR — Timescale + PostGIS schema
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Registry: every camera (sim / file / rtsp / edge) lives here. Swap = UPDATE type/uri.
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  edge_id TEXT,
  geom GEOMETRY(Point, 4326) NOT NULL,
  heading REAL,
  zone TEXT,
  type TEXT NOT NULL CHECK (type IN ('sim','sim_event','file','rtsp','edge')),
  uri TEXT,
  edge_token TEXT,
  status TEXT DEFAULT 'ok'
);
CREATE INDEX IF NOT EXISTS idx_cameras_geom ON cameras USING GIST (geom);

-- Core event table — hypertable, source of truth. Everything derives from this.
CREATE TABLE IF NOT EXISTS reads (
  read_id UUID NOT NULL DEFAULT gen_random_uuid(),
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  ts TIMESTAMPTZ NOT NULL,
  raw_plate TEXT,
  canonical TEXT,
  confidence REAL,
  crop_path TEXT,
  gt_plate TEXT,          -- sim-only, for accuracy/trajectory metrics
  vehicle_class TEXT
);
SELECT create_hypertable('reads', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour', migrate_data => TRUE);
-- hypertable requires PK/unique to include partitioning col ts
CREATE UNIQUE INDEX IF NOT EXISTS idx_reads_read_id_ts ON reads (read_id, ts);
CREATE INDEX IF NOT EXISTS idx_reads_canonical_ts ON reads (canonical, ts DESC);
CREATE INDEX IF NOT EXISTS idx_reads_camera_ts ON reads (camera_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_reads_ts_brin ON reads USING BRIN (ts);

CREATE TABLE IF NOT EXISTS vehicles (
  canonical TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  read_count INT DEFAULT 0,
  flags JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS blacklist (
  plate TEXT PRIMARY KEY,
  reason TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- blacklist | impossible | clone | health | anomaly
  canonical TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged BOOL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts (created_at DESC);

-- Travel-time graph (small, hot, updated in worker memory, flushed periodically)
CREATE TABLE IF NOT EXISTS camera_pairs (
  from_cam TEXT NOT NULL REFERENCES cameras(id),
  to_cam TEXT NOT NULL REFERENCES cameras(id),
  road_dist_m REAL NOT NULL,
  samples INT DEFAULT 0,
  median_tt REAL,
  p90_tt REAL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (from_cam, to_cam)
);

CREATE TABLE IF NOT EXISTS od_stats (
  window_start TIMESTAMPTZ NOT NULL,
  from_cam TEXT NOT NULL,
  to_cam TEXT NOT NULL,
  vehicle_count INT NOT NULL,
  PRIMARY KEY (window_start, from_cam, to_cam)
);

CREATE TABLE IF NOT EXISTS health_stats (
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  window_start TIMESTAMPTZ NOT NULL,
  expected_rate REAL,
  observed_rate REAL,
  status TEXT,
  PRIMARY KEY (camera_id, window_start)
);

-- 1-min per-camera rollups — heatmap/analytics read ONLY this, never raw reads
CREATE TABLE IF NOT EXISTS camera_rollups (
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (camera_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rollups_window ON camera_rollups (window_start DESC);

-- Sim ground-truth tape for metrics (trajectory recall, per-condition accuracy)
CREATE TABLE IF NOT EXISTS gt_crossings (
  crossing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veh_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  sim_ts TIMESTAMPTZ NOT NULL,
  gt_plate TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gt_veh_ts ON gt_crossings (veh_id, sim_ts);
