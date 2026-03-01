export const DEFAULT_USER_ID = "demo-user";
const API_BASE_URL = "https://deerhacks26.onrender.com";

const ACTIVE_FOCUS_SESSION_KEY = "deerhacks.activeFocusSessionId";
const ACTIVE_POMODORO_SESSION_KEY = "deerhacks.activePomodoroSessionId";
const LATEST_FOCUS_REPORT_KEY = "deerhacks.latestFocusReport";
const HYDRATION_STATE_KEY = "deerhacks.hydrationState";
const LOCAL_FOCUS_SAMPLES_KEY = "deerhacks.focusSamples";
const LOCAL_POMODORO_STATE_KEY = "deerhacks.pomodoroState";
const LOCAL_PERSONA_KEY = "deerhacks.persona";
const LOCAL_CHAT_MESSAGES_KEY = "deerhacks.chatMessages";
const LOCAL_SETTINGS_KEY = "deerhacks.settings";
const LOCAL_STRESS_PROMPTS_KEY = "deerhacks.stressPromptPreference";
const LOCAL_VIDEO_SOURCE_KEY = "deerhacks.videoSource";
const LOCAL_VIDEO_SNAPSHOT_KEY = "deerhacks.videoSnapshot";
const API_TIMEOUT_MS = 1200;

type ApiInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

type StoredFocusReport = {
  sample_count: number;
  average_focus: number;
  average_stress: number;
  peak_stress: number;
  lowest_focus: number;
  graph_points: Array<{
    timestamp: string;
    focus_score: number;
    stress_score: number;
  }>;
};

export type HydrationSummary = {
  user_id: string;
  today: {
    total_intake_ml: number;
    total_intake_liters: number;
    goal_liters: number;
    progress_percent: number;
    last_intake_at: string | null;
    next_reminder_at: string | null;
  };
  weekly_history: Array<{
    label: string;
    total_ml: number;
    total_liters: number;
  }>;
  schedule: {
    timezone: string;
    start_time: string;
    end_time: string;
    interval_min: number;
    enabled: boolean;
    daily_goal_liters: number;
  };
};

export type FocusReportResponse = {
  ok?: boolean;
  session_id?: string;
  generated_at?: string;
  ended_at?: string;
  user_id?: string;
  report: StoredFocusReport;
};

export type PomodoroStatus = {
  session_id: string;
  phase: "focus" | "break" | "completed";
  cycle_index: number;
  seconds_remaining: number;
  server_time_utc: string;
  payload: {
    title: string;
    message: string;
    screen: string;
  };
};

export type PersonaResponse = {
  user_id: string;
  pet_name: string;
  system_prompt: string;
  gemini_model: string;
  voice_id: string;
};

export type SettingsResponse = {
  user_id: string;
  api_keys: {
    anthropic: string;
    elevenlabs: string;
    presage: string;
    gemini: string;
  };
  database: {
    mongo_uri: string;
  };
  hardware: {
    device_ip: string;
    websocket_port: string;
  };
  updated_at?: string;
};

export type FocusSnapshotResponse = {
  user_id: string;
  latest_sample: {
    sample_id: string;
    session_id: string;
    captured_at: string;
    focus_score: number;
    stress_score: number;
    confidence?: number;
  } | null;
  latest_report: FocusReportResponse | null;
};

export type ChatStatsResponse = {
  user_id: string;
  message_count: number;
  conversation_count: number;
  latest_message: {
    conversation_id: string;
    user_id: string;
    role: string;
    content: string;
    pet_name?: string;
  } | null;
};

export type VideoSourceResponse = {
  user_id: string;
  source_type: "webcam" | "esp32";
  esp32_stream_url: string;
  webcam_index: number;
  updated_at?: string;
};

export type VideoSnapshotResponse = {
  user_id: string;
  snapshot: {
    user_id: string;
    session_id?: string | null;
    source_type: "webcam" | "esp32";
    source_label: string;
    captured_at: string;
    focus_score: number;
    stress_score: number;
    confidence: number;
    signal_source?: string;
    raw_metrics?: Record<string, unknown>;
  } | null;
};

