import { motion } from "motion/react";
import {
  MessageSquareHeart,
  Mic,
  Play,
  Save,
  Send,
  Speaker,
  Sparkles,
  User,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ELEVENLABS_VOICE_OPTIONS,
  fetchPersona,
  previewVoice,
  savePersona,
  sendChatMessage,
} from "@/app/lib/api";

export function Persona() {
  const [name, setName] = useState("Otto");
  const [personality, setPersonality] = useState(
    "Friendly, encouraging, and a bit witty. Always supportive of deep work.",
  );
  const [voice, setVoice] = useState<string>(ELEVENLABS_VOICE_OPTIONS[0].id);
  const [testMessage, setTestMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: "assistant", text: "Hello! I'm Otto. How can I help you focus today?" },
  ]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPersona() {
      try {
        const persona = await fetchPersona();
        if (!isMounted) {
          return;
        }

        setName(persona.pet_name);
        setPersonality(persona.system_prompt);
        setVoice(persona.voice_id || ELEVENLABS_VOICE_OPTIONS[0].id);
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load persona.");
        }
      }
    }

    void loadPersona();

    return () => {
      isMounted = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await savePersona({
        pet_name: name,
        system_prompt: personality,
        voice_id: voice,
      });
      toast.success("Persona updated successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save persona.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!testMessage.trim() || isSending) {
      return;
    }

    const outgoingMessage = testMessage.trim();
    setChatHistory((current) => [...current, { role: "user", text: outgoingMessage }]);
    setTestMessage("");
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        transcript: outgoingMessage,
        conversation_id: conversationId,
      });
      setConversationId(response.conversation_id);
      setChatHistory((current) => [...current, { role: "assistant", text: response.reply_text }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handlePreviewVoice = async () => {
    setIsPreviewing(true);

    try {
      const response = await previewVoice({
        text: `Hi, I'm ${name}. Let's keep your focus steady today.`,
        voice_id: voice,
      });
      const audio = new Audio(`data:audio/mpeg;base64,${response.audio_base64}`);
      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to preview voice.");
    } finally {
      setIsPreviewing(false);
    }
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
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors font-medium shadow-lg shadow-pink-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={18} />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
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
                    {ELEVENLABS_VOICE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} ({option.description})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                    v
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => void handlePreviewVoice()}
                  disabled={isPreviewing}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={14} fill="currentColor" />
                  {isPreviewing ? "Loading..." : "Preview Voice"}
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
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-pink-600 text-white rounded-br-none"
                      : "bg-neutral-800 text-neutral-200 rounded-bl-none"
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
              onKeyDown={(e) => e.key === "Enter" && void handleSendMessage()}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-full px-5 py-3 pr-12 text-white placeholder-neutral-600 outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
              placeholder={`Say something to ${name}...`}
            />
            <button
              onClick={() => void handleSendMessage()}
              disabled={isSending}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-pink-600 text-white hover:bg-pink-700 transition-colors shadow-lg shadow-pink-500/20 disabled:cursor-not-allowed disabled:opacity-60"
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
