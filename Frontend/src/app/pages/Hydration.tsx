import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, Droplets, History } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";

import {
  fetchHydrationSummary,
  type HydrationSummary,
  logWaterIntake,
  saveWaterSchedule,
} from "@/app/lib/api";

const defaultSummary: HydrationSummary = {
  user_id: "demo-user",
  today: {
    total_intake_ml: 0,
    total_intake_liters: 0,
    goal_liters: 2.5,
    progress_percent: 0,
    last_intake_at: null,
    next_reminder_at: null,
  },
  weekly_history: [
    { label: "Mon", total_ml: 0, total_liters: 0 },
    { label: "Tue", total_ml: 0, total_liters: 0 },
    { label: "Wed", total_ml: 0, total_liters: 0 },
    { label: "Thu", total_ml: 0, total_liters: 0 },
    { label: "Fri", total_ml: 0, total_liters: 0 },
    { label: "Sat", total_ml: 0, total_liters: 0 },
    { label: "Sun", total_ml: 0, total_liters: 0 },
  ],
  schedule: {
    timezone: "America/Vancouver",
    start_time: "09:00",
    end_time: "18:00",
    interval_min: 45,
    enabled: true,
    daily_goal_liters: 2.5,
  },
};

function formatTimeLabel(value: string | null): string {
  if (!value) {
    return "--:--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Hydration() {
  const [summary, setSummary] = useState<HydrationSummary>(defaultSummary);
  const [schedule, setSchedule] = useState<HydrationSummary["schedule"]>(defaultSummary.schedule);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      try {
        const response = await fetchHydrationSummary();
        if (!isMounted) {
          return;
        }

        setSummary(response);
        setSchedule(response.schedule);
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Failed to load hydration data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogIntake() {
    setIsLogging(true);

    try {
      const updatedSummary = await logWaterIntake(250);
      setSummary(updatedSummary);
      setSchedule(updatedSummary.schedule);
      toast.success("Logged 250ml of water.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to log water intake.");
    } finally {
      setIsLogging(false);
    }
  }

  async function handleSaveSchedule() {
    setIsSaving(true);

    try {
      const updatedSummary = await saveWaterSchedule(schedule);
      setSummary(updatedSummary);
      setSchedule(updatedSummary.schedule);
      toast.success("Hydration schedule saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save hydration schedule.");
    } finally {
      setIsSaving(false);
    }
  }

  const chartData = summary.weekly_history.map((entry) => ({
    name: entry.label,
    value: entry.total_liters,
  }));

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Droplets className="text-blue-500" size={32} />
            Hydration Station
          </h2>
          <p className="text-neutral-400 mt-2">Manage your water intake reminders.</p>
        </div>

        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-2 rounded-lg">
          <button
            onClick={() => void handleLogIntake()}
            disabled={isLogging}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLogging ? "Logging..." : "Log Intake (250ml)"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="md:col-span-2 p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Clock size={20} className="text-neutral-400" />
            Schedule Configuration
          </h3>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Interval (Minutes)</label>
                <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/50">
                  <input
                    type="number"
                    value={schedule.interval_min}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        interval_min: Number(event.target.value) || 0,
                      }))
                    }
                    className="bg-transparent w-full text-white placeholder-neutral-600 outline-none"
                  />
                  <span className="text-xs text-neutral-500 font-mono">MIN</span>
                </div>
                <p className="text-xs text-neutral-500">How often the pet reminds you.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Daily Goal (Liters)</label>
                <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/50">
                  <input
                    type="number"
                    value={schedule.daily_goal_liters}
                    step="0.1"
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        daily_goal_liters: Number(event.target.value) || 0,
                      }))
                    }
                    className="bg-transparent w-full text-white placeholder-neutral-600 outline-none"
                  />
                  <span className="text-xs text-neutral-500 font-mono">L</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Start Time</label>
                <input
                  type="time"
                  value={schedule.start_time}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      start_time: event.target.value,
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">End Time</label>
                <input
                  type="time"
                  value={schedule.end_time}
                  onChange={(event) =>
                    setSchedule((current) => ({
                      ...current,
                      end_time: event.target.value,
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => void handleSaveSchedule()}
                disabled={isSaving}
                className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Schedule"}
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-xl border border-neutral-800 bg-gradient-to-br from-blue-900/10 to-neutral-900/50 backdrop-blur"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Today's Progress</h3>

          <div className="relative flex items-center justify-center py-8">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle
                className="text-neutral-800"
                strokeWidth="12"
                stroke="currentColor"
                fill="transparent"
                r="70"
                cx="80"
                cy="80"
              />
              <circle
                className="text-blue-500 transition-all duration-1000 ease-out"
                strokeWidth="12"
                strokeDasharray={440}
                strokeDashoffset={440 - (440 * summary.today.progress_percent) / 100}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="70"
                cx="80"
                cy="80"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-4xl font-bold">{isLoading ? "--" : `${summary.today.progress_percent}%`}</span>
              <span className="text-sm text-neutral-400">
                {summary.today.total_intake_liters.toFixed(1)}L / {summary.today.goal_liters.toFixed(1)}L
              </span>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Last Drink</span>
              <span className="text-white font-mono">{formatTimeLabel(summary.today.last_intake_at)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Next Reminder</span>
              <span className="text-white font-mono">{formatTimeLabel(summary.today.next_reminder_at)}</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
      >
        <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <History size={20} className="text-neutral-400" />
          Weekly Overview
        </h3>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#525252"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626", borderRadius: "8px" }}
                itemStyle={{ color: "#fff" }}
                cursor={{ fill: "#262626", opacity: 0.4 }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
