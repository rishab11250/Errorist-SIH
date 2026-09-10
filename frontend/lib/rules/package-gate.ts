import type { OCRWord } from './domain';

export interface PackageAnchorCheck {
  isPackage: boolean;
  score: number;
  anchorsFound: string[];
  reasons: string[];
}

/**
 * Verifies whether OCR evidence corresponds to a commodity package declaration panel.
 * Rejects arbitrary non-packaging images (walls, laptops, newspapers, pets) that lack
 * any statutory packaging declarations or semantic anchors under LMPC Rules 2011.
 */
export function assessPackageContent(words: OCRWord[]): PackageAnchorCheck {
  if (!words || words.length === 0) {
    return {
      isPackage: false,
      score: 0,
      anchorsFound: [],
      reasons: ['No text detected in evidence image.'],
    };
  }

  const fullText = words.map((w) => w.text).join(' ');

  const anchorsFound: string[] = [];

  // 1. Pricing / Currency Anchors
  const priceRegex =
    /\b(m\.?r\.?p\.?|max(?:imum)?\s*retail\s*price|incl(?:usive)?\s*(?:of)?\s*all\s*taxes|inr)\b|[₹]|\brs\s*\.?\s*\d+/i;
  if (priceRegex.test(fullText)) {
    anchorsFound.push('pricing');
  }

  // 2. Quantity / Net Content / Measurement Anchors
  const qtyRegex =
    /\b(net\s*(?:wt\.?|weight|qty\.?|quantity|vol\.?|volume|contents?)|gross\s*(?:wt\.?|weight))\b/i;
  const unitRegex =
    /\b\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|kgs|ml|l|ltr|ltrs|pcs|pieces|units|tablets|capsules|N)\b/i;
  if (qtyRegex.test(fullText) || unitRegex.test(fullText)) {
    anchorsFound.push('quantity');
  }

  // 3. Manufacturing / Packaging Dates / Batches
  const dateRegex =
    /\b(mfd\.?|mfg\.?|packed|pkd\.?|packaging\s*date|packed\s*on|batch(?:\s*no\.?)?|lot(?:\s*no\.?)?|exp(?:iry)?(?:\s*date)?|best\s*before|use\s*by)\b/i;
  if (dateRegex.test(fullText)) {
    anchorsFound.push('dates_batch');
  }

  // 4. Manufacturer / Origin / Distribution Anchors
  const mfdRegex =
    /\b(mfd\.?\s*by|mfg\.?\s*by|manufactured\s*by|marketed\s*by|packed\s*by|imported\s*by|mktd\.?\s*by|country\s*of\s*origin|made\s*in)\b/i;
  const pinRegex = /\b[1-9][0-9]{5}\b/;
  if (
    mfdRegex.test(fullText) ||
    (pinRegex.test(fullText) &&
      /\b(road|street|nagar|dist|industrial|estate|ltd|pvt|corp|mumbai|delhi|bengaluru|chennai|gujarat|pune|village|taluk)\b/i.test(
        fullText
      ))
  ) {
    anchorsFound.push('manufacturer');
  }

  // 5. Consumer Care / Regulatory Anchors
  const careRegex =
    /\b(consumer\s*care|customer\s*care|toll\s*free|care\s*cell|helpline|fssai|lic\.?\s*no\.?)\b/i;
  if (careRegex.test(fullText)) {
    anchorsFound.push('consumer_care_regulatory');
  }

  // 6. Ingredients / Nutritional Declarations
  const nutritionRegex =
    /\b(ingredients?|nutrition(?:al)?(?:\s*information)?|per\s*100\s*(?:g|ml)|energy|protein|carbohydrates?)\b/i;
  if (nutritionRegex.test(fullText)) {
    anchorsFound.push('ingredients_nutrition');
  }

  const score = Math.min(100, anchorsFound.length * 25);
  const isPackage = anchorsFound.length >= 1;

  const reasons = isPackage
    ? [`Detected statutory packaging anchors: ${anchorsFound.join(', ')}.`]
    : [
        'No statutory packaging anchors detected (missing MRP, Net Quantity, Batch, or Manufacturer signals).',
      ];

  return { isPackage, score, anchorsFound, reasons };
}