export const ELEVENLABS_VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "American, calm" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi", description: "American, energetic" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", description: "American, soft" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni", description: "American, deep" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", description: "British, clear" },
] as const;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getDefaultHydrationSummary(userId = DEFAULT_USER_ID): HydrationSummary {
  return {
    user_id: userId,
    today: {
      total_intake_ml: 0,
      total_intake_liters: 0,
      goal_liters: 2.5,
      progress_percent: 0,
      last_intake_at: null,
      next_reminder_at: null,
    },
    weekly_history: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => ({
      label,
      total_ml: 0,
      total_liters: 0,
    })),
    schedule: {
      timezone: "America/Vancouver",
      start_time: "09:00",
      end_time: "18:00",
      interval_min: 45,
      enabled: true,
      daily_goal_liters: 2.5,
    },
  };
}

function getHydrationFallback(userId = DEFAULT_USER_ID): HydrationSummary {
  const state = readLocalStorage<{
    schedule: HydrationSummary["schedule"];
    events: Array<{ amount_ml: number; consumed_at: string }>;
  }>(HYDRATION_STATE_KEY, {
    schedule: getDefaultHydrationSummary(userId).schedule,
    events: [],
  });
  const now = new Date();
  const todayKey = now.toDateString();
  const todayEvents = state.events.filter((event) => new Date(event.consumed_at).toDateString() === todayKey);
  const totalIntakeMl = todayEvents.reduce((sum, event) => sum + event.amount_ml, 0);
  const lastIntakeAt = todayEvents.at(-1)?.consumed_at ?? null;
  const nextReminderAt = lastIntakeAt
    ? new Date(new Date(lastIntakeAt).getTime() + state.schedule.interval_min * 60000).toISOString()
    : null;

  const weeklyHistory = Array.from({ length: 7 }, (_, index) => {
    const target = new Date(now);
    target.setDate(now.getDate() - (6 - index));
    const key = target.toDateString();
    const events = state.events.filter((event) => new Date(event.consumed_at).toDateString() === key);
    const totalMl = events.reduce((sum, event) => sum + event.amount_ml, 0);
    return {
      label: target.toLocaleDateString([], { weekday: "short" }),
      total_ml: totalMl,
      total_liters: Number((totalMl / 1000).toFixed(2)),
    };
  });

  return {
    user_id: userId,
    today: {
      total_intake_ml: totalIntakeMl,
      total_intake_liters: Number((totalIntakeMl / 1000).toFixed(2)),
      goal_liters: state.schedule.daily_goal_liters,
      progress_percent: Math.min(
        Math.round((totalIntakeMl / Math.max(state.schedule.daily_goal_liters * 1000, 1)) * 100),
        100,
      ),
      last_intake_at: lastIntakeAt,
      next_reminder_at: nextReminderAt,
    },
    weekly_history: weeklyHistory,
    schedule: state.schedule,
  };
}

function saveHydrationFallback(
  updater: (current: {
    schedule: HydrationSummary["schedule"];
    events: Array<{ amount_ml: number; consumed_at: string }>;
  }) => {
    schedule: HydrationSummary["schedule"];
    events: Array<{ amount_ml: number; consumed_at: string }>;
  },
): void {
  const current = readLocalStorage(HYDRATION_STATE_KEY, {
    schedule: getDefaultHydrationSummary().schedule,
    events: [] as Array<{ amount_ml: number; consumed_at: string }>,
  });
  writeLocalStorage(HYDRATION_STATE_KEY, updater(current));
}

