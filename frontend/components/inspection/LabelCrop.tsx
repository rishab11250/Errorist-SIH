'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** User-confirmed region: no claim that OCR can segment a package silhouette. */
export function LabelCrop({
  src,
  onApply,
  onCancel,
}: {
  src: string;
  onApply: (file: File) => void;
  onCancel: () => void;
}) {
  const [trim, setTrim] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function apply() {
    setSaving(true);
    try {
      const image = new window.Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = src;
      });
      const x = (image.naturalWidth * trim.left) / 100;
      const y = (image.naturalHeight * trim.top) / 100;
      const width = (image.naturalWidth * (100 - trim.left - trim.right)) / 100;
      const height = (image.naturalHeight * (100 - trim.top - trim.bottom)) / 100;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 3200 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95)
      );
      if (!blob) throw new Error();
      onApply(new File([blob], 'cropped-package.jpg', { type: 'image/jpeg' }));
    } catch {
      setError('Could not crop this image. Try a smaller photo.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-label="Crop package label">
      <p className="text-sm">
        Move the edges to exclude the background. Keep every declaration you want inspected inside
        the rectangle.
      </p>
      <div className="relative overflow-hidden">
        <Image
          src={src}
          alt="Package crop preview"
          width={1600}
          height={1200}
          unoptimized
          className="h-auto w-full"
        />
        <div
          className="pointer-events-none absolute border-2 border-emerald-400"
          style={{
            top: `${trim.top}%`,
            right: `${trim.right}%`,
            bottom: `${trim.bottom}%`,
            left: `${trim.left}%`,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 55%)',
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
          <label key={edge} className="text-sm capitalize">
            {edge}: {trim[edge]}%
            <input
              className="block w-full"
              type="range"
              min="0"
              max="45"
              value={trim[edge]}
              disabled={saving}
              onChange={(event) => setTrim({ ...trim, [edge]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={saving} onClick={apply}>
          {saving ? 'Cropping…' : 'Use selected label'}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          Cancel crop
        </Button>
      </div>
    </section>
  );
}
