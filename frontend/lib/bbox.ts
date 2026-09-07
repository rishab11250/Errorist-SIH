export type Bbox = [number, number, number, number];

export function normaliseBbox(bboxPx: Bbox, imageWidth: number, imageHeight: number): Bbox {
  const [x, y, w, h] = bboxPx;
  return [x / imageWidth, y / imageHeight, w / imageWidth, h / imageHeight];
}

export function denormaliseBbox(
  bboxNorm: Bbox,
  displayWidth: number,
  displayHeight: number,
): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = bboxNorm;
  return { x: x * displayWidth, y: y * displayHeight, w: w * displayWidth, h: h * displayHeight };
}
