import { motion } from "motion/react";
import { 
  Droplets, 
  BrainCircuit, 
  Coffee, 
  Zap, 
  Activity, 
  Clock,
  Play
} from "lucide-react";

export function Dashboard() {
  const stats = [
    { label: "Focus Score", value: "87%", icon: BrainCircuit, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Stress Level", value: "Low", icon: Activity, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Water Intake", value: "1.2L", icon: Droplets, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Next Break", value: "14m", icon: Clock, color: "text-orange-400", bg: "bg-orange-400/10" },
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
            
            {/* Placeholder for camera feed */}
            <div className="text-center">
              <Zap className="mx-auto text-neutral-700 mb-2" size={48} />
              <p className="text-neutral-500 text-sm">Connecting to stream...</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors group text-left">
                <span className="text-sm font-medium text-neutral-200">Start Focus Session</span>
                <Play size={16} className="text-neutral-400 group-hover:text-white" />
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors group text-left">
                <span className="text-sm font-medium text-neutral-200">Manual Water Log</span>
                <Droplets size={16} className="text-blue-400 group-hover:text-blue-300" />
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors group text-left">
                <span className="text-sm font-medium text-neutral-200">Take a Break</span>
                <Coffee size={16} className="text-orange-400 group-hover:text-orange-300" />
              </button>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-neutral-800 bg-gradient-to-br from-purple-900/20 to-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-2">Pet Status</h3>
            <div className="flex items-center gap-4 mt-4">
              <div className="w-12 h-12 rounded-full bg-neutral-800 border-2 border-green-500 flex items-center justify-center">
                <span className="text-2xl">😺</span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">"Otto"</p>
                <p className="text-xs text-neutral-400">Feeling: Happy</p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 w-[85%]" />
            </div>
            <p className="text-xs text-right text-neutral-500 mt-1">Energy: 85%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
