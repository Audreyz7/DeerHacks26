import { motion } from "motion/react";
import { 
  MessageSquareHeart, 
  User, 
  Mic, 
  Speaker,
  Volume2,
  Sparkles,
  Save,
  Send,
  Play
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function Persona() {
  const [name, setName] = useState("Otto");
  const [personality, setPersonality] = useState("Friendly, encouraging, and a bit witty. Always supportive of deep work.");
  const [voice, setVoice] = useState("Rachel");
  const [testMessage, setTestMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: "assistant", text: "Hello! I'm Otto. How can I help you focus today?" }
  ]);

  const handleSave = () => {
    toast.success("Persona updated successfully!");
  };

  const handleSendMessage = () => {
    if (!testMessage.trim()) return;
    
    setChatHistory([...chatHistory, { role: "user", text: testMessage }]);
    setTestMessage("");
    
    // Simulate typing delay
    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: "assistant", text: `I'm just a demo right now, but I love that you said "${testMessage}"! Let's get back to work soon.` }]);
    }, 1000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <MessageSquareHeart className="text-pink-500" size={32} />
            Persona Configuration
          </h2>
          <p className="text-neutral-400 mt-2">Customize your desktop pet's personality and voice.</p>
        </div>
        
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-pink-500/20"
        >
          <Save size={18} />
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Basic Info */}
          <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <User size={20} className="text-neutral-400" />
              Identity
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Pet Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
                  placeholder="e.g. Jarvis, Otto, Luna"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">System Prompt (Personality)</label>
                <textarea 
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  rows={4}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-pink-500/50 transition-all resize-none"
                  placeholder="Describe how your pet should behave..."
                />
                <p className="text-xs text-neutral-500">Using Gemini/Claude API for text generation.</p>
              </div>
            </div>
          </div>

          {/* Voice Settings */}
          <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Speaker size={20} className="text-neutral-400" />
              Voice (ElevenLabs)
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Select Voice Model</label>
                <div className="relative">
                  <select 
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white appearance-none outline-none focus:ring-2 focus:ring-pink-500/50 transition-all cursor-pointer"
                  >
                    <option value="Rachel">Rachel (American, Calm)</option>
                    <option value="Domi">Domi (American, Energetic)</option>
                    <option value="Bella">Bella (American, Soft)</option>
                    <option value="Antoni">Antoni (American, Deep)</option>
                    <option value="Elli">Elli (British, Clear)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                    ▼
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm transition-colors">
                  <Play size={14} fill="currentColor" />
                  Preview Voice
                </button>
                <div className="flex items-center gap-2 flex-1">
                  <Volume2 size={16} className="text-neutral-500" />
                  <input 
                    type="range" 
                    className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-pink-500" 
                    defaultValue={80}
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Chat Preview */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col h-[600px] p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-yellow-400" />
            Test Interaction
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
            {chatHistory.map((msg, i) => (
              <div 
                key={i} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-pink-600 text-white rounded-br-none' 
                      : 'bg-neutral-800 text-neutral-200 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="relative">
            <input 
              type="text" 
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-full px-5 py-3 pr-12 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
              placeholder={`Say something to ${name}...`}
            />
            <button 
              onClick={handleSendMessage}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-pink-600 text-white hover:bg-pink-700 transition-colors shadow-lg shadow-pink-500/20"
            >
              <Send size={16} />
            </button>
          </div>
          
          <div className="flex justify-center mt-4">
             <button className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors">
                <Mic size={14} />
                Hold to Speak (Simulated)
             </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
