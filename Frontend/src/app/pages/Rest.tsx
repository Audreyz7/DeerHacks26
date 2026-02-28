import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Coffee, Pause, Play, RotateCcw, Settings2, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  fetchPomodoroStatus,
  fetchStressPromptPreference,
  getStoredActivePomodoroSessionId,
  saveStressPromptPreference,
  setStoredActivePomodoroSessionId,
  startPomodoro,
  stopPomodoro,
  type PomodoroStatus,
} from "@/app/lib/api";

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function Rest() {
  const [pomodoroConfig, setPomodoroConfig] = useState({
    focus_minutes: 25,
    break_minutes: 5,
    cycles: 4,
  });
  const [smartBreaks, setSmartBreaks] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => getStoredActivePomodoroSessionId());
  const [status, setStatus] = useState<PomodoroStatus | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPreference() {
      try {
        const response = await fetchStressPromptPreference();
        if (isMounted) {
          setSmartBreaks(response.stress_prompt_enabled);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load smart break preference.");
        }
      }
    }

    void loadPreference();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setStatus(null);
      return;
    }

    const sessionId = activeSessionId;
    let cancelled = false;

    async function refreshStatus() {
      try {
        const nextStatus = await fetchPomodoroStatus(sessionId);
        if (cancelled) {
          return;
        }

        setStatus(nextStatus);
        if (nextStatus.phase === "completed") {
          setActiveSessionId(null);
          setStoredActivePomodoroSessionId(null);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Unable to refresh pomodoro status.");
        }
      }
    }

    void refreshStatus();
    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSessionId]);

  async function handleToggleSmartBreaks() {
    const next = !smartBreaks;
    setSmartBreaks(next);
    setIsSavingPreference(true);

    try {
      await saveStressPromptPreference(next);
    } catch (error) {
      setSmartBreaks(!next);
      toast.error(error instanceof Error ? error.message : "Unable to save smart break preference.");
    } finally {
      setIsSavingPreference(false);
    }
  }

  async function handleStart() {
    setIsStarting(true);

    try {
      const response = await startPomodoro(pomodoroConfig);
      setActiveSessionId(response.session.session_id);
      setStoredActivePomodoroSessionId(response.session.session_id);
      toast.success("Pomodoro started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start pomodoro.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleStop() {
    if (!activeSessionId) {
      return;
    }

    setIsStopping(true);

    try {
      await stopPomodoro(activeSessionId);
      setActiveSessionId(null);
      setStoredActivePomodoroSessionId(null);
      setStatus(null);
      toast.success("Pomodoro stopped.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop pomodoro.");
    } finally {
      setIsStopping(false);
    }
  }

  const isActive = Boolean(activeSessionId);
  const secondsRemaining = status?.seconds_remaining ?? pomodoroConfig.focus_minutes * 60;
  const cycleSeconds =
    (status?.phase === "break" ? pomodoroConfig.break_minutes : pomodoroConfig.focus_minutes) * 60;
  const progressRatio = Math.min(Math.max((cycleSeconds - secondsRemaining) / cycleSeconds, 0), 1);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Coffee className="text-orange-500" size={32} />
            Rest & Recovery
          </h2>
          <p className="text-neutral-400 mt-2">Manage your work/rest cycles and smart break detection.</p>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg">
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500 animate-pulse" : "bg-neutral-600"}`} />
          <span className="text-sm font-medium text-neutral-300">
            {isActive ? `Timer ${status?.phase === "break" ? "Break" : "Running"}` : "Timer Stopped"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 backdrop-blur flex flex-col items-center justify-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none" />

          <div className="relative mb-8">
            <svg className="w-64 h-64 transform -rotate-90">
              <circle className="text-neutral-800" strokeWidth="8" stroke="currentColor" fill="transparent" r="120" cx="128" cy="128" />
              <circle
                className="text-orange-500 transition-all duration-1000 ease-linear"
                strokeWidth="8"
                strokeDasharray={754}
                strokeDashoffset={754 - 754 * progressRatio}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="120"
                cx="128"
                cy="128"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-mono font-bold text-white tracking-tighter">
                {formatSeconds(secondsRemaining)}
              </span>
              <span className="text-sm text-neutral-400 mt-2 uppercase tracking-widest">
                {status?.phase === "break" ? "Break Time" : "Focus Time"}
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={isActive ? () => void handleStop() : () => void handleStart()}
              disabled={isStarting || isStopping}
              className={`p-4 rounded-full transition-all ${
                isActive
                  ? "bg-neutral-800 text-white hover:bg-neutral-700"
                  : "bg-orange-500 text-black hover:bg-orange-400 hover:scale-105 shadow-[0_0_20px_rgba(249,115,22,0.4)]"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
            </button>
            <button
              onClick={isActive ? () => void handleStop() : undefined}
              disabled={!isActive || isStopping}
              className="p-4 rounded-full bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={24} />
            </button>
          </div>
        </motion.div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
          >
            <div className="flex items-center gap-3 mb-6">
              <Settings2 size={20} className="text-neutral-400" />
              <h3 className="text-lg font-semibold text-white">Timer Configuration</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-neutral-300">Focus Duration</label>
                  <span className="text-sm font-mono text-orange-400">{pomodoroConfig.focus_minutes} min</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={pomodoroConfig.focus_minutes}
                  onChange={(event) =>
                    setPomodoroConfig((current) => ({ ...current, focus_minutes: Number(event.target.value) }))
                  }
                  className="w-full accent-orange-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-neutral-300">Short Break</label>
                  <span className="text-sm font-mono text-blue-400">{pomodoroConfig.break_minutes} min</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={pomodoroConfig.break_minutes}
                  onChange={(event) =>
                    setPomodoroConfig((current) => ({ ...current, break_minutes: Number(event.target.value) }))
                  }
                  className="w-full accent-blue-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-neutral-300">Cycles</label>
                  <span className="text-sm font-mono text-purple-400">{pomodoroConfig.cycles}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={pomodoroConfig.cycles}
                  onChange={(event) =>
                    setPomodoroConfig((current) => ({ ...current, cycles: Number(event.target.value) }))
                  }
                  className="w-full accent-purple-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-xl border border-neutral-800 bg-gradient-to-br from-indigo-900/20 to-neutral-900/50 backdrop-blur"
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Smart Breaks</h3>
                  <p className="text-sm text-neutral-400 mt-1 max-w-[200px]">
                    Automatically suggest breaks when high stress (10+ min) is detected via Presage.
                  </p>
                </div>
              </div>

              <button
                onClick={() => void handleToggleSmartBreaks()}
                disabled={isSavingPreference}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  smartBreaks ? "bg-indigo-600" : "bg-neutral-700"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${
                    smartBreaks ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
