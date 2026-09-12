/** Map the visible guide through a centered object-cover preview into camera pixels. */
export function cameraCrop(
  sourceWidth: number,
  sourceHeight: number,
  viewport: { left: number; top: number; width: number; height: number },
  guide: { left: number; top: number; width: number; height: number }
) {
  if (
    !sourceWidth ||
    !sourceHeight ||
    !viewport.width ||
    !viewport.height ||
    !guide.width ||
    !guide.height
  )
    return null;
  const scale = Math.max(viewport.width / sourceWidth, viewport.height / sourceHeight);
  const offsetX = (sourceWidth * scale - viewport.width) / 2;
  const offsetY = (sourceHeight * scale - viewport.height) / 2;
  const x = Math.max(0, (guide.left - viewport.left + offsetX) / scale);
  const y = Math.max(0, (guide.top - viewport.top + offsetY) / scale);
  const width = Math.min(sourceWidth - x, guide.width / scale);
  const height = Math.min(sourceHeight - y, guide.height / scale);
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
