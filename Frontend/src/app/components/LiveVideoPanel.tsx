import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LoaderCircle, MonitorSmartphone, Save, Zap } from "lucide-react";
import { toast } from "sonner";

import {
  buildVideoStreamUrl,
  fetchLatestVideoSnapshot,
  fetchVideoSource,
  getStoredActiveFocusSessionId,
  saveVideoSource,
  uploadBrowserVideoFrame,
  type VideoSnapshotResponse,
  type VideoSourceResponse,
} from "@/app/lib/api";

function formatPercent(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function LiveVideoPanel() {
  const [source, setSource] = useState<VideoSourceResponse | null>(null);
  const [esp32UrlInput, setEsp32UrlInput] = useState("");
  const [snapshot, setSnapshot] = useState<VideoSnapshotResponse["snapshot"]>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [streamErrored, setStreamErrored] = useState(false);
  const [localWebcamStream, setLocalWebcamStream] = useState<MediaStream | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isUploadingFrameRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadVideoState() {
      try {
        const [savedSource, latestSnapshot] = await Promise.all([
          fetchVideoSource(),
          fetchLatestVideoSnapshot(),
        ]);
        if (!isMounted) {
          return;
        }
        setSource(savedSource);
        setEsp32UrlInput(savedSource.esp32_stream_url);
        setSnapshot(latestSnapshot.snapshot);
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof Error ? error.message : "Unable to load video settings.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadVideoState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchLatestVideoSnapshot()
        .then((response) => {
          setSnapshot(response.snapshot);
        })
        .catch(() => {});
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const activeSource = source ?? {
    user_id: "demo-user",
    source_type: "webcam" as const,
    esp32_stream_url: "",
    webcam_index: 0,
  };

  const streamUrl = useMemo(
    () =>
      buildVideoStreamUrl({
        source_type: activeSource.source_type,
        esp32_stream_url: activeSource.esp32_stream_url,
      }),
    [activeSource.esp32_stream_url, activeSource.source_type],
  );

  useEffect(() => {
    if (activeSource.source_type !== "webcam") {
      setCameraPermissionError(null);
      setLocalWebcamStream((currentStream) => {
        currentStream?.getTracks().forEach((track) => track.stop());
        return null;
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermissionError("This browser does not support camera access.");
      return;
    }

    let isActive = true;

    async function enableLocalWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setCameraPermissionError(null);
        setLocalWebcamStream((currentStream) => {
          currentStream?.getTracks().forEach((track) => track.stop());
          return stream;
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLocalWebcamStream((currentStream) => {
          currentStream?.getTracks().forEach((track) => track.stop());
          return null;
        });
        setCameraPermissionError(
          error instanceof Error ? error.message : "Camera permission was denied.",
        );
      }
    }

    void enableLocalWebcam();

    return () => {
      isActive = false;
    };
  }, [activeSource.source_type]);

  useEffect(() => {
    if (!localVideoRef.current) {
      return;
    }

    if (localWebcamStream) {
      localVideoRef.current.srcObject = localWebcamStream;
      return;
    }

    localVideoRef.current.srcObject = null;
  }, [localWebcamStream]);

  useEffect(() => {
    if (activeSource.source_type !== "webcam" || !localWebcamStream) {
      return;
    }

    let isActive = true;

    async function uploadCurrentFrame() {
      if (!isActive || isUploadingFrameRef.current || !localVideoRef.current) {
        return;
      }

      const video = localVideoRef.current;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      const canvas = captureCanvasRef.current ?? document.createElement("canvas");
      captureCanvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, width, height);

      isUploadingFrameRef.current = true;
      try {
        const response = await uploadBrowserVideoFrame(canvas.toDataURL("image/jpeg", 0.7), {
          userId: activeSource.user_id,
          sessionId: getStoredActiveFocusSessionId(),
        });
        if (isActive) {
          setSnapshot(response.snapshot);
        }
      } catch {
        // Ignore transient upload failures; the next polling cycle will retry.
      } finally {
        isUploadingFrameRef.current = false;
      }
    }

    void uploadCurrentFrame();
    const intervalId = window.setInterval(() => {
      void uploadCurrentFrame();
    }, 2500);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      isUploadingFrameRef.current = false;
    };
  }, [activeSource.source_type, activeSource.user_id, localWebcamStream]);

  async function persistSource(nextSource: VideoSourceResponse) {
    setIsSaving(true);
    setStreamErrored(false);
    setSource(nextSource);
    try {
      const saved = await saveVideoSource({
        user_id: nextSource.user_id,
        source_type: nextSource.source_type,
        esp32_stream_url: nextSource.esp32_stream_url,
        webcam_index: nextSource.webcam_index,
      });
      setSource(saved);
      setEsp32UrlInput(saved.esp32_stream_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save video source.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSourceChange(sourceType: "webcam" | "esp32") {
    await persistSource({
      ...activeSource,
      source_type: sourceType,
      esp32_stream_url: sourceType === "esp32" ? esp32UrlInput : activeSource.esp32_stream_url,
    });
  }

  async function handleSaveEsp32Url() {
    await persistSource({
      ...activeSource,
      source_type: "esp32",
      esp32_stream_url: esp32UrlInput.trim(),
    });
  }

  return (
    <div className="lg:col-span-2 p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 backdrop-blur">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Live Feed</h3>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${streamErrored ? "bg-amber-500" : "bg-red-500 animate-pulse"}`}
            />
            <span className="text-xs text-neutral-400 font-mono">
              {streamErrored ? "WAIT" : "REC"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSourceChange("webcam")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              activeSource.source_type === "webcam"
                ? "border-green-500 bg-green-500/10 text-white"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            <MonitorSmartphone size={16} />
            Laptop Webcam
          </button>
          <button
            type="button"
            onClick={() => void handleSourceChange("esp32")}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              activeSource.source_type === "esp32"
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            <Camera size={16} />
            ESP32-CAM
          </button>
          {isSaving ? <LoaderCircle className="text-neutral-500 animate-spin" size={16} /> : null}
        </div>

        {activeSource.source_type === "esp32" ? (
          <div className="flex flex-col md:flex-row gap-2">
            <input
              value={esp32UrlInput}
              onChange={(event) => setEsp32UrlInput(event.target.value)}
              placeholder="http://192.168.1.10:81/stream"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => void handleSaveEsp32Url()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
            >
              <Save size={16} />
              Save Source
            </button>
          </div>
        ) : null}
      </div>

      <div className="aspect-video bg-neutral-950 rounded-lg border border-neutral-800 flex items-center justify-center relative overflow-hidden">
        {isLoading ? (
          <div className="text-center">
            <LoaderCircle className="mx-auto text-neutral-600 mb-2 animate-spin" size={40} />
            <p className="text-neutral-500 text-sm">Loading video source...</p>
          </div>
        ) : (
          <>
            {activeSource.source_type === "webcam" ? (
              localWebcamStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null
            ) : (
              <img
                key={streamUrl}
                src={streamUrl}
                alt={`${activeSource.source_type} live stream`}
                onLoad={() => setStreamErrored(false)}
                onError={() => setStreamErrored(true)}
                className={`absolute inset-0 h-full w-full object-cover ${
                  streamErrored ? "opacity-0" : "opacity-100"
                }`}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-4">
              <div>
                <p className="text-white text-sm font-medium">
                  {activeSource.source_type === "webcam" ? "Laptop Webcam" : "ESP32-CAM"}
                </p>
                <p className="text-xs text-neutral-300">
                  {snapshot?.captured_at
                    ? `Last analyzed ${new Date(snapshot.captured_at).toLocaleTimeString()}`
                    : "Waiting for analysis"}
                </p>
              </div>
            </div>

            {activeSource.source_type === "webcam" && !localWebcamStream ? (
              <div className="text-center px-4">
                <Zap className="mx-auto text-neutral-700 mb-2" size={48} />
                <p className="text-neutral-500 text-sm">
                  {cameraPermissionError ?? "Allow camera access to use the laptop webcam."}
                </p>
              </div>
            ) : null}

            {activeSource.source_type === "esp32" && streamErrored ? (
              <div className="text-center">
                <Zap className="mx-auto text-neutral-700 mb-2" size={48} />
                <p className="text-neutral-500 text-sm">
                  Unable to reach the ESP32 stream.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-neutral-950/80 border border-neutral-800 p-3">
          <p className="text-neutral-500">Focus</p>
          <p className="text-white font-semibold">{formatPercent(snapshot?.focus_score)}</p>
        </div>
        <div className="rounded-lg bg-neutral-950/80 border border-neutral-800 p-3">
          <p className="text-neutral-500">Stress</p>
          <p className="text-white font-semibold">{formatPercent(snapshot?.stress_score)}</p>
        </div>
        <div className="rounded-lg bg-neutral-950/80 border border-neutral-800 p-3">
          <p className="text-neutral-500">Confidence</p>
          <p className="text-white font-semibold">{formatPercent(snapshot?.confidence)}</p>
        </div>
      </div>
    </div>
  );
}
