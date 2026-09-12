import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CameraCaptureGuide } from '@/components/inspection/CameraCaptureGuide';
import { cameraCrop } from '@/lib/camera-crop';

describe('live camera capture', () => {
  let stop: ReturnType<typeof vi.fn>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    stop = vi.fn();
    getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 180,
    } as DOMRect);
    const data = new Uint8ClampedArray(320 * 180 * 4);
    for (let p = 0; p < 320 * 180; p++) {
      const value = 60 + ((p * 17 + Math.floor(p / 320) * 13) % 130);
      data.set([value, value, value, 255], p * 4);
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['image'], { type: 'image/jpeg' }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function open(onCapture = vi.fn(), disabled = false) {
    const view = render(<CameraCaptureGuide onCapture={onCapture} disabled={disabled} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.playing(view.container.querySelector('video')!);
    return { ...view, onCapture };
  }

  it('auto-snaps after three ready frames instead of locking itself out', async () => {
    const { onCapture } = await open();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture.mock.calls[0][0]).toBeInstanceOf(File);
    expect(stop).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it('does not reopen the camera when auto-snap is toggled', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Toggle auto-snap/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });

  it('allows a manual photo before quality heuristics declare it ready', async () => {
    const { onCapture } = await open();
    fireEvent.click(screen.getByRole('button', { name: /Capture photo/ }));
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it('allows another capture after image encoding returns no blob', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) =>
      callback(null)
    );
    const { onCapture } = await open();
    const button = screen.getByRole('button', { name: /Capture photo/ });
    fireEvent.click(button);
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('could not encode');
    fireEvent.click(button);
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it('explains a missing frame instead of silently ignoring a click', async () => {
    const { onCapture } = await open();
    vi.mocked(
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!.get!
    ).mockReturnValue(0);
    fireEvent.click(screen.getByRole('button', { name: /Capture photo/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('No camera frame');
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('unlocks a timed-out capture and discards a late encoder callback', async () => {
    let finish!: BlobCallback;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
      finish = callback;
    });
    const { onCapture } = await open();
    fireEvent.click(screen.getByRole('button', { name: /Toggle auto-snap/ }));
    fireEvent.click(screen.getByRole('button', { name: /Capture photo/ }));
    expect(screen.getByRole('button', { name: /Saving photo/ })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    act(() => finish(new Blob(['late'])));
    expect(onCapture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Snap Declaration|Capture photo/ }));
    expect(onCapture).toHaveBeenCalledOnce();
  });

  it('keeps a mounted preview available when retrying denied permission', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const { container } = await open();
    expect(screen.getByText(/Camera permission denied/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Try camera again/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('video')?.srcObject).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('never auto-snaps while the parent disables capture', async () => {
    const { onCapture } = await open(vi.fn(), true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(onCapture).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Capture photo/ })).toBeDisabled();
  });
});

describe('camera guide geometry', () => {
  it('accounts for landscape video cropped by a portrait object-cover preview', () => {
    expect(
      cameraCrop(
        1920,
        1080,
        { left: 0, top: 0, width: 300, height: 400 },
        { left: 30, top: 160, width: 240, height: 80 }
      )
    ).toEqual({ x: 636, y: 432, width: 648, height: 216 });
  });
  it('does not manufacture dimensions before a camera frame is available', () => {
    expect(
      cameraCrop(
        0,
        0,
        { left: 0, top: 0, width: 300, height: 400 },
        { left: 0, top: 0, width: 200, height: 100 }
      )
    ).toBeNull();
  });
});
