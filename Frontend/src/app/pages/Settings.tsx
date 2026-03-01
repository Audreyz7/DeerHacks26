import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Key,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { fetchSettings, getActiveUserId, saveSettings, setActiveUserId, type SettingsResponse } from "@/app/lib/api";

const defaultSettings: SettingsResponse = {
  user_id: getActiveUserId(),
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
};

function createProvisioningUserId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `user-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `user-${Date.now().toString(36)}`;
}

export function Settings() {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<SettingsResponse>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const response = await fetchSettings();
        if (isMounted) {
          setActiveUserId(response.user_id);
          setSettings(response);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load settings.");
        }
      }
    }

    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const saved = await saveSettings({
        user_id: settings.user_id,
        api_keys: settings.api_keys,
        database: settings.database,
        hardware: settings.hardware,
      });
      setSettings(saved);
      setActiveUserId(saved.user_id);
      toast.success("Configuration saved securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateUserId = () => {
    setSettings((current) => ({
      ...current,
      user_id: createProvisioningUserId(),
    }));
  };

  const secretsHeader = `#pragma once

constexpr char WIFI_SSID[] = "${wifiSsid || "REPLACE_WITH_WIFI_SSID"}";
constexpr char WIFI_PASSWORD[] = "${wifiPassword || "REPLACE_WITH_WIFI_PASSWORD"}";

constexpr char API_BASE_URL[] = "https://deerhacks26.onrender.com";
constexpr char WATER_USER_ID[] = "${settings.user_id.trim() || "demo-user"}";
`;

  const handleCopySecrets = async () => {
    try {
      await navigator.clipboard.writeText(secretsHeader);
      toast.success("ESP config copied.");
    } catch {
      toast.error("Unable to copy config.");
    }
  };

  const handleDownloadSecrets = () => {
    const blob = new Blob([secretsHeader], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "secrets.h";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <SettingsIcon className="text-neutral-400" size={32} />
          System Settings
        </h2>
        <p className="text-neutral-400 mt-2">Manage API keys, database connections, and hardware configuration.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <div className="flex items-center gap-3 mb-6">
            <Key size={20} className="text-yellow-500" />
            <h3 className="text-lg font-semibold text-white">API Configuration</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: "Anthropic API Key (Claude)", id: "anthropic", placeholder: "sk-ant-..." },
              { label: "ElevenLabs API Key", id: "elevenlabs", placeholder: "xi-..." },
              { label: "Presage API Key", id: "presage", placeholder: "pr-..." },
              { label: "Gemini API Key", id: "gemini", placeholder: "AIza..." },
            ].map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">{field.label}</label>
                <div className="relative group">
                  <input
                    type={showKeys[field.id] ? "text" : "password"}
                    value={settings.api_keys[field.id as keyof SettingsResponse["api_keys"]]}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        api_keys: {
                          ...current.api_keys,
                          [field.id]: event.target.value,
                        },
                      }))
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-yellow-500/50 transition-all font-mono text-sm"
                    placeholder={field.placeholder}
                  />
                  <button
                    onClick={() => toggleKey(field.id)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                  >
                    {showKeys[field.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <div className="flex items-center gap-3 mb-6">
            <Database size={20} className="text-green-500" />
            <h3 className="text-lg font-semibold text-white">Database (MongoDB)</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Connection String</label>
              <div className="relative">
                <input
                  type={showKeys.mongo ? "text" : "password"}
                  value={settings.database.mongo_uri}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      database: {
                        ...current.database,
                        mongo_uri: event.target.value,
                      },
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-mono text-sm"
                />
                <button
                  onClick={() => toggleKey("mongo")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                >
                  {showKeys.mongo ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-green-400 mt-2">
              <Check size={14} />
              <span>{settings.database.mongo_uri ? "Connection string stored" : "Using backend default if empty"}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <div className="flex items-center gap-3 mb-6">
            <Wifi size={20} className="text-blue-500" />
            <h3 className="text-lg font-semibold text-white">Device Connection (ESP32)</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Device IP Address</label>
              <input
                type="text"
                value={settings.hardware.device_ip}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    hardware: {
                      ...current.hardware,
                      device_ip: event.target.value,
                    },
                  }))
                }
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">WebSocket Port</label>
              <input
                type="text"
                value={settings.hardware.websocket_port}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    hardware: {
                      ...current.hardware,
                      websocket_port: event.target.value,
                    },
                  }))
                }
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <div className="flex items-center gap-3 mb-6">
            <Wifi size={20} className="text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">ESP Provisioning</h3>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Active User ID</label>
                <input
                  type="text"
                  value={settings.user_id}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      user_id: event.target.value,
                    }))
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateUserId}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-200 hover:border-neutral-500"
              >
                <RefreshCw size={16} />
                Generate User ID
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Wi-Fi SSID</label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(event) => setWifiSsid(event.target.value)}
                  placeholder="Your Wi-Fi network name"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Wi-Fi Password</label>
                <input
                  type="password"
                  value={wifiPassword}
                  onChange={(event) => setWifiPassword(event.target.value)}
                  placeholder="Network password"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono text-sm"
                />
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-sm text-neutral-300">
                The website cannot automatically read the laptop&apos;s Wi-Fi name or password, but users can enter
                them here and generate the correct `secrets.h` for their own ESP.
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => void handleCopySecrets()}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
                >
                  <Copy size={16} />
                  Copy `secrets.h`
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSecrets}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
                >
                  <Download size={16} />
                  Download `secrets.h`
                </button>
              </div>

              <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-black/30 p-4 text-xs text-neutral-200">
                <code>{secretsHeader}</code>
              </pre>
            </div>
          </div>
        </motion.div>

        <div className="flex justify-end pt-4 border-t border-neutral-800">
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="flex items-center gap-2 px-8 py-3 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-colors shadow-lg shadow-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={18} />
            {isSaving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
