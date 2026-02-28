import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  BrainCircuit,
  Clock,
  Coffee,
  Droplets,
  MessageSquare,
  Play,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchChatStats,
  fetchHydrationSummary,
  fetchLatestFocusSnapshot,
  type ChatStatsResponse,
  type FocusSnapshotResponse,
  type HydrationSummary,
} from "@/app/lib/api";

function formatMinutesUntil(isoString: string | null): string {
  if (!isoString) {
    return "--";
  }

  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) {
    return "--";
  }

  const diffMinutes = Math.max(Math.round((target - Date.now()) / 60000), 0);
  return `${diffMinutes}m`;
}

function formatStressLabel(score: number): string {
  if (score >= 0.7) {
    return "High";
  }
  if (score >= 0.35) {
    return "Moderate";
  }
  return "Low";
}

function formatContentness(score: number): string {
  if (score >= 85) {
    return "Delighted";
  }
  if (score >= 65) {
    return "Happy";
  }
  if (score >= 45) {
    return "Steady";
  }
  return "Needs Attention";
}

export function Dashboard() {
  const [hydration, setHydration] = useState<HydrationSummary | null>(null);
  const [focus, setFocus] = useState<FocusSnapshotResponse | null>(null);
  const [chatStats, setChatStats] = useState<ChatStatsResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const [hydrationResponse, focusResponse, chatResponse] = await Promise.all([
          fetchHydrationSummary(),
          fetchLatestFocusSnapshot(),
          fetchChatStats(),
        ]);

        if (!isMounted) {
          return;
        }

        setHydration(hydrationResponse);
        setFocus(focusResponse);
        setChatStats(chatResponse);
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load dashboard.");
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const focusPercent = Math.round((focus?.latest_sample?.focus_score ?? 0) * 100);
  const stressPercent = Math.round((focus?.latest_sample?.stress_score ?? 0) * 100);
  const hydrationPercent = hydration?.today.progress_percent ?? 0;
  const conversationCount = chatStats?.conversation_count ?? 0;

  const conversationFactor = Math.min(conversationCount * 8, 100);
  const petContentness = Math.round(
    focusPercent * 0.45 + hydrationPercent * 0.35 + conversationFactor * 0.2,
  );

  const stats = [
    {
      label: "Focus Score",
      value: `${focusPercent}%`,
      icon: BrainCircuit,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Stress Level",
      value: formatStressLabel(focus?.latest_sample?.stress_score ?? 0),
      icon: Activity,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Water Intake",
      value: `${(hydration?.today.total_intake_liters ?? 0).toFixed(1)}L`,
      icon: Droplets,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Next Break",
      value: formatMinutesUntil(hydration?.today.next_reminder_at ?? null),
      icon: Clock,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
        <p className="text-neutral-400 mt-2">Overview of your desktop companion's status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur hover:bg-neutral-800/80 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-400">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}>
                <stat.icon size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Live Feed</h3>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-neutral-400 font-mono">REC</span>
            </div>
          </div>

          <div className="aspect-video bg-neutral-950 rounded-lg border border-neutral-800 flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <p className="text-white text-sm font-medium">Camera Feed (ESP32-CAM)</p>
            </div>

            <div className="text-center">
              <Zap className="mx-auto text-neutral-700 mb-2" size={48} />
              <p className="text-neutral-500 text-sm">Connecting to stream...</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Signals</h3>
            <div className="space-y-3">
              <div className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 text-left">
                <span className="text-sm font-medium text-neutral-200">Focus Ready</span>
                <Play size={16} className="text-neutral-400" />
              </div>
              <div className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 text-left">
                <span className="text-sm font-medium text-neutral-200">Hydration Progress</span>
                <Droplets size={16} className="text-blue-400" />
              </div>
              <div className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 text-left">
                <span className="text-sm font-medium text-neutral-200">Conversations</span>
                <MessageSquare size={16} className="text-pink-400" />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-neutral-800 bg-gradient-to-br from-purple-900/20 to-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-2">Pet Status</h3>
            <div className="flex items-center gap-4 mt-4">
              <div className="w-12 h-12 rounded-full bg-neutral-800 border-2 border-green-500 flex items-center justify-center">
                <span className="text-2xl">:)</span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Otto</p>
                <p className="text-xs text-neutral-400">
                  Feeling: {formatContentness(petContentness)}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${petContentness}%` }} />
            </div>
            <p className="text-xs text-right text-neutral-500 mt-1">
              Contentness: {petContentness}%
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-neutral-900/80 p-2">
                <p className="text-neutral-500">Focus</p>
                <p className="text-white font-semibold">{focusPercent}%</p>
              </div>
              <div className="rounded-lg bg-neutral-900/80 p-2">
                <p className="text-neutral-500">Water</p>
                <p className="text-white font-semibold">{hydrationPercent}%</p>
              </div>
              <div className="rounded-lg bg-neutral-900/80 p-2">
                <p className="text-neutral-500">Chats</p>
                <p className="text-white font-semibold">{conversationCount}</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-neutral-900/80 text-sm">
              <p className="text-neutral-400">Latest stress sample</p>
              <p className="text-white font-medium">{stressPercent}% stress load</p>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-neutral-900/80 text-sm">
              <p className="text-neutral-400">Break readiness</p>
              <p className="text-white font-medium flex items-center gap-2">
                <Coffee size={14} className="text-orange-400" />
                {formatMinutesUntil(hydration?.today.next_reminder_at ?? null)} until next hydration prompt
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
