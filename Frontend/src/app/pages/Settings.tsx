import { motion } from "motion/react";
import { 
  Key, 
  Wifi, 
  Database,
  Save,
  Check,
  Eye,
  EyeOff,
  Settings as SettingsIcon
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Settings() {
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  
  const toggleKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    toast.success("Configuration saved securely.");
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
        {/* API Keys */}
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

        {/* Database */}
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
                  type={showKeys["mongo"] ? "text" : "password"} 
                  defaultValue="mongodb+srv://user:password@cluster0.mongodb.net/petDB"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-green-500/50 transition-all font-mono text-sm"
                />
                 <button 
                    onClick={() => toggleKey("mongo")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1"
                  >
                    {showKeys["mongo"] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-green-400 mt-2">
              <Check size={14} />
              <span>Connection Verified</span>
            </div>
          </div>
        </motion.div>

        {/* Hardware */}
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
                defaultValue="192.168.1.45"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">WebSocket Port</label>
              <input 
                type="text" 
                defaultValue="81"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm"
              />
            </div>
          </div>
        </motion.div>

        <div className="flex justify-end pt-4 border-t border-neutral-800">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-3 bg-white text-black hover:bg-neutral-200 rounded-lg font-medium transition-colors shadow-lg shadow-white/10"
          >
            <Save size={18} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
