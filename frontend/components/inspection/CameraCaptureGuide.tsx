'use client';

import { AlertTriangle, Camera, CheckCircle2, Focus, RefreshCw, Sun, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

export interface FrameQuality {
  brightness: number;
  glareFraction: number;
  sharpness: number;
  status: 'ready' | 'too_dark' | 'too_bright' | 'glare' | 'blurry';
  message: string;
}

interface Props {
  onCapture: (file: File) => void;
  disabled?: boolean;
}

export function CameraCaptureGuide({ onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const overrideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCaptureRef = useRef<() => void>(() => undefined);
  const isCapturingRef = useRef(false);
  const readyStreakRef = useRef(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoCapture, setAutoCapture] = useState(true);
  const [readyStreak, setReadyStreak] = useState(0);
  const [quality, setQuality] = useState<FrameQuality>({
    brightness: 0,
    glareFraction: 0,
    sharpness: 0,
    status: 'blurry',
    message: 'Starting camera…',
  });
  const [canOverride, setCanOverride] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (overrideTimeoutRef.current) {
      clearTimeout(overrideTimeoutRef.current);
      overrideTimeoutRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const analyzeCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const width = 320;
    const height = 180;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvasRef.current = canvas;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Sample the central 70% region corresponding to the guide frame
    const vWidth = video.videoWidth || 640;
    const vHeight = video.videoHeight || 480;
    const cropW = vWidth * 0.75;
    const cropH = cropW * (9 / 16);
    const cropX = (vWidth - cropW) / 2;
    const cropY = (vHeight - cropH) / 2;

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;

    let totalLuminance = 0;
    let glareCount = 0;
    const gray = new Float32Array(totalPixels);

    for (let i = 0, p = 0; p < totalPixels; p++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[p] = lum;
      totalLuminance += lum;
      if (r > 245 && g > 245 && b > 245) {
        glareCount++;
      }
    }

    const avgBrightness = totalLuminance / totalPixels;
    const glareFraction = glareCount / totalPixels;

    // 3x3 Laplacian variance on luminance for sharpness
    let lapSum = 0;
    let lapSumSq = 0;
    let lapCount = 0;

    for (let y = 2; y < height - 2; y += 2) {
      const row = y * width;
      for (let x = 2; x < width - 2; x += 2) {
        const idx = row + x;
        const lap =
          gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
        lapSum += lap;
        lapSumSq += lap * lap;
        lapCount++;
      }
    }

    const meanLap = lapSum / lapCount;
    const sharpnessVar = Math.max(0, lapSumSq / lapCount - meanLap * meanLap);

    let status: FrameQuality['status'] = 'ready';
    let message = 'Ready — hold steady';

    if (avgBrightness < 45) {
      status = 'too_dark';
      message = 'Too dark — move to brighter light';
    } else if (avgBrightness > 230) {
      status = 'too_bright';
      message = 'Too bright / glare — adjust angle';
    } else if (glareFraction > 0.08) {
      status = 'glare';
      message = 'Glare detected — tilt phone';
    } else if (sharpnessVar < 22) {
      status = 'blurry';
      message = 'Hold steady / move closer';
    }

    if (status === 'ready') {
      readyStreakRef.current += 1;
      const streak = readyStreakRef.current;
      setReadyStreak(streak);
      if (streak >= 3) {
        message = autoCapture ? 'Auto-capturing steady frame…' : 'Steady — ready to snap';
        if (autoCapture && !isCapturingRef.current) {
          isCapturingRef.current = true;
          handleCaptureRef.current();
        }
      } else {
        message = autoCapture ? `Hold steady (${streak}/3)…` : 'Ready — hold steady';
      }
    } else {
      readyStreakRef.current = 0;
      setReadyStreak(0);
    }

    setQuality({
      brightness: avgBrightness,
      glareFraction,
      sharpness: sharpnessVar,
      status,
      message,
    });
  }, [autoCapture]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setCanOverride(false);
    isCapturingRef.current = false;
    readyStreakRef.current = 0;
    setReadyStreak(0);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera not supported in this browser. Please use file upload.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => undefined);
          setCameraActive(true);
        };
      }

      // Allow override after 3 seconds
      overrideTimeoutRef.current = setTimeout(() => {
        setCanOverride(true);
        overrideTimeoutRef.current = null;
      }, 3000);

      // Start quality check interval (~450ms)
      const interval = setInterval(() => {
        analyzeCurrentFrame();
      }, 450);

      timerRef.current = interval;
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access or upload an image.'
          : 'Unable to connect to camera device. Please use file upload.';
      setCameraError(msg);
      setCameraActive(false);
    }
  }, [analyzeCurrentFrame, facingMode, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || disabled || isCapturingRef.current) return;
    isCapturingRef.current = true;

    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;

    // Crop specifically to the primary declaration panel frame (75% width, 16:9 ratio)
    const cropW = Math.round(vWidth * 0.75);
    const cropH = Math.round(cropW * (9 / 16));
    const cropX = Math.round((vWidth - cropW) / 2);
    const cropY = Math.round((vHeight - cropH) / 2);

    const snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = cropW;
    snapshotCanvas.height = cropH;
    const ctx = snapshotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    snapshotCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `guided-capture-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        stopCamera();
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  }, [disabled, onCapture, stopCamera]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  const statusColor =
    quality.status === 'ready'
      ? 'border-emerald-400/60 text-emerald-300 bg-emerald-950/80 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
      : quality.status === 'blurry'
        ? 'border-rose-400/60 text-rose-300 bg-rose-950/80 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
        : 'border-amber-400/60 text-amber-300 bg-amber-950/80 shadow-[0_0_15px_rgba(245,158,11,0.35)]';

  const frameBorderColor =
    quality.status === 'ready'
      ? readyStreak >= 3
        ? 'border-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.85)] ring-4 ring-emerald-400/60 scale-[1.015]'
        : 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] ring-2 ring-emerald-400/30'
      : quality.status === 'blurry'
        ? 'border-rose-400/90 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
        : 'border-amber-400/90 shadow-[0_0_15px_rgba(245,158,11,0.3)]';

  if (cameraError) {
    return (
      <div className="surface-panel rounded-2xl border-2 border-dashed p-8 text-center shadow-lg">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
          <AlertTriangle className="size-7" />
        </div>
        <p className="mt-4 text-base font-semibold text-foreground">{cameraError}</p>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
          You can retry opening the camera or switch to file upload below.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={startCamera} className="gap-2 font-semibold">
            <RefreshCw className="size-4" /> Try camera again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex flex-col items-center overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl border border-neutral-800">
      {/* Video Viewport */}
      <div className="relative aspect-[4/3] w-full max-w-2xl overflow-hidden sm:aspect-[16/10] bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

        {/* Ambient Dark Mask with Cutout Effect */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black/60 via-transparent to-black/70">
          {/* Top Header Label */}
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-neutral-200 backdrop-blur-md shadow-md">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Primary Declaration Panel Guide
          </div>

          {/* Target Declaration Panel Frame */}
          <div
            className={`relative aspect-[16/9] w-[88%] max-w-[500px] rounded-xl border-2 transition-all duration-300 backdrop-brightness-105 ${frameBorderColor}`}
          >
            {/* High-Tech Corner Reticles */}
            <div className="absolute -left-1.5 -top-1.5 size-6 border-l-[3.5px] border-t-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
            <div className="absolute -right-1.5 -top-1.5 size-6 border-r-[3.5px] border-t-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
            <div className="absolute -bottom-1.5 -left-1.5 size-6 border-b-[3.5px] border-l-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
            <div className="absolute -bottom-1.5 -right-1.5 size-6 border-b-[3.5px] border-r-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />

            {/* Subtle Crosshairs */}
            <div className="absolute left-1/2 top-2 h-2 w-px -translate-x-1/2 bg-white/40" />
            <div className="absolute bottom-2 left-1/2 h-2 w-px -translate-x-1/2 bg-white/40" />
            <div className="absolute left-2 top-1/2 h-px w-2 -translate-y-1/2 bg-white/40" />
            <div className="absolute right-2 top-1/2 h-px w-2 -translate-y-1/2 bg-white/40" />

            {/* Central Helper Pill */}
            <div className="flex h-full flex-col items-center justify-center p-2 text-center">
              <p className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-medium text-white/95 backdrop-blur-md shadow-sm">
                Frame MRP, Net Qty & Mfg Info Here
              </p>
            </div>
          </div>

          {/* Dynamic Real-Time Status & Readiness Bar */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold backdrop-blur-md transition-all duration-200 ${statusColor}`}
            >
              {quality.status === 'ready' ? (
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              ) : quality.status === 'too_dark' || quality.status === 'too_bright' ? (
                <Sun className="size-4 text-amber-400 shrink-0" />
              ) : quality.status === 'glare' ? (
                <Zap className="size-4 text-amber-400 shrink-0" />
              ) : (
                <Focus className="size-4 text-rose-400 shrink-0" />
              )}
              <span>{quality.message}</span>
            </div>

            {/* Auto-Snap Streak Indicator */}
            {autoCapture && quality.status === 'ready' ? (
              <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300/90 backdrop-blur-sm">
                <span>Auto-snap lock:</span>
                <div className="flex gap-1">
                  {[0, 1, 2].map((idx) => (
                    <span
                      key={idx}
                      className={`size-2 rounded-full transition-all duration-200 ${
                        readyStreak > idx
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] scale-110'
                          : 'bg-neutral-600/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Camera Controls Bar */}
      <div className="flex w-full items-center justify-between bg-neutral-950/95 px-4 py-3.5 text-white border-t border-neutral-800/80 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="rounded-full bg-neutral-900 border border-neutral-800 p-2.5 text-neutral-300 transition-all hover:bg-neutral-800 hover:text-white active:scale-95"
          title="Switch camera"
          aria-label="Switch camera front/back"
        >
          <RefreshCw className="size-5" />
        </button>

        {/* Primary Capture Action */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="lg"
            disabled={(!cameraActive || quality.status !== 'ready') && !canOverride}
            onClick={handleCapture}
            className={`min-w-44 rounded-full px-6 py-6 text-base font-bold shadow-lg transition-all active:scale-98 ${
              quality.status === 'ready'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-400/40'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            <Camera className="mr-2 size-5" />
            {quality.status === 'ready'
              ? 'Snap Declaration'
              : canOverride
                ? 'Capture anyway'
                : 'Hold still…'}
          </Button>
        </div>

        {/* Auto-Snap Toggle */}
        <button
          type="button"
          onClick={() => setAutoCapture((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
            autoCapture
              ? 'border border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
              : 'border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-300'
          }`}
          title="Auto-snap after 3 steady frames (~1.3s)"
          aria-label={`Toggle auto-snap (currently ${autoCapture ? 'on' : 'off'})`}
        >
          <Zap className="size-3.5" />
          <span className="hidden sm:inline">Auto-snap:</span>
          <span>{autoCapture ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
}