function getLocalPomodoroStatus(sessionId: string): PomodoroStatus | null {
  const state = readLocalStorage<{
    session_id: string;
    focus_minutes: number;
    break_minutes: number;
    cycles: number;
    started_at: string;
  } | null>(LOCAL_POMODORO_STATE_KEY, null);
  if (!state || state.session_id !== sessionId) {
    return null;
  }

  const startedAt = new Date(state.started_at).getTime();
  const elapsedSeconds = Math.max(Math.floor((Date.now() - startedAt) / 1000), 0);
  const focusSeconds = state.focus_minutes * 60;
  const breakSeconds = state.break_minutes * 60;
  const cycleSeconds = focusSeconds + breakSeconds;
  const totalSeconds = cycleSeconds * state.cycles - breakSeconds;

  if (elapsedSeconds >= totalSeconds) {
    return {
      session_id: sessionId,
      phase: "completed",
      cycle_index: state.cycles,
      seconds_remaining: 0,
      server_time_utc: new Date().toISOString(),
      payload: { title: "Pomodoro", message: "Session complete", screen: "POMODORO_TIMER" },
    };
  }

  const inCycle = elapsedSeconds % cycleSeconds;
  const phase = inCycle < focusSeconds ? "focus" : "break";
  const seconds_remaining = phase === "focus" ? focusSeconds - inCycle : cycleSeconds - inCycle;
  return {
    session_id: sessionId,
    phase,
    cycle_index: Math.min(Math.floor(elapsedSeconds / cycleSeconds) + 1, state.cycles),
    seconds_remaining,
    server_time_utc: new Date().toISOString(),
    payload: {
      title: "Pomodoro",
      message: phase === "focus" ? "Focus now" : "Take a break",
      screen: "POMODORO_TIMER",
    },
  };
}

function composeFallbackEncouragement(focusScore: number, stressScore: number): string {
  if (stressScore >= 0.8) return "Stress is high. Step back for two minutes, then restart smaller.";
  if (focusScore >= 0.75 && stressScore <= 0.4) return "You're in a good flow. Keep the momentum.";
  if (focusScore <= 0.4) return "Start tiny. One clear task is enough.";
  return "Steady pace. Keep going.";
}

function getDefaultVideoSource(userId = DEFAULT_USER_ID): VideoSourceResponse {
  return {
    user_id: userId,
    source_type: "webcam",
    esp32_stream_url: "",
    webcam_index: 0,
  };
}

