'use client';

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Focus,
  ImageUp,
  RefreshCw,
  Sun,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cameraCrop } from '@/lib/camera-crop';

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
  onSwitchToUpload?: () => void;
}

export function CameraCaptureGuide({ onCapture, disabled, onSwitchToUpload }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const autoCaptureRef = useRef(true);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const grayRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const handleCaptureRef = useRef<() => void>(() => undefined);
  const isCapturingRef = useRef(false);
  const readyStreakRef = useRef(0);
  const cameraGenerationRef = useRef(0);
  const captureSequenceRef = useRef(0);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

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
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopCamera = useCallback(() => {
    cameraGenerationRef.current += 1;
    captureSequenceRef.current += 1;
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    captureTimeoutRef.current = null;
    isCapturingRef.current = false;
    setCapturing(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const analyzeCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (
      !video ||
      video.readyState < 2 ||
      disabledRef.current ||
      document.visibilityState === 'hidden'
    )
      return;

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

    const guide = guideRef.current;
    if (!guide) return;
    const crop = cameraCrop(
      video.videoWidth,
      video.videoHeight,
      video.getBoundingClientRect(),
      guide.getBoundingClientRect()
    );
    if (!crop) return;
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const totalPixels = width * height;

    let totalLuminance = 0;
    let glareCount = 0;
    const gray = (grayRef.current ??= new Float32Array(totalPixels));

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
      const autoCapture = autoCaptureRef.current;
      readyStreakRef.current += 1;
      const streak = readyStreakRef.current;
      setReadyStreak(streak);
      if (streak >= 3) {
        message = autoCapture ? 'Auto-capturing steady frame…' : 'Steady — ready to snap';
        if (autoCapture && !isCapturingRef.current) {
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
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setCaptureError(null);
    isCapturingRef.current = false;
    readyStreakRef.current = 0;
    setReadyStreak(0);

    if (window.isSecureContext === false) {
      setCameraError(
        'Camera access requires HTTPS. Open the secure app link in Chrome or Safari, not an in-app browser.'
      );
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera not supported in this browser. Please use file upload.');
      return;
    }

    const generation = cameraGenerationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (generation !== cameraGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (generation !== cameraGenerationRef.current) return;

      // Start quality check interval (~450ms)
      const interval = setInterval(() => {
        analyzeCurrentFrame();
      }, 450);

      timerRef.current = interval;
    } catch (err) {
      if (generation !== cameraGenerationRef.current) return;
      stopCamera();
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
    const guide = guideRef.current;
    if (disabled || isCapturingRef.current) return;
    if (!video || !guide || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCaptureError(
        'No camera frame is available yet. Wait for the live preview, then tap Capture photo again.'
      );
      return;
    }
    const crop = cameraCrop(
      video.videoWidth,
      video.videoHeight,
      video.getBoundingClientRect(),
      guide.getBoundingClientRect()
    );
    if (!crop) {
      setCaptureError(
        'The camera guide is not visible. Bring the app to the foreground and try again.'
      );
      return;
    }
    isCapturingRef.current = true;
    setCapturing(true);
    setCaptureError(null);
    const sequence = ++captureSequenceRef.current;
    const failCapture = (message: string) => {
      if (sequence !== captureSequenceRef.current) return;
      captureSequenceRef.current += 1;
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
      isCapturingRef.current = false;
      setCapturing(false);
      setCaptureError(message);
    };
    const generation = cameraGenerationRef.current;
    const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));

    const snapshotCanvas = document.createElement('canvas');
    snapshotCanvas.width = Math.max(1, Math.round(crop.width * scale));
    snapshotCanvas.height = Math.max(1, Math.round(crop.height * scale));
    const ctx = snapshotCanvas.getContext('2d');
    if (!ctx) {
      failCapture('Chrome could not prepare the photo. Close other camera apps and retry.');
      return;
    }

    try {
      ctx.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        snapshotCanvas.width,
        snapshotCanvas.height
      );

      captureTimeoutRef.current = setTimeout(() => {
        failCapture(
          'Saving the camera frame timed out. Tap Capture photo to retry, or use Upload photo.'
        );
      }, 5000);
      snapshotCanvas.toBlob(
        (blob) => {
          if (generation !== cameraGenerationRef.current || sequence !== captureSequenceRef.current)
            return;
          if (!blob) {
            failCapture('Chrome could not encode this photo. Tap Capture photo to retry.');
            return;
          }
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
    } catch {
      failCapture('Could not capture this camera frame. Please try again.');
    }
  }, [disabled, onCapture, stopCamera]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  const statusColor =
    quality.status === 'ready'
      ? 'border-2 border-emerald-400 bg-neutral-900/95 !text-emerald-100 font-bold shadow-[0_0_20px_rgba(52,211,153,0.6)]'
      : quality.status === 'too_dark'
        ? 'border-2 border-amber-400 bg-neutral-900/95 !text-amber-100 font-bold shadow-[0_0_25px_rgba(251,191,36,0.9)]'
        : quality.status === 'too_bright' || quality.status === 'glare'
          ? 'border-2 border-amber-400 bg-neutral-900/95 !text-amber-100 font-bold shadow-[0_0_25px_rgba(251,191,36,0.9)]'
          : 'border-2 border-rose-400 bg-neutral-900/95 !text-rose-100 font-bold shadow-[0_0_20px_rgba(244,63,94,0.6)]';

  const frameBorderColor =
    quality.status === 'ready'
      ? readyStreak >= 3
        ? 'border-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.85)] ring-4 ring-emerald-400/60 scale-[1.015]'
        : 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] ring-2 ring-emerald-400/30'
      : quality.status === 'blurry'
        ? 'border-rose-400/90 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
        : 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)] ring-2 ring-amber-400/40';

  const errorPanel = cameraError ? (
    <div className="surface-panel rounded-2xl border-2 border-dashed p-8 text-center shadow-lg">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
        <AlertTriangle className="size-7" />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{cameraError}</p>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
        You can retry opening the camera or switch to file upload below.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={startCamera}
          className="gap-2 font-semibold"
        >
          <RefreshCw className="size-4" /> Try camera again
        </Button>
        {onSwitchToUpload && (
          <Button type="button" variant="outline" onClick={onSwitchToUpload}>
            Upload photo
          </Button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {errorPanel}
      {captureError && (
        <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">
          {captureError}
        </p>
      )}
      <div
        hidden={Boolean(cameraError)}
        className="relative mx-auto flex flex-col items-center overflow-hidden rounded-2xl bg-neutral-950 shadow-2xl border border-neutral-800"
        style={cameraError ? { display: 'none' } : undefined}
      >
        {/* Video Viewport */}
        <div className="relative aspect-[3/4] xs:aspect-[4/3] w-full max-w-2xl overflow-hidden sm:aspect-[16/10] bg-black">
          <video
            ref={videoRef}
            onPlaying={() => setCameraActive(true)}
            onWaiting={() => setCameraActive(false)}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {/* Ambient Dark Mask with Cutout Effect */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-3 sm:p-6 bg-gradient-to-b from-black/60 via-transparent to-black/70">
            {/* Top Header Label */}
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/15 bg-black/75 px-2.5 sm:px-3.5 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-neutral-200 backdrop-blur-md shadow-md">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>Declaration Panel Guide</span>
            </div>

            {/* Target Declaration Panel Frame */}
            <div
              ref={guideRef}
              className={`relative aspect-[16/9] w-[92%] sm:w-[88%] max-w-[500px] rounded-xl border-2 transition-all duration-300 backdrop-brightness-105 ${frameBorderColor}`}
            >
              {/* High-Tech Corner Reticles */}
              <div className="absolute -left-1.5 -top-1.5 size-5 sm:size-6 border-l-[3.5px] border-t-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
              <div className="absolute -right-1.5 -top-1.5 size-5 sm:size-6 border-r-[3.5px] border-t-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
              <div className="absolute -bottom-1.5 -left-1.5 size-5 sm:size-6 border-b-[3.5px] border-l-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
              <div className="absolute -bottom-1.5 -right-1.5 size-5 sm:size-6 border-b-[3.5px] border-r-[3.5px] border-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />

              {/* Subtle Crosshairs */}
              <div className="absolute left-1/2 top-2 h-2 w-px -translate-x-1/2 bg-white/40" />
              <div className="absolute bottom-2 left-1/2 h-2 w-px -translate-x-1/2 bg-white/40" />
              <div className="absolute left-2 top-1/2 h-px w-2 -translate-y-1/2 bg-white/40" />
              <div className="absolute right-2 top-1/2 h-px w-2 -translate-y-1/2 bg-white/40" />

              {/* Central Helper Pill */}
              <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                <p className="rounded-full border border-white/10 bg-black/60 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium text-white/95 backdrop-blur-md shadow-sm">
                  Frame MRP, Net Qty &amp; Mfg Info Here
                </p>
              </div>
            </div>

            {/* Dynamic Real-Time Status & Readiness Bar */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold backdrop-blur-md transition-all duration-200 ${statusColor}`}
              >
                {quality.status === 'ready' ? (
                  <CheckCircle2 className="size-4 sm:size-4.5 text-emerald-300 shrink-0" />
                ) : quality.status === 'too_dark' || quality.status === 'too_bright' ? (
                  <Sun className="size-4 sm:size-4.5 text-amber-300 shrink-0" />
                ) : quality.status === 'glare' ? (
                  <Zap className="size-4 sm:size-4.5 text-amber-300 shrink-0" />
                ) : (
                  <Focus className="size-4 sm:size-4.5 text-rose-300 shrink-0" />
                )}
                <span className="!text-white font-bold tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {quality.message}
                </span>
              </div>

              {/* Auto-Snap Streak Indicator */}
              {autoCapture && quality.status === 'ready' ? (
                <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-medium text-emerald-300/90 backdrop-blur-sm">
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
        <div className="flex w-full items-center justify-between gap-2 bg-neutral-950/95 px-2.5 sm:px-4 py-3 text-white border-t border-neutral-800/80 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              className="rounded-full bg-neutral-900 border border-neutral-800 p-2.5 text-neutral-300 transition-all hover:bg-neutral-800 hover:text-white active:scale-95 shrink-0"
              title="Switch camera front/back"
              aria-label="Switch camera front/back"
            >
              <RefreshCw className="size-4 sm:size-4.5" />
            </button>
            {onSwitchToUpload && (
              <button
                type="button"
                onClick={onSwitchToUpload}
                className="rounded-full bg-neutral-900 border border-neutral-800 p-2.5 text-neutral-300 transition-all hover:bg-neutral-800 hover:text-white active:scale-95 shrink-0"
                title="Upload from Gallery / Files"
                aria-label="Upload photo from gallery"
              >
                <ImageUp className="size-4 sm:size-4.5 text-terracotta" />
              </button>
            )}
          </div>

          {/* Primary Capture Action */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              type="button"
              size="lg"
              disabled={disabled || capturing}
              onClick={handleCapture}
              className={`min-w-32 sm:min-w-44 rounded-full px-3 sm:px-6 py-4 sm:py-6 text-xs sm:text-base font-bold shadow-lg transition-all active:scale-98 ${
                quality.status === 'ready'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-400/40'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              }`}
            >
              <Camera className="mr-1.5 sm:mr-2 size-4 sm:size-5 shrink-0" />
              <span className="truncate">
                {capturing
                  ? 'Saving photo…'
                  : quality.status === 'ready'
                    ? 'Snap Declaration'
                    : 'Capture photo'}
              </span>
            </Button>
          </div>

          {/* Auto-Snap Toggle */}
          <button
            type="button"
            onClick={() => {
              autoCaptureRef.current = !autoCaptureRef.current;
              setAutoCapture(autoCaptureRef.current);
            }}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-all active:scale-95 shrink-0 ${
              autoCapture
                ? 'border border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                : 'border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-300'
            }`}
            title="Auto-snap after 3 steady frames (~1.3s)"
            aria-label={`Toggle auto-snap (currently ${autoCapture ? 'on' : 'off'})`}
          >
            <Zap className="size-3 sm:size-3.5" />
            <span className="hidden xs:inline">Auto:</span>
            <span>{autoCapture ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <p role="status" className="px-4 py-2 text-xs text-neutral-300">
          {capturing
            ? 'Capturing on this device—no upload yet.'
            : cameraActive
              ? 'Camera ready. Capture a photo, then select Start inspection.'
              : 'Waiting for a live camera frame…'}
        </p>

        {onSwitchToUpload && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-neutral-900 border-t border-neutral-800 w-full text-xs font-mono">
            <span className="text-neutral-400 text-[11px] sm:text-xs">Have a saved photo?</span>
            <button
              type="button"
              onClick={onSwitchToUpload}
              className="text-terracotta hover:underline font-semibold flex items-center gap-1 text-[11px] sm:text-xs"
            >
              <ImageUp className="size-3.5" /> Choose from Gallery
            </button>
          </div>
        )}
      </div>
    </>
  );
}
