import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import KPICards from "./components/KPICards";
import CriticalAlerts from "./components/CriticalAlerts";
import BlacklistManager from "./components/BlacklistManager";
import Density from "./components/Density";
import LiveTicker from "./components/LiveTicker";
import Footer from "./components/Footer";
import SplashScreen from "./components/SplashScreen";
import TrajectoryPage from "./components/trajectory/TrajectoryPage";
import AnalyticsPage from "./components/analytics/AnalyticsPage";

import { kpiCards, liveAlerts, chokePoints, peakHours, volumeChart } from "./data/mockData";
import useApi from "./hooks/useApi";
import {
  getAlerts,
  getCameraHealth,
  getAccuracyReport,
  getCongestion,
  getHeatmap,
  getOdStats,
  ackAlert,
  connectLive,
} from "./api/client";
import { mapBackendAlert, buildKpiCards, buildDensityProps, feedState } from "./api/adapters";

const ALERT_POLL_MS = 15000;
const DENSITY_POLL_MS = 30000;
// tab label -> lookback hours for the heatmap window
const DENSITY_RANGE_HOURS = { "1h": 1, "6h": 6, "24h": 24 };

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [page, setPage] = useState("home");

  const navigate = useCallback((p) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  // ---- Live backend data (falls back to mockData while the API is down) ----
  const rawAlerts = useApi(() => getAlerts(50), [], { pollMs: ALERT_POLL_MS });
  const health = useApi(() => getCameraHealth(), []);
  const accuracy = useApi(() => getAccuracyReport(), null);

  // ---- WS push (P2, narrow scope): alert frames merged ahead of the poll.
  // Polling stays the source of truth; the socket only shortens alert latency
  // and lights the realtime dot. Reconnects with backoff; never throws.
  const [wsAlerts, setWsAlerts] = useState([]);
  const [realtime, setRealtime] = useState(false);
  useEffect(() => {
    let ws = null;
    let retry = null;
    let cancelled = false;
    const toRow = (msg) => {
      if (!msg || msg.t !== "alert" || !msg.plate) return null;
      const type =
        msg.kind === "blacklist" ? "blacklist" : msg.kind === "clone" ? "clone" : "impossible";
      return {
        id: `ws-${type}-${msg.plate}-${Date.now()}`,
        type,
        canonical: msg.plate,
        payload: {
          camera_id: msg.cam,
          from_cam: msg.from,
          to_cam: msg.to,
          delta_s: msg.delta,
        },
        created_at: new Date().toISOString(),
        _wsAt: Date.now(),
      };
    };
    const connect = () => {
      if (cancelled) return;
      try {
        ws = connectLive({
          onMessage: (msg) => {
            const row = toRow(msg);
            if (!row) return;
            setWsAlerts((prev) =>
              [row, ...prev.filter((r) => Date.now() - (r._wsAt || 0) < 120000)].slice(0, 10)
            );
          },
          onStatus: (s) => setRealtime(s === "open"),
        });
        ws.onclose = () => {
          setRealtime(false);
          if (!cancelled) retry = setTimeout(connect, 5000);
        };
      } catch {
        if (!cancelled) retry = setTimeout(connect, 5000);
      }
    };
    connect();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  // ---- Density panel: range tabs refetch the heatmap window ----
  const [densityRange, setDensityRange] = useState("1h");
  const densityFrom = useMemo(() => {
    const hrs = DENSITY_RANGE_HOURS[densityRange] ?? 1;
    return new Date(Date.now() - hrs * 3600_000).toISOString();
  }, [densityRange]);
  const congestion = useApi(() => getCongestion(), [], { pollMs: DENSITY_POLL_MS });
  const heatmap = useApi(() => getHeatmap(densityFrom), [], {
    pollMs: DENSITY_POLL_MS,
    deps: [densityRange],
  });
  // OD window follows the Density range tabs (backend accepts 30m/1h/6h/24h…).
  const od = useApi(() => getOdStats(densityRange), [], {
    pollMs: DENSITY_POLL_MS,
    deps: [densityRange],
  });

  // Feed liveness drives ALL mock fallbacks below: 'live'/'stale' show real
  // rows (or honest empty states); only 'offline' shows demo fixtures.
  const alertsFeed = feedState({
    updatedAt: rawAlerts.updatedAt,
    error: rawAlerts.error,
    pollMs: ALERT_POLL_MS,
  });
  const densityFeed = feedState({
    updatedAt: Math.max(heatmap.updatedAt ?? 0, congestion.updatedAt ?? 0, od.updatedAt ?? 0) || null,
    error: heatmap.error ?? congestion.error ?? od.error,
    pollMs: DENSITY_POLL_MS,
  });
  const kpiFeed =
    alertsFeed === "live" || densityFeed === "live" ? "live" : alertsFeed;

  const density = useMemo(
    () =>
      buildDensityProps(chokePoints, peakHours, volumeChart, {
        congestion: congestion.data,
        heatmap: heatmap.data,
        live: densityFeed !== "offline",
      }),
    [congestion.data, heatmap.data, densityFeed]
  );

  const alerts = useMemo(() => {
    // Backend reachable (even with zero alerts) -> trust it; only fall back
    // to fixtures when the backend never answered.
    if (rawAlerts.updatedAt == null && !wsAlerts.length) return liveAlerts;
    const keyOf = (r) => {
      let p = r.payload;
      if (typeof p === "string") {
        try {
          p = JSON.parse(p);
        } catch {
          p = {};
        }
      }
      return `${r.type}-${r.canonical}-${p?.camera_id ?? p?.from_cam ?? ""}`;
    };
    const seen = new Set();
    const merged = [];
    for (const r of [...wsAlerts, ...rawAlerts.data]) {
      const k = keyOf(r);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(r);
    }
    return merged.map(mapBackendAlert).filter(Boolean);
  }, [rawAlerts.data, rawAlerts.updatedAt, wsAlerts]);

  const kpis = useMemo(
    () =>
      buildKpiCards(kpiCards, {
        health: health.data,
        alerts: rawAlerts.data,
        accuracy: accuracy.data,
      }),
    [health.data, rawAlerts.data, accuracy.data]
  );

  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === "Critical").length,
    [alerts]
  );

  // Acknowledge a live alert: persist via API, then drop it from the inbox.
  // Mock rows (offline) carry no backend id, so the Ack button never shows.
  const handleAck = useCallback(
    async (alert) => {
      if (!alert?.id || alertsFeed === "offline") return;
      try {
        await ackAlert(alert.id);
        rawAlerts.setData((prev) =>
          Array.isArray(prev) ? prev.filter((r) => (r.id ?? `${r.type}-${r.canonical}`) !== alert.id) : prev
        );
      } catch {
        // leave the row in place; the next poll will retry the state
      }
    },
    [alertsFeed, rawAlerts]
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans">
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}

      <Header alertCount={criticalCount} activePage={page} onNavigate={navigate} />

      <main className="w-full pt-16 min-h-[calc(100vh-4rem)]">
        {page === "trajectory" ? (
          <TrajectoryPage onNavigate={navigate} />
        ) : page === "analytics" ? (
          <AnalyticsPage />
        ) : (
          <div className="w-full px-6 py-4 space-y-4">
            <Hero play={splashDone} onNavigate={navigate} />
            <LiveTicker
              alerts={alerts.slice(0, 20)}
              feed={alertsFeed}
              updatedAt={rawAlerts.updatedAt}
              realtime={realtime}
            />
            <KPICards cards={kpis} feed={kpiFeed} updatedAt={rawAlerts.updatedAt} />
            <Density
              points={density.points}
              hours={density.hours}
              chart={density.chart}
              range={densityRange}
              onRangeChange={setDensityRange}
              feed={densityFeed}
              updatedAt={heatmap.updatedAt ?? congestion.updatedAt}
              flows={od.data}
            />
            <CriticalAlerts alerts={alerts} feed={alertsFeed} onAck={handleAck} />
            <BlacklistManager />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}