async function apiRequest<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const requestUrl = path.startsWith("/api/") ? `${API_BASE_URL}${path}` : path;

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  try {
    const response = await fetch(requestUrl, {
      ...init,
      headers,
      body: body as BodyInit | null | undefined,
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchHydrationSummary(userId = DEFAULT_USER_ID): Promise<HydrationSummary> {
  const localState = window.localStorage.getItem(HYDRATION_STATE_KEY);
  if (localState) {
    return getHydrationFallback(userId);
  }
  try {
    return await apiRequest<HydrationSummary>(`/api/water/summary?user_id=${encodeURIComponent(userId)}`);
  } catch {
    return getHydrationFallback(userId);
  }
}

export async function saveWaterSchedule(
  schedule: HydrationSummary["schedule"],
  userId = DEFAULT_USER_ID,
): Promise<HydrationSummary> {
  saveHydrationFallback((current) => ({ ...current, schedule }));
  void apiRequest("/api/water/schedule", {
    method: "POST",
    body: {
      user_id: userId,
      timezone: schedule.timezone,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      interval_min: schedule.interval_min,
      enabled: schedule.enabled,
      daily_goal_liters: schedule.daily_goal_liters,
    },
  }).catch(() => {});
  return getHydrationFallback(userId);
}

export async function logWaterIntake(
  amountMl = 250,
  userId = DEFAULT_USER_ID,
): Promise<HydrationSummary> {
  saveHydrationFallback((current) => ({
    ...current,
    events: [...current.events, { amount_ml: amountMl, consumed_at: new Date().toISOString() }],
  }));
  void apiRequest<{ summary: HydrationSummary }>("/api/water/intake", {
    method: "POST",
    body: {
      user_id: userId,
      amount_ml: amountMl,
    },
  }).catch(() => {});
  return getHydrationFallback(userId);
}

export async function startFocusSession(
  allowPromptedBreaks: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{ session: { session_id: string } }> {
  try {
    return await apiRequest("/api/stress/session/start", {
      method: "POST",
      body: {
        user_id: userId,
        allow_prompted_breaks: allowPromptedBreaks,
        study_label: "Focus Session",
      },
    });
  } catch {
    const sessionId = createId();
    return { session: { session_id: sessionId } };
  }
}

export async function recordFocusSample(sample: {
  session_id: string;
  focus_score: number;
  stress_score: number;
  captured_at: string;
}): Promise<void> {
  try {
    await apiRequest("/api/stress/sample", {
      method: "POST",
      body: sample,
    });
  } catch {
    const samples = readLocalStorage<
      Array<{ session_id: string; focus_score: number; stress_score: number; captured_at: string }>
    >(LOCAL_FOCUS_SAMPLES_KEY, []);
    samples.push(sample);
    writeLocalStorage(LOCAL_FOCUS_SAMPLES_KEY, samples);
  }
}

export async function endFocusSession(sessionId: string): Promise<FocusReportResponse> {
  try {
    return await apiRequest<FocusReportResponse>("/api/stress/session/end", {
      method: "POST",
      body: {
        session_id: sessionId,
      },
    });
  } catch {
    const samples = readLocalStorage<
      Array<{ session_id: string; focus_score: number; stress_score: number; captured_at: string }>
    >(LOCAL_FOCUS_SAMPLES_KEY, []).filter((sample) => sample.session_id === sessionId);
    const graph_points = samples.map((sample) => ({
      timestamp: sample.captured_at,
      focus_score: sample.focus_score,
      stress_score: sample.stress_score,
    }));
    const averageFocus =
      graph_points.length > 0
        ? graph_points.reduce((sum, point) => sum + point.focus_score, 0) / graph_points.length
        : 0;
    const averageStress =
      graph_points.length > 0
        ? graph_points.reduce((sum, point) => sum + point.stress_score, 0) / graph_points.length
        : 0;
    const report = {
      sample_count: graph_points.length,
      average_focus: Number(averageFocus.toFixed(3)),
      average_stress: Number(averageStress.toFixed(3)),
      peak_stress: Number(Math.max(...graph_points.map((point) => point.stress_score), 0).toFixed(3)),
      lowest_focus: Number(
        (graph_points.length ? Math.min(...graph_points.map((point) => point.focus_score)) : 0).toFixed(3),
      ),
      graph_points,
    };
    setStoredFocusReport(report);
    return {
      ok: true,
      session_id: sessionId,
      ended_at: new Date().toISOString(),
      report,
    };
  }
}

export async function fetchFocusReport(sessionId: string): Promise<FocusReportResponse> {
  return apiRequest<FocusReportResponse>(`/api/stress/report/${encodeURIComponent(sessionId)}`);
}

export async function fetchEncouragement(
  focusScore: number,
  stressScore: number,
  userId = DEFAULT_USER_ID,
): Promise<string> {
  try {
    const response = await apiRequest<{ message: string }>("/api/encouragement/message", {
      method: "POST",
      body: {
        user_id: userId,
        focus_score: focusScore,
        stress_score: stressScore,
      },
    });

    return response.message;
  } catch {
    return composeFallbackEncouragement(focusScore, stressScore);
  }
}

export async function fetchLatestFocusSnapshot(
  userId = DEFAULT_USER_ID,
): Promise<FocusSnapshotResponse> {
  try {
    return await apiRequest<FocusSnapshotResponse>(
      `/api/stress/latest?user_id=${encodeURIComponent(userId)}`,
    );
  } catch {
    const samples = readLocalStorage<
      Array<{ session_id: string; focus_score: number; stress_score: number; captured_at: string }>
    >(LOCAL_FOCUS_SAMPLES_KEY, []);
    const latestSample = samples.at(-1);
    const report = getStoredFocusReport();
    return {
      user_id: userId,
      latest_sample: latestSample
        ? {
            sample_id: createId(),
            session_id: latestSample.session_id,
            captured_at: latestSample.captured_at,
            focus_score: latestSample.focus_score,
            stress_score: latestSample.stress_score,
          }
        : null,
      latest_report: report ? { report } : null,
    };
  }
}

export async function startPomodoro(
  config: { focus_minutes: number; break_minutes: number; cycles: number },
  userId = DEFAULT_USER_ID,
): Promise<{ session: { session_id: string } }> {
  const localSessionId = createId();
  writeLocalStorage(LOCAL_POMODORO_STATE_KEY, {
    session_id: localSessionId,
    user_id: userId,
    ...config,
    started_at: new Date().toISOString(),
  });
  void apiRequest("/api/breaks/pomodoro/start", {
    method: "POST",
    body: {
      user_id: userId,
      ...config,
    },
  }).catch(() => {});
  return { session: { session_id: localSessionId } };
}

export async function fetchPomodoroStatus(sessionId: string): Promise<PomodoroStatus> {
  const localStatus = getLocalPomodoroStatus(sessionId);
  if (localStatus) {
    return localStatus;
  }
  try {
    return await apiRequest<PomodoroStatus>(
      `/api/breaks/pomodoro/status?session_id=${encodeURIComponent(sessionId)}`,
    );
  } catch {
    const fallbackStatus = getLocalPomodoroStatus(sessionId);
    if (fallbackStatus) {
      return fallbackStatus;
    }
    throw new Error("Pomodoro session not found.");
  }
}

export async function stopPomodoro(sessionId: string): Promise<void> {
  const state = readLocalStorage<{ session_id: string } | null>(LOCAL_POMODORO_STATE_KEY, null);
  if (state?.session_id === sessionId) {
    window.localStorage.removeItem(LOCAL_POMODORO_STATE_KEY);
  }
  try {
    await apiRequest("/api/breaks/pomodoro/stop", {
      method: "POST",
      body: {
        session_id: sessionId,
      },
    });
  } catch {}
}

export async function fetchStressPromptPreference(
  userId = DEFAULT_USER_ID,
): Promise<{ stress_prompt_enabled: boolean }> {
  try {
    return await apiRequest<{ stress_prompt_enabled: boolean }>(
      `/api/breaks/preferences/stress-prompts?user_id=${encodeURIComponent(userId)}`,
    );
  } catch {
    return { stress_prompt_enabled: readLocalStorage<boolean>(LOCAL_STRESS_PROMPTS_KEY, true) };
  }
}

export async function saveStressPromptPreference(
  enabled: boolean,
  userId = DEFAULT_USER_ID,
): Promise<void> {
  writeLocalStorage(LOCAL_STRESS_PROMPTS_KEY, enabled);
  try {
    await apiRequest("/api/breaks/preferences/stress-prompts", {
      method: "POST",
      body: {
        user_id: userId,
        enabled,
      },
    });
  } catch {}
}

export async function fetchPersona(userId = DEFAULT_USER_ID): Promise<PersonaResponse> {
  try {
    return await apiRequest<PersonaResponse>(`/api/chat/persona?user_id=${encodeURIComponent(userId)}`);
  } catch {
    return readLocalStorage<PersonaResponse>(LOCAL_PERSONA_KEY, {
      user_id: userId,
      pet_name: "Buddy",
      system_prompt: "You are a friendly desktop pet that gives concise, supportive replies.",
      gemini_model: "gemini-3-pro-preview",
      voice_id: ELEVENLABS_VOICE_OPTIONS[0].id,
    });
  }
}

export async function savePersona(payload: {
  pet_name: string;
  system_prompt: string;
  voice_id: string;
  gemini_model?: string;
  user_id?: string;
}): Promise<PersonaResponse> {
  const persona = {
    user_id: payload.user_id ?? DEFAULT_USER_ID,
    pet_name: payload.pet_name,
    system_prompt: payload.system_prompt,
    voice_id: payload.voice_id,
    gemini_model: payload.gemini_model ?? "gemini-3-pro-preview",
  };
  writeLocalStorage(LOCAL_PERSONA_KEY, persona);
  void apiRequest<{ persona: PersonaResponse }>("/api/chat/persona", {
    method: "POST",
    body: {
      user_id: persona.user_id,
      pet_name: persona.pet_name,
      system_prompt: persona.system_prompt,
      voice_id: persona.voice_id,
      gemini_model: persona.gemini_model,
    },
  }).catch(() => {});
  return persona;
}

export async function sendChatMessage(payload: {
  transcript: string;
  conversation_id?: string;
  include_audio?: boolean;
  user_id?: string;
}): Promise<{
  conversation_id: string;
  pet_name: string;
  reply_text: string;
  reply_audio_base64?: string;
}> {
  try {
    return await apiRequest("/api/chat/message", {
      method: "POST",
      body: {
        user_id: payload.user_id ?? DEFAULT_USER_ID,
        transcript: payload.transcript,
        conversation_id: payload.conversation_id,
        include_audio: payload.include_audio,
      },
    });
  } catch {
    const persona = await fetchPersona(payload.user_id ?? DEFAULT_USER_ID);
    const conversationId = payload.conversation_id ?? createId();
    const replyText = `${persona.pet_name}: ${composeFallbackEncouragement(
      payload.transcript.toLowerCase().includes("focus") ? 0.8 : 0.5,
      payload.transcript.toLowerCase().includes("stress") ? 0.8 : 0.3,
    )}`;
    const messages = readLocalStorage<
      Array<{ conversation_id: string; user_id: string; role: string; content: string; pet_name?: string }>
    >(LOCAL_CHAT_MESSAGES_KEY, []);
    messages.push(
      {
        conversation_id: conversationId,
        user_id: payload.user_id ?? DEFAULT_USER_ID,
        role: "user",
        content: payload.transcript,
      },
      {
        conversation_id: conversationId,
        user_id: payload.user_id ?? DEFAULT_USER_ID,
        role: "assistant",
        content: replyText,
        pet_name: persona.pet_name,
      },
    );
    writeLocalStorage(LOCAL_CHAT_MESSAGES_KEY, messages);
    return {
      conversation_id: conversationId,
      pet_name: persona.pet_name,
      reply_text: replyText,
    };
  }
}

export async function previewVoice(payload: {
  text: string;
  voice_id: string;
  user_id?: string;
}): Promise<{ audio_base64: string }> {
  try {
    return await apiRequest<{ audio_base64: string }>("/api/chat/preview", {
      method: "POST",
      body: {
        user_id: payload.user_id ?? DEFAULT_USER_ID,
        text: payload.text,
        voice_id: payload.voice_id,
      },
    });
  } catch {
    return { audio_base64: "" };
  }
}

export async function fetchChatStats(userId = DEFAULT_USER_ID): Promise<ChatStatsResponse> {
  try {
    return await apiRequest<ChatStatsResponse>(`/api/chat/stats?user_id=${encodeURIComponent(userId)}`);
  } catch {
    const messages = readLocalStorage<
      Array<{ conversation_id: string; user_id: string; role: string; content: string; pet_name?: string }>
    >(LOCAL_CHAT_MESSAGES_KEY, []).filter((message) => message.user_id === userId);
    const conversationIds = Array.from(new Set(messages.map((message) => message.conversation_id)));
    return {
      user_id: userId,
      message_count: messages.length,
      conversation_count: conversationIds.length,
      latest_message: messages.at(-1) ?? null,
    };
  }
}

export async function fetchSettings(userId = DEFAULT_USER_ID): Promise<SettingsResponse> {
  try {
    return await apiRequest<SettingsResponse>(`/api/settings?user_id=${encodeURIComponent(userId)}`);
  } catch {
    return readLocalStorage<SettingsResponse>(LOCAL_SETTINGS_KEY, {
      user_id: userId,
      api_keys: {
        anthropic: "",
        elevenlabs: "",
        presage: "",
        gemini: "",
      },
      database: {
        mongo_uri: "",
      },
      hardware: {
        device_ip: "",
        websocket_port: "81",
      },
    });
  }
}

export async function saveSettings(
  settings: Omit<SettingsResponse, "updated_at">,
): Promise<SettingsResponse> {
  const localSettings = { ...settings, updated_at: new Date().toISOString() };
  writeLocalStorage(LOCAL_SETTINGS_KEY, localSettings);
  void apiRequest<{ settings: SettingsResponse }>("/api/settings", {
    method: "POST",
    body: settings,
  }).catch(() => {});
  return localSettings;
}

export async function fetchVideoSource(userId = DEFAULT_USER_ID): Promise<VideoSourceResponse> {
  try {
    const response = await apiRequest<VideoSourceResponse>(
      `/api/video/source?user_id=${encodeURIComponent(userId)}`,
    );
    writeLocalStorage(LOCAL_VIDEO_SOURCE_KEY, response);
    return response;
  } catch {
    return readLocalStorage<VideoSourceResponse>(LOCAL_VIDEO_SOURCE_KEY, getDefaultVideoSource(userId));
  }
}

export async function saveVideoSource(
  source: Omit<VideoSourceResponse, "updated_at">,
): Promise<VideoSourceResponse> {
  const localSource: VideoSourceResponse = {
    ...source,
    updated_at: new Date().toISOString(),
  };
  writeLocalStorage(LOCAL_VIDEO_SOURCE_KEY, localSource);
  void apiRequest<{ source: VideoSourceResponse }>("/api/video/source", {
    method: "POST",
    body: source,
  }).catch(() => {});
  return localSource;
}

export async function fetchLatestVideoSnapshot(
  userId = DEFAULT_USER_ID,
): Promise<VideoSnapshotResponse> {
  try {
    const response = await apiRequest<VideoSnapshotResponse>(
      `/api/video/latest?user_id=${encodeURIComponent(userId)}`,
    );
    writeLocalStorage(LOCAL_VIDEO_SNAPSHOT_KEY, response);
    return response;
  } catch {
    return readLocalStorage<VideoSnapshotResponse>(LOCAL_VIDEO_SNAPSHOT_KEY, {
      user_id: userId,
      snapshot: null,
    });
  }
}

export function buildVideoStreamUrl(
  source: Pick<VideoSourceResponse, "source_type" | "esp32_stream_url">,
  options?: { userId?: string; sessionId?: string | null },
): string {
  const params = new URLSearchParams({
    user_id: options?.userId ?? DEFAULT_USER_ID,
    source_type: source.source_type,
  });
  if (source.source_type === "esp32" && source.esp32_stream_url) {
    params.set("stream_url", source.esp32_stream_url);
  }
  if (options?.sessionId) {
    params.set("session_id", options.sessionId);
  }
  return `/api/video/stream?${params.toString()}`;
}

export function getStoredActiveFocusSessionId(): string | null {
  return window.localStorage.getItem(ACTIVE_FOCUS_SESSION_KEY);
}

export function setStoredActiveFocusSessionId(sessionId: string | null): void {
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_FOCUS_SESSION_KEY, sessionId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_FOCUS_SESSION_KEY);
}

export function getStoredActivePomodoroSessionId(): string | null {
  return window.localStorage.getItem(ACTIVE_POMODORO_SESSION_KEY);
}

export function setStoredActivePomodoroSessionId(sessionId: string | null): void {
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_POMODORO_SESSION_KEY, sessionId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_POMODORO_SESSION_KEY);
}

export function getStoredFocusReport(): StoredFocusReport | null {
  const raw = window.localStorage.getItem(LATEST_FOCUS_REPORT_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredFocusReport;
  } catch {
    window.localStorage.removeItem(LATEST_FOCUS_REPORT_KEY);
    return null;
  }
}

export function setStoredFocusReport(report: StoredFocusReport | null): void {
  if (report) {
    window.localStorage.setItem(LATEST_FOCUS_REPORT_KEY, JSON.stringify(report));
    return;
  }

  window.localStorage.removeItem(LATEST_FOCUS_REPORT_KEY);
}
