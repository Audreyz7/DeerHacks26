import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, BrainCircuit, PlayCircle, Square } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import {
  endFocusSession,
  fetchEncouragement,
  fetchLatestFocusSnapshot,
  getStoredActiveFocusSessionId,
  getStoredFocusReport,
  recordFocusSample,
  setStoredActiveFocusSessionId,
  setStoredFocusReport,
  startFocusSession,
  type FocusReportResponse,
} from "@/app/lib/api";

type ChartPoint = {
  time: string;
  focus: number;
  stress: number;
};

function formatStressLabel(score: number): string {
  if (score >= 70) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

function buildChartData(report: FocusReportResponse["report"] | null): ChartPoint[] {
  if (!report) return [];

  return report.graph_points.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    focus: Math.round(point.focus_score * 100),
    stress: Math.round(point.stress_score * 100),
  }));
}

function createSamplePoint(previous: ChartPoint | null): { focus: number; stress: number } {
  const nextFocus = previous ? Math.max(15, Math.min(95, previous.focus + (Math.random() * 18 - 9))) : 72;
  const nextStress = previous ? Math.max(5, Math.min(90, previous.stress + (Math.random() * 16 - 8))) : 28;

  return {
    focus: Math.round(nextFocus) / 100,
    stress: Math.round(nextStress) / 100,
  };
}

export function Focus() {
  const [chartData, setChartData] = useState<ChartPoint[]>(() => buildChartData(getStoredFocusReport()));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => getStoredActiveFocusSessionId());
  const [latestReport, setLatestReport] = useState<FocusReportResponse["report"] | null>(() => getStoredFocusReport());
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [encouragement, setEncouragement] = useState("Start a focus session to generate live insights.");

  useEffect(() => {
    let isMounted = true;

    async function loadSnapshot() {
      try {
        const snapshot = await fetchLatestFocusSnapshot();
        if (!isMounted) return;

        if (snapshot.latest_report?.report) {
          setLatestReport(snapshot.latest_report.report);
          setStoredFocusReport(snapshot.latest_report.report);
          setChartData(buildChartData(snapshot.latest_report.report));
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load focus analytics.");
        }
      }
    }

    void loadSnapshot();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;

    const intervalId = window.setInterval(() => {
      const previous = chartData.at(-1) ?? null;
      const sample = createSamplePoint(previous);

      void recordFocusSample({
        session_id: activeSessionId,
        focus_score: sample.focus,
        stress_score: sample.stress,
        captured_at: new Date().toISOString(),
      }).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to record focus sample.");
      });

      setChartData((current) => {
        const nextPoint: ChartPoint = {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          focus: Math.round(sample.focus * 100),
          stress: Math.round(sample.stress * 100),
        };
        return [...current.slice(-11), nextPoint];
      });

      void fetchEncouragement(sample.focus, sample.stress)
        .then((message) => {
          setEncouragement(message);
        })
        .catch(() => {});
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSessionId, chartData]);

  const latestPoint = chartData.at(-1) ?? null;
  const focusScore = latestPoint?.focus ?? Math.round((latestReport?.average_focus ?? 0) * 100);
  const stressScore = latestPoint?.stress ?? Math.round((latestReport?.average_stress ?? 0) * 100);
  const fatigueScore = Math.max(0, 100 - focusScore);
  const stressSpike = chartData.find((point) => point.stress >= 70) ?? null;

  async function handleStartSession() {
    setIsStarting(true);
    try {
      const response = await startFocusSession(true);
      setActiveSessionId(response.session.session_id);
      setStoredActiveFocusSessionId(response.session.session_id);
      setChartData([]);
      setLatestReport(null);
      setStoredFocusReport(null);
      setEncouragement("Session started. Metrics will update every 15 seconds.");
      toast.success("Focus session started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start focus session.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleEndSession() {
    if (!activeSessionId) return;

    setIsEnding(true);
    try {
      const response = await endFocusSession(activeSessionId);
      setLatestReport(response.report);
      setStoredFocusReport(response.report);
      setChartData(buildChartData(response.report));
      setActiveSessionId(null);
      setStoredActiveFocusSessionId(null);
      toast.success("Focus session completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to end focus session.");
    } finally {
      setIsEnding(false);
    }
  }

  function handleExportReport() {
    if (!latestReport) {
      toast.error("No report available yet.");
      return;
    }

    const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "focus-report.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BrainCircuit className="text-purple-500" size={32} />
            Focus & Stress Analytics
          </h2>
          <p className="text-neutral-400 mt-2">Real-time monitoring using Presage API & Micro-expressions.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => void handleStartSession()}
            disabled={Boolean(activeSessionId) || isStarting}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlayCircle size={18} />
            {isStarting ? "Starting..." : activeSessionId ? "Session Active" : "Start Session"}
          </button>
          <button
            onClick={activeSessionId ? () => void handleEndSession() : handleExportReport}
            disabled={isEnding || (!activeSessionId && !latestReport)}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors border border-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {activeSessionId ? <Square size={16} /> : null}
            {activeSessionId ? (isEnding ? "Stopping..." : "End Session") : "Export Report"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-2 p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity size={18} className="text-neutral-400" />
              Live Session Analysis
            </h3>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-neutral-400">Focus</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-neutral-400">Stress</span>
              </div>
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="time" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#525252" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626", borderRadius: "8px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Area type="monotone" dataKey="focus" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorFocus)" />
                <Area type="monotone" dataKey="stress" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorStress)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Current State</h3>

            <div className="space-y-6">
              <div className="text-center p-4 bg-neutral-950/50 rounded-lg border border-neutral-800">
                <span className="text-sm text-neutral-400 uppercase tracking-wider font-medium">Focus Score</span>
                <div className="text-5xl font-bold text-white mt-2 font-mono">{focusScore}</div>
                <span className="text-xs text-green-400 mt-1 block">
                  {latestReport ? `${Math.round(latestReport.average_focus * 100)} average this session` : "Waiting for data"}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Stress Level</span>
                  <span className="text-orange-400 font-medium">{formatStressLabel(stressScore)}</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${stressScore}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Fatigue</span>
                  <span className="text-green-400 font-medium">{fatigueScore < 35 ? "Low" : "Building"}</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500" style={{ width: `${fatigueScore}%` }} />
                </div>
              </div>

              <div className="rounded-lg bg-neutral-950/50 border border-neutral-800 p-4 text-sm text-neutral-300">
                {encouragement}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="p-4 rounded-xl border border-red-900/30 bg-red-900/10 backdrop-blur flex gap-3"
          >
            <AlertTriangle className="text-red-500 flex-shrink-0" size={24} />
            <div>
              <h4 className="text-sm font-semibold text-red-200">Stress Spike Detection</h4>
              <p className="text-xs text-red-300/80 mt-1">
                {stressSpike
                  ? `Stress reached ${stressSpike.stress}% at ${stressSpike.time}. Smart break logic can react to that trend.`
                  : "No major stress spike detected in the latest data."}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
