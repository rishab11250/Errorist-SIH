import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { avgConfidence, compileRegex, findWordWithText, mergeBboxes } from './base';

export const SECTION_KEYWORDS =
  /\b(?:customer\s+care|consumer\s+care|for\s+complaints|feedback|contact\s+us|grievance|write\s+to|reach\s+us)\b/i;

export function extractConsumerCare(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  emailRegexStr: string,
  phoneRegexStr: string
): ExtractedField {
  const emailRe = compileRegex(emailRegexStr);
  const phoneRe = compileRegex(phoneRegexStr);

  const emailWords = ocrWords.filter((word) => emailRe.test(word.text));
  const phoneWords: OCRWord[] = [];

  for (let i = 0; i < ocrWords.length; i++) {
    for (let window = 1; window <= 4; window++) {
      if (i + window <= ocrWords.length) {
        const chunk = ocrWords
          .slice(i, i + window)
          .map((w) => w.text)
          .join('');
        if (phoneRe.test(chunk)) {
          for (let k = i; k < i + window; k++) {
            phoneWords.push(ocrWords[k]);
          }
          break;
        }
      }
    }
  }

  if (emailWords.length === 0 || phoneWords.length === 0) {
    return {
      name: 'consumer_care',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
    };
  }

  const sectionWords = findWordWithText(ocrWords, SECTION_KEYWORDS);
  let sectionY: number;
  if (sectionWords.length > 0) {
    sectionY = Math.min(...sectionWords.map((w) => w.bbox[1]));
  } else {
    const minEmailY = Math.min(...emailWords.map((w) => w.bbox[1]));
    const minPhoneY = Math.min(...phoneWords.map((w) => w.bbox[1]));
    sectionY = Math.min(minEmailY, minPhoneY);
  }

  const isNormalized =
    ocrWords.length > 0 &&
    ocrWords.every(
      (w) =>
        w.bbox[0] <= 1.0 &&
        w.bbox[1] <= 1.0 &&
        w.bbox[2] <= 1.0 &&
        w.bbox[3] <= 1.0
    );

  const maxDeltaY =
    isNormalized && imageMeta.height > 0
      ? 200.0 / imageMeta.height
      : 200.0;

  const block = ocrWords.filter(
    (w) => w.bbox[1] - sectionY >= 0 && w.bbox[1] - sectionY <= maxDeltaY
  );
  const blockText = block.map((w) => w.text).join(' ');
  const hasEmail = emailRe.test(blockText);
  const hasPhone = phoneRe.test(blockText);
  const hasNameAddress = block.length >= 4;

  const contactWords = [...emailWords, ...phoneWords];
  if (!(hasEmail && hasPhone && hasNameAddress)) {
    return {
      name: 'consumer_care',
      value: null,
      bbox: mergeBboxes(contactWords),
      confidence: avgConfidence(contactWords),
      evidence_spans: [emailWords[0].bbox],
    };
  }

  return {
    name: 'consumer_care',
    value: blockText,
    bbox: mergeBboxes(block),
    confidence: avgConfidence(block),
    evidence_spans: [emailWords[0].bbox, phoneWords[0].bbox],
  };
}
