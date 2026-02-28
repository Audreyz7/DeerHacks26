import { motion } from "motion/react";
import { 
  BrainCircuit, 
  Activity, 
  AlertTriangle,
  PlayCircle
} from "lucide-react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

const sessionData = [
  { time: "09:00", focus: 65, stress: 20 },
  { time: "09:15", focus: 78, stress: 25 },
  { time: "09:30", focus: 85, stress: 30 },
  { time: "09:45", focus: 92, stress: 35 },
  { time: "10:00", focus: 88, stress: 45 },
  { time: "10:15", focus: 70, stress: 60 },
  { time: "10:30", focus: 55, stress: 75 }, // High stress spike
  { time: "10:45", focus: 60, stress: 50 }, // Recovery after break
  { time: "11:00", focus: 75, stress: 40 },
];

export function Focus() {
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
          <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-purple-500/20">
            <PlayCircle size={18} />
            Start Session
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors border border-neutral-700">
            Export Report
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
              <AreaChart data={sessionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#525252" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#525252" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="focus" 
                  stroke="#a855f7" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorFocus)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="stress" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorStress)" 
                />
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
                <div className="text-5xl font-bold text-white mt-2 font-mono">72</div>
                <span className="text-xs text-green-400 mt-1 block">↑ 5% from last hour</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Stress Level</span>
                  <span className="text-orange-400 font-medium">Moderate</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 w-[45%]" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Fatigue</span>
                  <span className="text-green-400 font-medium">Low</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 w-[20%]" />
                </div>
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
              <h4 className="text-sm font-semibold text-red-200">Stress Spike Detected</h4>
              <p className="text-xs text-red-300/80 mt-1">
                At 10:30 AM, high stress was detected for 15 mins. A break was suggested.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
