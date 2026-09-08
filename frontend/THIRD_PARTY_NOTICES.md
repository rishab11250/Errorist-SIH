# Third-party UI notices

Accessed 2026-09-08. Only free source and packages are used; no paid blocks or templates are included.

## shadcn/ui primitives

- Source: https://ui.shadcn.com/
- License: MIT
- Local files: `components/ui/button.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `tooltip.tsx`, `table.tsx`, `badge.tsx`, `skeleton.tsx`, and `sonner.tsx`
- Modifications: generated only the controls required by planned screens; imports point to the local `cn` helper and styling is normalized through project tokens.

## Magic UI Number Ticker

- Source: https://magicui.design/docs/components/number-ticker and https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/number-ticker.tsx
- License: MIT, Copyright (c) Magic UI
- Local file: `components/ui/number-ticker.tsx`
- Modifications: uses project typography, Indian number formatting by default, reduced-motion behavior, deterministic initial text, and no dark-theme-specific colors.

## React Bits Stepper

- Source: https://reactbits.dev/components/stepper and https://github.com/DavidHDev/react-bits/blob/main/src/ts-tailwind/Components/Stepper/Stepper.tsx
- License: MIT + Commons Clause License Condition v1.0, Copyright (c) 2026 David Haz. Permits use and modification as part of an application, including commercial use; the component library itself may not be sold or redistributed.
- Local file: `components/ui/scan-progress.tsx`
- Modifications: reduced to a non-interactive upload/OCR/analysis status indicator; removed navigation, height measurement, content transitions, hard-coded colors, and click handling; added semantic list/current-step markup, visible state text for assistive technology, token colors, and reduced-motion handling.

## Aceternity UI Spotlight review

- Reviewed source: https://ui.aceternity.com/components/spotlight
- Result: the component was listed as free, but the page did not expose a compatible open-source license at implementation time. No Aceternity source code was copied.
- Local alternative: `components/ui/spotlight.tsx` is an original, static CSS treatment implementing the same decorative need without pointer tracking, animation, or additional dependencies.

## Tesseract.js offline OCR assets

- Sources: `tesseract.js` 5.1.1 (Apache-2.0), `tesseract.js-core` 5.1.1 (Apache-2.0), and `@tesseract.js-data/eng` 1.0.0 (MIT).
- Local files: `public/tesseract/worker.min.js`, `public/tesseract/core/*`, and `public/tesseract/lang/eng.traineddata.gz`.
- Distributed license texts: `public/tesseract/licenses/`.
- Purpose: serve the OCR worker, WebAssembly variants, and English model from this application so label inspection does not depend on a CDN or runtime internet access.
