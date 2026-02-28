export const DEFAULT_USER_ID = "demo-user";

const ACTIVE_FOCUS_SESSION_KEY = "deerhacks.activeFocusSessionId";
const ACTIVE_POMODORO_SESSION_KEY = "deerhacks.activePomodoroSessionId";
const LATEST_FOCUS_REPORT_KEY = "deerhacks.latestFocusReport";

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

export const ELEVENLABS_VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "American, calm" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi", description: "American, energetic" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella", description: "American, soft" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni", description: "American, deep" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", description: "British, clear" },
] as const;

async function apiRequest<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    body: body as BodyInit | null | undefined,
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export async function fetchHydrationSummary(userId = DEFAULT_USER_ID): Promise<HydrationSummary> {
  return apiRequest<HydrationSummary>(`/api/water/summary?user_id=${encodeURIComponent(userId)}`);
}

export async function saveWaterSchedule(
  schedule: HydrationSummary["schedule"],
  userId = DEFAULT_USER_ID,
): Promise<HydrationSummary> {
  await apiRequest("/api/water/schedule", {
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
  });

  return fetchHydrationSummary(userId);
}

export async function logWaterIntake(
  amountMl = 250,
  userId = DEFAULT_USER_ID,
): Promise<HydrationSummary> {
  const response = await apiRequest<{ summary: HydrationSummary }>("/api/water/intake", {
    method: "POST",
    body: {
      user_id: userId,
      amount_ml: amountMl,
    },
  });

  return response.summary;
}

export async function startFocusSession(
  allowPromptedBreaks: boolean,
  userId = DEFAULT_USER_ID,
): Promise<{ session: { session_id: string } }> {
  return apiRequest("/api/stress/session/start", {
    method: "POST",
    body: {
      user_id: userId,
      allow_prompted_breaks: allowPromptedBreaks,
      study_label: "Focus Session",
    },
  });
}

export async function recordFocusSample(sample: {
  session_id: string;
  focus_score: number;
  stress_score: number;
  captured_at: string;
}): Promise<void> {
  await apiRequest("/api/stress/sample", {
    method: "POST",
    body: sample,
  });
}

export async function endFocusSession(sessionId: string): Promise<FocusReportResponse> {
  return apiRequest<FocusReportResponse>("/api/stress/session/end", {
    method: "POST",
    body: {
      session_id: sessionId,
    },
  });
}

export async function fetchFocusReport(sessionId: string): Promise<FocusReportResponse> {
  return apiRequest<FocusReportResponse>(`/api/stress/report/${encodeURIComponent(sessionId)}`);
}

export async function fetchEncouragement(
  focusScore: number,
  stressScore: number,
  userId = DEFAULT_USER_ID,
): Promise<string> {
  const response = await apiRequest<{ message: string }>("/api/encouragement/message", {
    method: "POST",
    body: {
      user_id: userId,
      focus_score: focusScore,
      stress_score: stressScore,
    },
  });

  return response.message;
}

export async function fetchLatestFocusSnapshot(
  userId = DEFAULT_USER_ID,
): Promise<FocusSnapshotResponse> {
  return apiRequest<FocusSnapshotResponse>(
    `/api/stress/latest?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function startPomodoro(
  config: { focus_minutes: number; break_minutes: number; cycles: number },
  userId = DEFAULT_USER_ID,
): Promise<{ session: { session_id: string } }> {
  return apiRequest("/api/breaks/pomodoro/start", {
    method: "POST",
    body: {
      user_id: userId,
      ...config,
    },
  });
}

export async function fetchPomodoroStatus(sessionId: string): Promise<PomodoroStatus> {
  return apiRequest<PomodoroStatus>(
    `/api/breaks/pomodoro/status?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export async function stopPomodoro(sessionId: string): Promise<void> {
  await apiRequest("/api/breaks/pomodoro/stop", {
    method: "POST",
    body: {
      session_id: sessionId,
    },
  });
}

export async function fetchStressPromptPreference(
  userId = DEFAULT_USER_ID,
): Promise<{ stress_prompt_enabled: boolean }> {
  return apiRequest<{ stress_prompt_enabled: boolean }>(
    `/api/breaks/preferences/stress-prompts?user_id=${encodeURIComponent(userId)}`,
  );
}

export async function saveStressPromptPreference(
  enabled: boolean,
  userId = DEFAULT_USER_ID,
): Promise<void> {
  await apiRequest("/api/breaks/preferences/stress-prompts", {
    method: "POST",
    body: {
      user_id: userId,
      enabled,
    },
  });
}

export async function fetchPersona(userId = DEFAULT_USER_ID): Promise<PersonaResponse> {
  return apiRequest<PersonaResponse>(`/api/chat/persona?user_id=${encodeURIComponent(userId)}`);
}

export async function savePersona(payload: {
  pet_name: string;
  system_prompt: string;
  voice_id: string;
  gemini_model?: string;
  user_id?: string;
}): Promise<PersonaResponse> {
  const response = await apiRequest<{ persona: PersonaResponse }>("/api/chat/persona", {
    method: "POST",
    body: {
      user_id: payload.user_id ?? DEFAULT_USER_ID,
      pet_name: payload.pet_name,
      system_prompt: payload.system_prompt,
      voice_id: payload.voice_id,
      gemini_model: payload.gemini_model,
    },
  });

  return response.persona;
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
  return apiRequest("/api/chat/message", {
    method: "POST",
    body: {
      user_id: payload.user_id ?? DEFAULT_USER_ID,
      transcript: payload.transcript,
      conversation_id: payload.conversation_id,
      include_audio: payload.include_audio,
    },
  });
}

export async function previewVoice(payload: {
  text: string;
  voice_id: string;
  user_id?: string;
}): Promise<{ audio_base64: string }> {
  return apiRequest<{ audio_base64: string }>("/api/chat/preview", {
    method: "POST",
    body: {
      user_id: payload.user_id ?? DEFAULT_USER_ID,
      text: payload.text,
      voice_id: payload.voice_id,
    },
  });
}

export async function fetchChatStats(userId = DEFAULT_USER_ID): Promise<ChatStatsResponse> {
  return apiRequest<ChatStatsResponse>(`/api/chat/stats?user_id=${encodeURIComponent(userId)}`);
}

export async function fetchSettings(userId = DEFAULT_USER_ID): Promise<SettingsResponse> {
  return apiRequest<SettingsResponse>(`/api/settings?user_id=${encodeURIComponent(userId)}`);
}

export async function saveSettings(
  settings: Omit<SettingsResponse, "updated_at">,
): Promise<SettingsResponse> {
  const response = await apiRequest<{ settings: SettingsResponse }>("/api/settings", {
    method: "POST",
    body: settings,
  });

  return response.settings;
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
