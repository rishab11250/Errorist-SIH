# Inspection Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned image-quality, automatic font/readability, placement, expanded declaration, and screenshot-listing analysis to the current scanner without asking users for calibration input.

**Architecture:** The browser continues to produce OCR words and adds deterministic line groups. FastAPI decodes the submitted evidence image, computes visual measurements, runs mode-specific extractors and placement checks, and applies versioned rules. Analysis values and explanations are stored through Alembic-managed schema changes and returned through a backward-compatible version-2 contract.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, SQLite, Pillow, NumPy, OpenCV headless, PyYAML, pytest; Next.js 14, React 18, TypeScript, Tesseract.js 5, Vitest.

## Global Constraints

- Keep `retail_image` and `ecommerce_listing` as the canonical mode values.
- Normalize all evidence boxes as `[x, y, width, height]` in `[0,1]`.
- Preserve version-1 scan requests through defaults; the frontend emits `schema_version: 2` after Task 9.
- Verdict statuses are `pass | fail | warn | manual_review | na`.
- Overall precedence is `fail`, then `manual_review`, then `mixed`, then `pass`.
- Missing or malformed declarations may fail only when OCR/image evidence is sufficient to support absence.
- Image quality alone produces guidance or `manual_review`, never a statutory declaration failure.
- Never infer physical millimetres from camera DPI alone.
- Do not add live URL scraping.
- Store algorithm name, version, measurement method, confidence, and evidence boxes.
- Use `backend/.venv/bin/python`; `uv` is not required.

---

## Target file map

```text
backend/
  alembic.ini
  migrations/
    env.py
    script.py.mako
    versions/0001_legacy_schema.py
    versions/0002_inspection_v2.py
  app/
    analysis_pipeline.py       orchestration only
    domain.py                  analysis domain values
    models.py                  HTTP DTOs
    errors.py                  request ID + shared error envelope
    migrations.py              legacy adoption + upgrade helper
    visual_analysis/
      __init__.py
      image_io.py              bounded image decode + metadata
      quality.py               blur/contrast/glare/skew/perspective
      panel.py                 principal-panel estimate
      readability.py           relative readability + physical-size policy
    placement/
      __init__.py
      geometry.py              box operations
      evaluator.py             placement evidence
    extractors/
      best_before.py
      dimensions.py
      unit_price.py
      registry.py
  tests/
    test_migrations.py
    test_analysis_contract.py
    test_visual_quality.py
    test_readability.py
    test_placement.py
    test_extract_extended.py
    test_analysis_pipeline.py
frontend/
  lib/ocr-lines.ts
  tests/ocr-lines.test.ts
```

## Task 1: Establish Alembic and preserve legacy databases

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/db.py`
- Modify: `backend/app/main.py`
- Create: `backend/app/sqlite.py`
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/0001_legacy_schema.py`
- Create: `backend/migrations/versions/0002_inspection_v2.py`
- Create: `backend/app/migrations.py`
- Create: `backend/tests/test_migrations.py`
- Modify: `backend/tests/test_health.py`
- Modify: `backend/tests/test_report_routes.py`
- Modify: `backend/tests/test_scan_routes.py`

**Interfaces:**
- Produces: `upgrade_database(db_path: str | Path) -> None` and database revision `0002_inspection_v2`.
- Preserves: existing `scans` and `verdicts` rows and IDs.

- [x] **Step 1: Add the migration dependencies**

Add these runtime dependencies to `backend/pyproject.toml`:

```toml
"alembic>=1.19,<2",
"numpy>=2.2,<3",
"opencv-python-headless>=4.14,<5",
```

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pip install -e '.[dev]'
```

Expected: exit 0; `python -c "import alembic, cv2, numpy"` exits 0.

- [x] **Step 2: Write migration tests that cover fresh and legacy databases**

Create `backend/tests/test_migrations.py` with these cases:

```python
from __future__ import annotations

import sqlite3

from app.migrations import HEAD_REVISION, upgrade_database


def _columns(path, table: str) -> set[str]:
    with sqlite3.connect(path) as connection:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def test_fresh_database_reaches_inspection_head(tmp_path) -> None:
    path = tmp_path / "fresh.db"
    upgrade_database(path)
    assert {
        "quality_summary", "extracted_fields", "analysis_version", "failure_stage",
        "request_id", "processing_error_code",
    } <= _columns(path, "scans")
    assert {"confidence", "reasoning", "measurement_method", "review_state"} <= _columns(
        path, "verdicts"
    )
    with sqlite3.connect(path) as connection:
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert revision == HEAD_REVISION


def test_unversioned_legacy_database_is_adopted_without_data_loss(tmp_path) -> None:
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE scans (
              id INTEGER PRIMARY KEY, created_at DATETIME, mode VARCHAR, category VARCHAR,
              image_b64 TEXT NOT NULL, image_meta JSON, ocr_payload JSON,
              overall_status VARCHAR
            );
            CREATE TABLE verdicts (
              id INTEGER PRIMARY KEY, scan_id INTEGER, rule_id VARCHAR, status VARCHAR,
              severity VARCHAR, citation VARCHAR, evidence TEXT, evidence_bboxes JSON,
              failure_message TEXT, rule_version VARCHAR, created_at DATETIME,
              FOREIGN KEY(scan_id) REFERENCES scans(id)
            );
            INSERT INTO scans VALUES
              (7, CURRENT_TIMESTAMP, 'retail_image', 'unknown', 'aGVsbG8=', '{}', '[]', 'pass');
            """
        )
    upgrade_database(path)
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT id FROM scans").fetchall() == [(7,)]
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == HEAD_REVISION
```

- [x] **Step 3: Run the migration tests to verify failure**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_migrations.py -q
```

Expected: FAIL because `app.migrations` does not exist.

- [x] **Step 4: Add the Alembic configuration and revisions**

Generate the standard Alembic runner and revision template, then replace the generated `env.py` and add the two named revisions:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/alembic init migrations
```

Set `script_location = migrations` in `backend/alembic.ini`. Retain the generated `script.py.mako`. Configure `migrations/env.py` to import `app.db.Base`, set `target_metadata = Base.metadata`, read `sqlalchemy.url` from the Alembic config, enable `compare_type=True`, and use `render_as_batch=True` for both offline and online migrations.

Implement `0001_legacy_schema.py` with revision ID `0001_legacy_schema`, no parent, and this exact upgrade body; its downgrade drops `verdicts` before `scans`:

```python
def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("image_b64", sa.Text(), nullable=False),
        sa.Column("image_meta", sa.JSON(), nullable=False),
        sa.Column("ocr_payload", sa.JSON(), nullable=False),
        sa.Column("overall_status", sa.String(), nullable=False),
    )
    op.create_table(
        "verdicts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scan_id", sa.Integer(), sa.ForeignKey("scans.id"), nullable=False),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("citation", sa.String(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("evidence_bboxes", sa.JSON(), nullable=False),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("rule_version", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("verdicts")
    op.drop_table("scans")
```

Implement `0002_inspection_v2.py` with batch operations so SQLite receives these columns:

```python
revision = "0002_inspection_v2"
down_revision = "0001_legacy_schema"


def upgrade() -> None:
    with op.batch_alter_table("scans") as batch:
        batch.add_column(sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("processing_status", sa.String(), nullable=False, server_default="complete"))
        batch.add_column(sa.Column("product_name", sa.String(), nullable=True))
        batch.add_column(sa.Column("quality_summary", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("extracted_fields", sa.JSON(), nullable=False, server_default="{}"))
        batch.add_column(sa.Column("analysis_version", sa.String(), nullable=False, server_default="legacy"))
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("failure_stage", sa.String(), nullable=True))
        batch.add_column(sa.Column("request_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("processing_error_code", sa.String(), nullable=True))
    with op.batch_alter_table("verdicts") as batch:
        batch.add_column(sa.Column("confidence", sa.Float(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("reasoning", sa.Text(), nullable=False, server_default="Legacy verdict"))
        batch.add_column(sa.Column("measurement_method", sa.String(), nullable=False, server_default="not_measurable"))
        batch.add_column(sa.Column("review_state", sa.String(), nullable=False, server_default="unreviewed"))


def downgrade() -> None:
    with op.batch_alter_table("verdicts") as batch:
        for name in ("review_state", "measurement_method", "reasoning", "confidence"):
            batch.drop_column(name)
    with op.batch_alter_table("scans") as batch:
        for name in (
            "processing_error_code", "request_id", "failure_stage", "updated_at",
            "analysis_version", "extracted_fields", "quality_summary",
            "product_name", "processing_status", "schema_version",
        ):
            batch.drop_column(name)
```

- [x] **Step 5: Implement legacy adoption and startup migration**

Create `backend/app/migrations.py`:

```python
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BASELINE_REVISION = "0001_legacy_schema"
HEAD_REVISION = "0002_inspection_v2"


def _config(db_path: str | Path) -> Config:
    root = Path(__file__).resolve().parent.parent
    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{Path(db_path)}")
    return config


def upgrade_database(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    config = _config(path)
    engine = create_engine(f"sqlite:///{path}")
    tables = set(inspect(engine).get_table_names())
    engine.dispose()
    if "scans" in tables and "alembic_version" not in tables:
        command.stamp(config, BASELINE_REVISION)
    command.upgrade(config, "head")
```

Change `init_db` to call `upgrade_database(path)` before constructing `SessionLocal`, remove `Base.metadata.create_all`, and make `main.DB_PATH` read `LMPC_DB_PATH` with default `lmpc.db`.

Serialize the complete inspect/stamp/upgrade region with a bounded Linux `flock` on the database file so concurrent application workers cannot race non-transactional SQLite DDL. Enable `PRAGMA foreign_keys=ON` on application, inspection, and Alembic engines. Before adopting a versionless database, validate the exact table/column set, SQLite type affinities, nullability, primary keys, the verdict-to-scan foreign key, and `PRAGMA foreign_key_check`. Dispose any previous application engine before rebinding. Update all `TestClient` fixtures to point the lifespan at their migrated temporary database rather than the real default database.

- [x] **Step 6: Run migrations and the full backend regression suite**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_migrations.py -q
.venv/bin/python -m pytest -q
```

Expected: both commands PASS; legacy scan ID 7 remains present.

- [x] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/alembic.ini backend/migrations backend/app/db.py backend/app/main.py backend/app/migrations.py backend/app/sqlite.py backend/tests/test_migrations.py backend/tests/test_health.py backend/tests/test_report_routes.py backend/tests/test_scan_routes.py docs/superpowers/plans/2026-09-07-inspection-intelligence.md
git commit -m "feat(backend): add migration foundation for inspection data"
```

## Task 2: Define the version-2 analysis contract

**Files:**
- Modify: `backend/app/domain.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/db.py`
- Modify: `backend/app/main.py`
- Create: `backend/app/errors.py`
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/components/VerdictBadge.tsx`
- Create: `backend/tests/test_analysis_contract.py`

**Interfaces:**
- Produces: `OCRLine`, `VisualMetric`, `QualitySummary`, `ExtractedFieldOut`, expanded `Verdict`, and `ScanAnalysisResponse`.
- Consumes: migration columns from Task 1.

- [x] **Step 1: Write contract tests**

Create `backend/tests/test_analysis_contract.py`:

```python
from pydantic import ValidationError
import pytest

from app.errors import error_body
from app.models import ScanRequest, VerdictOut


def test_v1_request_defaults_to_schema_one() -> None:
    request = ScanRequest(
        image_b64="aGVsbG8=",
        image_meta={"width": 10, "height": 10, "orientation": 1},
        ocr_payload=[{"text": "MRP", "confidence": 0.9, "bbox": [0.1, 0.1, 0.2, 0.2]}],
    )
    assert request.schema_version == 1
    assert request.ocr_lines == []


def test_bbox_outside_normalized_range_is_rejected() -> None:
    with pytest.raises(ValidationError):
        ScanRequest(
            image_b64="aGVsbG8=",
            image_meta={"width": 10, "height": 10},
            ocr_payload=[{"text": "MRP", "confidence": 0.9, "bbox": [1.1, 0, 0.2, 0.2]}],
        )


def test_manual_review_verdict_has_reason_and_method() -> None:
    verdict = VerdictOut(
        rule_id="r7_font_size", status="manual_review", severity="warning",
        citation="Rule 7", evidence="23 px", evidence_bboxes=[], confidence=0.6,
        reasoning="Scale is uncertain", measurement_method="relative_readability",
        failure_message=None, rule_version="2026-09",
    )
    assert verdict.status == "manual_review"


def test_app_error_uses_shared_envelope():
    body = error_body("invalid_image", "Image could not be decoded.", "request-1")
    assert body == {
        "error": "invalid_image",
        "detail": "Image could not be decoded.",
        "request_id": "request-1",
    }
```

- [x] **Step 2: Verify the tests fail**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_analysis_contract.py -q
```

Expected: FAIL because the version-2 DTOs do not exist.

- [x] **Step 3: Add exact domain values and DTO validation**

Add these exact domain types and equivalent Pydantic input/output models:

```python
MeasurementMethod = Literal[
    "direct_metadata", "geometry_estimate", "relative_readability", "not_measurable"
]
QualityStatus = Literal["acceptable", "usable_with_warnings", "retake_recommended", "unreadable"]
VerdictStatus = Literal["pass", "fail", "warn", "manual_review", "na"]
OverallStatus = Literal["pass", "fail", "mixed", "manual_review"]


@dataclass(frozen=True)
class OCRLine:
    word_indexes: tuple[int, ...]
    bbox: tuple[float, float, float, float]
    median_character_height: float


@dataclass(frozen=True)
class VisualMetric:
    name: str
    value: float
    unit: str
    confidence: float
    method: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class QualitySummary:
    status: QualityStatus
    score: float
    metrics: tuple[VisualMetric, ...]
    guidance: tuple[str, ...]


@dataclass(frozen=True)
class DecodedImage:
    image: np.ndarray
    width: int
    height: int
    metadata: dict[str, object]


@dataclass(frozen=True)
class PanelEstimate:
    bbox: tuple[float, float, float, float]
    confidence: float
    corners: tuple[tuple[float, float], ...] = ()
    physical_width_mm: float | None = None
    scale_method: MeasurementMethod = "not_measurable"


@dataclass(frozen=True)
class ReadabilityAssessment:
    score: float
    character_height_px: float
    estimated_mm: float | None
    error_mm: float | None
    method: MeasurementMethod
    scale_confidence: float
    status: VerdictStatus
    reasoning: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class PlacementResult:
    status: VerdictStatus
    relationship: str
    confidence: float
    reasoning: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class AnalysisInput:
    extracted: dict[str, ExtractedField]
    quality: QualitySummary
    readability: dict[str, ReadabilityAssessment]
    placement: dict[str, PlacementResult]


@dataclass(frozen=True)
class AnalysisResult:
    quality: QualitySummary
    extracted: dict[str, ExtractedField]
    verdicts: tuple[Verdict, ...]
    overall_status: OverallStatus
    analysis_version: str
```

Use a Pydantic `NormalizedBBox` annotated type whose four values are finite, `0 <= x,y,w,h <= 1`, `w,h > 0`, and `x+w <= 1`, `y+h <= 1`. Add `schema_version: Literal[1,2] = 1` and `ocr_lines: list[OCRLineIn] = Field(default_factory=list)` to `ScanRequest`. Extend verdict output with `confidence`, `reasoning`, and `measurement_method`.

Extend `ScanContext`/`ScanContextIn` with `imported: bool | None = None` and `inspection_date: date | None = None`. `None` means the evidence or operator has not established the value; the pipeline uses `date.today()` only for effective-date rule selection, never to fabricate product evidence. Define `ScanAnalysisResponse` with `scan_id`, `processing_status`, `quality`, `extracted_fields`, `verdicts`, `overall_status`, and `analysis_version`. Pydantic output DTOs use lists where the immutable domain types use tuples. Map `failure_stage`, `request_id`, and `processing_error_code` onto `Scan` for failed-pipeline audit records.

Mirror these exact enum strings and fields in `frontend/lib/types.ts`. Update SQLAlchemy models to map every Task-1 column.

Create `errors.py` with `AppError`, `error_body`, request-ID middleware, and handlers for application, FastAPI HTTP, and Pydantic request-validation errors. Register it in `main.py` now so inspection errors already use `{error, detail, request_id}`; the operations plan later reuses and extends this module.

- [x] **Step 4: Run contract and regression tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_analysis_contract.py tests/test_scan_routes.py tests/test_engine.py -q
cd /home/wind/Projects/sih/frontend
pnpm exec tsc --noEmit
```

Expected: all tests and type checking PASS; version-1 callers still validate.

- [x] **Step 5: Commit**

```bash
git add backend/app/domain.py backend/app/models.py backend/app/db.py backend/app/main.py backend/app/errors.py backend/tests/test_analysis_contract.py frontend/lib/types.ts frontend/components/VerdictBadge.tsx docs/superpowers/plans/2026-09-07-inspection-intelligence.md
git commit -m "feat: define versioned inspection analysis contract"
```

## Task 3: Group OCR words into stable lines

**Files:**
- Create: `frontend/lib/ocr-lines.ts`
- Modify: `frontend/lib/ocr.ts`
- Modify: `frontend/vitest.config.ts`
- Create: `frontend/tests/ocr-lines.test.ts`

**Interfaces:**
- Consumes: normalized `OCRWord[]`.
- Produces: `groupWordsIntoLines(words: OCRWord[]): OCRLine[]` and `OCRRunResult.lines`.

- [x] **Step 1: Write line-grouping tests**

Create `frontend/tests/ocr-lines.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { groupWordsIntoLines } from '@/lib/ocr-lines';

describe('groupWordsIntoLines', () => {
  it('groups horizontally aligned words and sorts them left-to-right', () => {
    const lines = groupWordsIntoLines([
      { text: '99', confidence: 0.9, bbox: [0.30, 0.10, 0.05, 0.04] },
      { text: 'MRP', confidence: 0.9, bbox: [0.10, 0.11, 0.10, 0.04] },
      { text: '500g', confidence: 0.9, bbox: [0.10, 0.40, 0.12, 0.05] },
    ]);
    expect(lines.map((line) => line.word_indexes)).toEqual([[1, 0], [2]]);
    expect(lines[0].median_character_height).toBeCloseTo(0.04);
  });

  it('drops zero-area boxes without mutating words', () => {
    const words = [{ text: 'x', confidence: 1, bbox: [0, 0, 0, 0.1] }] as const;
    expect(groupWordsIntoLines([...words])).toEqual([]);
    expect(words[0].bbox).toEqual([0, 0, 0, 0.1]);
  });
});
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/ocr-lines.test.ts`.

Expected: FAIL because `ocr-lines.ts` does not exist.

- [x] **Step 3: Implement deterministic grouping**

Create `frontend/lib/ocr-lines.ts` with this public algorithm:

```typescript
import type { OCRLine, OCRWord } from './types';

const centerY = (word: OCRWord) => word.bbox[1] + word.bbox[3] / 2;

export function groupWordsIntoLines(words: OCRWord[]): OCRLine[] {
  const indexed = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.bbox[2] > 0 && word.bbox[3] > 0)
    .sort((a, b) => centerY(a.word) - centerY(b.word) || a.word.bbox[0] - b.word.bbox[0]);
  const groups: Array<Array<{ word: OCRWord; index: number }>> = [];
  for (const item of indexed) {
    const match = groups.find((group) => {
      const medianHeight = group.map(({ word }) => word.bbox[3]).sort((a, b) => a - b)[Math.floor(group.length / 2)];
      const meanY = group.reduce((sum, value) => sum + centerY(value.word), 0) / group.length;
      return Math.abs(centerY(item.word) - meanY) <= Math.max(medianHeight, item.word.bbox[3]) * 0.6;
    });
    (match ?? groups[groups.push([]) - 1]).push(item);
  }
  return groups.map((group) => {
    group.sort((a, b) => a.word.bbox[0] - b.word.bbox[0]);
    const x0 = Math.min(...group.map(({ word }) => word.bbox[0]));
    const y0 = Math.min(...group.map(({ word }) => word.bbox[1]));
    const x1 = Math.max(...group.map(({ word }) => word.bbox[0] + word.bbox[2]));
    const y1 = Math.max(...group.map(({ word }) => word.bbox[1] + word.bbox[3]));
    const heights = group.map(({ word }) => word.bbox[3]).sort((a, b) => a - b);
    return {
      word_indexes: group.map(({ index }) => index),
      bbox: [x0, y0, x1 - x0, y1 - y0],
      median_character_height: heights[Math.floor(heights.length / 2)],
    };
  });
}
```

Add `lines: OCRLine[]` to `OCRRunResult` and return `groupWordsIntoLines(words)` from `runOCR`.

- [x] **Step 4: Run tests and type checking**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/ocr-lines.test.ts tests/bbox.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/lib/ocr-lines.ts frontend/lib/ocr.ts frontend/lib/types.ts frontend/vitest.config.ts frontend/tests/ocr-lines.test.ts docs/superpowers/plans/2026-09-07-inspection-intelligence.md
git commit -m "feat(frontend): retain OCR line geometry"
```

## Task 4: Compute bounded image-quality metrics

**Files:**
- Create: `backend/app/visual_analysis/__init__.py`
- Create: `backend/app/visual_analysis/image_io.py`
- Create: `backend/app/visual_analysis/quality.py`
- Create: `backend/app/visual_analysis/panel.py`
- Create: `backend/tests/test_visual_quality.py`

**Interfaces:**
- Produces: `decode_image(image_b64, max_bytes, max_pixels) -> DecodedImage`, `analyze_quality(decoded, words=()) -> QualitySummary`, and `estimate_panel(decoded, words) -> PanelEstimate`.
- Consumes: Task-2 `QualitySummary` and `VisualMetric`.

- [x] **Step 1: Write decoder and quality tests**

Create tests covering a valid checkerboard PNG, invalid base64, a 1-byte payload, byte limits, pixel limits, a decompression-bomb header, unsupported GIF/BMP content, a data-URL MIME/content mismatch, a flat low-contrast image, a blurred image, and a high-contrast sharp image. The principal assertions are:

```python
def test_flat_image_is_not_acceptable() -> None:
    image = np.full((200, 300, 3), 128, dtype=np.uint8)
    result = analyze_quality(DecodedImage(image=image, width=300, height=200, metadata={}), ())
    assert result.status in {"retake_recommended", "unreadable"}
    assert {metric.name for metric in result.metrics} >= {
        "sharpness", "contrast", "glare", "skew", "perspective",
        "text_coverage", "ocr_confidence_distribution",
    }


def test_invalid_base64_has_stable_error() -> None:
    with pytest.raises(ImageDecodeError, match="image_decode_failed"):
        decode_image("%%%", max_bytes=1_000_000, max_pixels=1_000_000)
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_visual_quality.py -q`.

Expected: FAIL because `visual_analysis` does not exist.

- [x] **Step 3: Implement bounded decoding**

`image_io.py` must:

```python
def decode_image(image_b64: str, *, max_bytes: int, max_pixels: int) -> DecodedImage:
    declared_type, payload = split_data_url(image_b64)
    try:
        raw = base64.b64decode(payload, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ImageDecodeError("image_decode_failed") from exc
    if not raw or len(raw) > max_bytes:
        raise ImageDecodeError("image_too_large" if len(raw) > max_bytes else "image_decode_failed")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            actual_type = probe.format
            width, height = probe.size
            if actual_type not in {"JPEG", "PNG", "WEBP"}:
                raise ImageDecodeError("invalid_image")
            if declared_type is not None and declared_type != mime_for(actual_type):
                raise ImageDecodeError("invalid_image")
            if width * height > max_pixels:
                raise ImageDecodeError("image_too_large")
            probe.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise ImageDecodeError("invalid_image") from exc
    encoded = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ImageDecodeError("image_decode_failed")
    return DecodedImage(image=image, width=width, height=height, metadata=_read_metadata(raw))
```

`split_data_url` accepts only raw base64 or `data:image/jpeg|png|webp;base64,...`; `mime_for` maps Pillow's detected format back to those three media types. `_read_metadata` uses Pillow to return orientation, DPI, and scanner/camera software tags when present. It never treats camera DPI as physical package scale.

- [x] **Step 4: Implement quality scoring**

Use grayscale Laplacian variance for sharpness, grayscale standard deviation for global contrast, fraction of pixels above 250 for glare, `cv2.minAreaRect` over edge pixels for skew, and largest quadrilateral contour geometry for perspective confidence. Compute text coverage as the union-area fraction of normalized OCR boxes and OCR-confidence distribution as the median and lower quartile encoded as two named metrics. Normalize every score metric to `0..100`. Apply configuration defaults:

```python
QUALITY_THRESHOLDS = {
    "sharpness_warn": 80.0,
    "sharpness_retake": 35.0,
    "contrast_warn": 30.0,
    "contrast_retake": 15.0,
    "glare_warn_fraction": 0.08,
    "glare_retake_fraction": 0.18,
    "skew_warn_degrees": 8.0,
    "skew_retake_degrees": 18.0,
}
```

Return `unreadable` only when both sharpness and contrast are below retake thresholds; return `retake_recommended` when any other retake threshold is crossed, `usable_with_warnings` for warn thresholds, and `acceptable` otherwise. Guidance strings are selected from a fixed map keyed by failed metric.

`panel.py` finds the largest plausible quadrilateral containing OCR-word centers, stores its normalized bounding box and corner points, and sets confidence from contour coverage, rectangularity, and OCR containment. When no plausible contour exists, it returns the full image bounds with confidence `0.0`; downstream placement therefore selects `manual_review`.

- [x] **Step 5: Run tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_visual_quality.py -q
.venv/bin/python -m ruff check app/visual_analysis tests/test_visual_quality.py
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/app/visual_analysis backend/tests/test_visual_quality.py
git commit -m "feat(backend): analyze label image quality"
```

## Task 5: Add automatic readability and physical-size policy

**Files:**
- Create: `backend/app/visual_analysis/readability.py`
- Modify: `backend/app/domain.py`
- Modify: `backend/app/rules.yaml`
- Modify: `backend/app/rules_loader.py`
- Create: `backend/tests/test_readability.py`

**Interfaces:**
- Produces: `assess_declaration_readability(...) -> ReadabilityAssessment` and `assess_fields(extracted, words, lines, quality, panel, rules) -> dict[str, ReadabilityAssessment]`.
- Produces: one assessment per declaration with `score`, pixel height, optional millimetres, method, scale confidence, status, and reasoning.

- [ ] **Step 1: Write policy tests**

Create table-driven tests for these exact cases:

```python
@pytest.mark.parametrize(
    ("physical_width_mm", "panel_confidence", "expected_method", "expected_status"),
    [
        (100.0, 0.95, "geometry_estimate", "pass"),
        (100.0, 0.60, "geometry_estimate", "manual_review"),
        (None, 0.95, "relative_readability", "manual_review"),
    ],
)
def test_scale_policy(physical_width_mm, panel_confidence, expected_method, expected_status):
    assessment = assess_declaration_readability(
        character_height_px=30,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=physical_width_mm,
        panel_confidence=panel_confidence,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.5,
    )
    assert assessment.method == expected_method
    assert assessment.status == expected_status


def test_camera_dpi_alone_never_creates_millimetres():
    assessment = assess_declaration_readability(
        character_height_px=30, image_width_px=1000, panel_width_px=800,
        physical_panel_width_mm=None, panel_confidence=1.0, ocr_confidence=0.95,
        local_contrast=80, local_sharpness=90, minimum_mm=2.5, dpi=300,
        dpi_source="camera",
    )
    assert assessment.estimated_mm is None
    assert assessment.status == "manual_review"
```

Also test boundary uncertainty: if `estimated_mm ± error_mm` crosses `minimum_mm`, status is `manual_review`.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_readability.py -q`.

Expected: FAIL because the assessment function does not exist.

- [ ] **Step 3: Implement the measurement decision**

Implement this policy in `readability.py`:

```python
def _readability_score(ocr: float, contrast: float, sharpness: float) -> float:
    return round(100 * (0.40 * ocr + 0.30 * contrast / 100 + 0.30 * sharpness / 100), 1)


def assess_declaration_readability(*, character_height_px: float, image_width_px: int,
    panel_width_px: float, physical_panel_width_mm: float | None, panel_confidence: float,
    ocr_confidence: float, local_contrast: float, local_sharpness: float,
    minimum_mm: float, dpi: float | None = None, dpi_source: str = "unknown") -> ReadabilityAssessment:
    score = _readability_score(ocr_confidence, local_contrast, local_sharpness)
    if physical_panel_width_mm is None or panel_width_px <= 0:
        return ReadabilityAssessment(score, character_height_px, None, None,
            "relative_readability", panel_confidence, "manual_review",
            "Physical scale cannot be established automatically from this image.")
    estimated_mm = character_height_px * physical_panel_width_mm / panel_width_px
    scale_confidence = panel_confidence
    error_mm = estimated_mm * (1 - scale_confidence)
    if scale_confidence < 0.80 or estimated_mm - error_mm < minimum_mm <= estimated_mm + error_mm:
        status = "manual_review"
        reasoning = "Measurement uncertainty could change the Rule 7 decision."
    else:
        status = "pass" if estimated_mm >= minimum_mm else "fail"
        reasoning = f"Estimated {estimated_mm:.2f} mm against {minimum_mm:.2f} mm minimum."
    return ReadabilityAssessment(score, character_height_px, round(estimated_mm, 2),
        round(error_mm, 2), "geometry_estimate", scale_confidence, status, reasoning)
```

Use `direct_metadata` only when decoded metadata identifies a flatbed/document scanner and contains valid X/Y resolution. Add configurable `enforcement_scale_confidence: 0.80` and `boundary_error_policy: manual_review` under `font_size_rules` in `rules.yaml`; validate both in `rules_loader.py`.

`geometry_estimate` may receive a physical panel dimension only from verified machine-readable package metadata or a configured, verified package template. It must never treat the commodity's declared dimensions as the package panel size.

`assess_fields` samples contrast and Laplacian sharpness inside each declaration's evidence union, uses the corresponding OCR line's median character height, and calculates character-height consistency as `1 - min(1, MAD / median)`. A consistency score below `0.60`, severe local glare, or evidence overlap adds a readability warning; it never creates a Rule 7 physical-size failure by itself.

- [ ] **Step 4: Run focused and rules regression tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_readability.py tests/test_rules_yaml.py -q
```

Expected: PASS; the existing two non-overlapping Rule 7 versions still load.

- [ ] **Step 5: Commit**

```bash
git add backend/app/visual_analysis/readability.py backend/app/domain.py backend/app/rules.yaml backend/app/rules_loader.py backend/tests/test_readability.py backend/tests/test_rules_yaml.py
git commit -m "feat(backend): add confidence-aware font and readability analysis"
```

## Task 6: Evaluate declaration placement

**Files:**
- Create: `backend/app/placement/__init__.py`
- Create: `backend/app/placement/geometry.py`
- Create: `backend/app/placement/evaluator.py`
- Create: `backend/tests/test_placement.py`

**Interfaces:**
- Produces: `evaluate_placement(field, panel, related_fields, mode) -> PlacementResult` and `assess_placements(extracted, panel, context, rules) -> dict[str, PlacementResult]`.
- Consumes: `ExtractedField` evidence boxes and panel estimate from visual analysis.

- [ ] **Step 1: Write geometry and uncertainty tests**

```python
def test_clipped_declaration_fails_with_sufficient_panel_confidence() -> None:
    result = evaluate_placement(
        field=_field("mrp", (0.92, 0.4, 0.12, 0.05)),
        panel=PanelEstimate((0.05, 0.05, 0.9, 0.9), confidence=0.95),
        related_fields={}, mode="retail_image",
    )
    assert result.status == "fail"
    assert result.relationship == "inside_visible_panel"


def test_uncertain_panel_requires_review_instead_of_failure() -> None:
    result = evaluate_placement(
        field=_field("mrp", (0.92, 0.4, 0.12, 0.05)),
        panel=PanelEstimate((0.05, 0.05, 0.9, 0.9), confidence=0.5),
        related_fields={}, mode="retail_image",
    )
    assert result.status == "manual_review"


def test_listing_mode_uses_viewport_visibility() -> None:
    result = evaluate_placement(
        field=_field("country_origin", (0.1, 0.2, 0.3, 0.04)), panel=None,
        related_fields={}, mode="ecommerce_listing",
    )
    assert result.relationship == "visible_in_submitted_screenshot"
```

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_placement.py -q`.

Expected: FAIL because `app.placement` does not exist.

- [ ] **Step 3: Implement focused box operations and evaluator**

`geometry.py` exposes `area`, `intersection`, `intersection_ratio`, `union`, `inside_ratio`, and `edge_distance`, all clamped to normalized coordinates. `evaluator.py` applies these constants:

```python
MIN_PANEL_CONFIDENCE = 0.80
INSIDE_RATIO_PASS = 0.98
EDGE_CLIP_TOLERANCE = 0.01
RELATED_GAP_MAX = 0.08
UNRELATED_OVERLAP_IOU_WARN = 0.25
```

Retail placement returns `manual_review` when panel confidence is below 0.80, `fail` when less than 98% of a declaration lies inside the panel, `warn` when it lies within 1% of an image edge, and `pass` otherwise. Screenshot placement tests whether the complete evidence box lies inside the submitted viewport. Related label/value pairs pass when their normalized edge gap is at most 0.08 and become `manual_review` when a required partner is absent. A declaration with IoU above `0.25` against an unrelated declaration returns `warn` with both evidence boxes so possible overlap/obscuring is visible to the reviewer.

- [ ] **Step 4: Run tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_placement.py -q
.venv/bin/python -m ruff check app/placement tests/test_placement.py
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/placement backend/tests/test_placement.py
git commit -m "feat(backend): add evidence-based placement checks"
```

## Task 7: Add the remaining declaration extractors and rule profiles

**Files:**
- Modify: `backend/app/extractors/common_name.py`
- Modify: `backend/app/extractors/country_origin.py`
- Create: `backend/app/extractors/best_before.py`
- Create: `backend/app/extractors/dimensions.py`
- Create: `backend/app/extractors/unit_price.py`
- Create: `backend/app/extractors/registry.py`
- Modify: `backend/app/extractors/__init__.py`
- Modify: `backend/app/rules.yaml`
- Modify: `backend/app/domain.py`
- Modify: `backend/app/rules_loader.py`
- Create: `backend/tests/test_extract_extended.py`

**Interfaces:**
- Produces: `extract_all(words, image_meta, context, rules) -> dict[str, ExtractedField | None]`.
- Produces configured fields: `common_name`, `country_origin`, `best_before`, `dimensions`, `unit_price`, and `importer_address`.

- [ ] **Step 1: Write table-driven extractor tests**

Use normalized word fixtures and assert value plus evidence boxes:

```python
@pytest.mark.parametrize(
    ("text", "field", "expected"),
    [
        ("Common name: Roasted Peanuts", "common_name", "Roasted Peanuts"),
        ("Country of Origin: India", "country_origin", "India"),
        ("Best Before 9 Months from Packing", "best_before", "9 Months from Packing"),
        ("Dimensions 20 cm x 10 cm x 5 cm", "dimensions", "20 cm x 10 cm x 5 cm"),
        ("Unit Sale Price ₹ 0.50/g", "unit_price", "₹ 0.50/g"),
        ("Imported by Acme India Pvt Ltd Mumbai 400001", "importer_address", "Acme India Pvt Ltd Mumbai 400001"),
    ],
)
def test_extended_extractors(text, field, expected, image_meta):
    words = words_from_line(text)
    result = extract_all(words, image_meta, ScanContext(), rules_for_test())[field]
    assert result is not None
    assert result.value == expected
    assert result.evidence_spans
```

Add negative cases for missing labels, non-metric dimensions, malformed price-per-unit, domestic mode without importer text, and screenshot text outside a visible box.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_extract_extended.py -q`.

Expected: FAIL for missing modules/registry.

- [ ] **Step 3: Implement extractors with named-label windows**

Each extractor must call shared line/word helpers, match a bounded case-insensitive label, return only the label’s line plus at most two following lines, calculate confidence as the mean of contributing words, and union their boxes. Use these anchored patterns:

```python
PATTERNS = {
    "common_name": r"(?i)\b(?:common|generic)\s+name\s*[:\-]?\s*(.+)$",
    "country_origin": r"(?i)\b(?:country\s+of\s+origin|made|manufactured)\s+(?:in\s*)?[:\-]?\s*([A-Za-z][A-Za-z .'-]+)$",
    "best_before": r"(?i)\b(?:best\s+before|use\s+by|expiry|expires?)\s*[:\-]?\s*(.+)$",
    "dimensions": r"(?i)\b(?:dimensions?|size)\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2})",
    "unit_price": r"(?i)\b(?:unit\s+sale\s+price|price\s+per\s+unit)\s*[:\-]?\s*((?:₹|rs\.?|inr)\s*\d+(?:\.\d{1,2})?\s*/\s*(?:g|kg|ml|l|piece|unit))",
    "importer_address": r"(?i)\bimported\s+by\s*[:\-]?\s*(.+)$",
}
```

Register extractors by field name in `registry.py`; `scan_routes.py` will no longer call extractors one-by-one after Task 9.

- [ ] **Step 4: Extend the rules schema and YAML**

Add `applies_when` with allowed keys `mode_in`, `category_in`, `imported`, and `context_required`; add `placement` and `readability` blocks to `CheckConfig`. Add these configured IDs and citations:

```yaml
- {rule_id: r6_1_b_common_name, field: common_name, citation: "Rule 6(1)(b) of LMPC Rules 2011"}
- {rule_id: r6_1_aa_country_origin, field: country_origin, citation: "Rule 6(1)(aa) of LMPC Rules 2011"}
- {rule_id: r6_1_da_best_before, field: best_before, citation: "Rule 6(1)(da) of LMPC Rules 2011"}
- {rule_id: r6_1_f_dimensions, field: dimensions, citation: "Rule 6(1)(f) of LMPC Rules 2011"}
- {rule_id: r6_11_unit_sale_price, field: unit_price, citation: "Rule 6(11) of LMPC Rules 2011"}
- {rule_id: r6_10_ecommerce_declarations, field: listing_declarations, citation: "Rule 6(10) of LMPC Rules 2011"}
- {rule_id: r7_font_size, field: declaration_readability, citation: "Rule 7 of LMPC Rules 2011"}
```

Country-of-origin and importer requirements use `imported: true`; screenshot aggregation uses `mode_in: [ecommerce_listing]`; physical placement/font checks use `mode_in: [retail_image]`. Unit sale price carries the effective date and exemption encoded in `rules.yaml`. If imported status or another required applicability fact is unknown, `context_required` makes the affected verdict `manual_review`.

- [ ] **Step 5: Run focused and schema tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_extract_extended.py tests/test_rules_yaml.py -q
```

Expected: PASS; all enabled checks have unique IDs, verified citations, registered extractors, and valid applicability.

- [ ] **Step 6: Commit**

```bash
git add backend/app/extractors backend/app/rules.yaml backend/app/domain.py backend/app/rules_loader.py backend/tests/test_extract_extended.py backend/tests/test_rules_yaml.py
git commit -m "feat(backend): expand LMPC declaration coverage"
```

## Task 8: Make the engine confidence-aware

**Files:**
- Modify: `backend/app/engine.py`
- Modify: `backend/app/domain.py`
- Modify: `backend/tests/test_engine.py`

**Interfaces:**
- Consumes: extracted fields, quality/readability/placement evidence, and rule applicability.
- Produces: `run_engine(AnalysisInput, RulesConfig, ScanContext) -> list[Verdict]`.

- [ ] **Step 1: Add failing status-precedence and evidence-sufficiency tests**

```python
def test_missing_field_with_unreadable_evidence_requires_review(rules):
    result = run_engine(_analysis(quality="retake_recommended", extracted={}), rules, ScanContext())
    assert _by_id(result)["r6_1_e_mrp"].status == "manual_review"


def test_missing_field_with_good_evidence_fails(rules):
    result = run_engine(_analysis(quality="acceptable", extracted={}), rules, ScanContext())
    assert _by_id(result)["r6_1_e_mrp"].status == "fail"


def test_overall_precedence():
    assert overall_status([_verdict("warn"), _verdict("manual_review")]) == "manual_review"
    assert overall_status([_verdict("manual_review"), _verdict("fail")]) == "fail"
```

Also change the old “confidence below warn threshold fails” assertion: low OCR confidence now becomes `manual_review` unless independent high-confidence evidence proves malformed content.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_engine.py -q`.

Expected: FAIL because the current engine maps low confidence to `fail` and lacks `manual_review`.

- [ ] **Step 3: Implement evidence-sufficiency gates**

Use this decision order per applicable rule:

```python
if not applicability.has_required_context:
    status = "manual_review"
elif applicability.skipped:
    status = "na"
elif not evidence.sufficient_to_judge_absence:
    status = "manual_review"
elif required_subfield_missing_or_malformed:
    status = "fail"
elif readability.status == "manual_review" or placement.status == "manual_review":
    status = "manual_review"
elif readability.status == "fail" or placement.status == "fail":
    status = "fail"
elif warning_present:
    status = "warn"
else:
    status = "pass"
```

Every branch sets a non-empty `reasoning`, confidence from the weakest required evidence, the applicable measurement method, and relevant boxes. Add pure `overall_status(verdicts)` using the specified precedence.

- [ ] **Step 4: Run engine and extractor regressions**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_engine.py tests/test_extract_*.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine.py backend/app/domain.py backend/tests/test_engine.py
git commit -m "feat(backend): distinguish noncompliance from uncertain evidence"
```

## Task 9: Integrate and persist the analysis pipeline

**Files:**
- Create: `backend/app/analysis_pipeline.py`
- Modify: `backend/app/scan_routes.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/db.py`
- Modify: `backend/tests/test_scan_routes.py`
- Create: `backend/tests/test_analysis_pipeline.py`

**Interfaces:**
- Produces: `analyze_scan(request: ScanRequest, rules: RulesConfig) -> AnalysisResult`.
- Persists: quality summary, extracted fields, analysis version, expanded verdict evidence.

- [ ] **Step 1: Replace the fake image fixture and add API tests**

Use Pillow in tests to create a real in-memory PNG. Add assertions:

```python
def test_scan_v2_returns_and_persists_analysis(client, complete_payload):
    complete_payload["schema_version"] = 2
    complete_payload["ocr_lines"] = [{
        "word_indexes": [0, 1], "bbox": [0.02, 0.03, 0.23, 0.06],
        "median_character_height": 0.06,
    }]
    response = client.post("/api/scan", json=complete_payload)
    assert response.status_code == 201
    body = response.json()
    assert body["quality"]["status"] in {
        "acceptable", "usable_with_warnings", "retake_recommended"
    }
    assert body["analysis_version"] == "inspection-v2"
    stored = client.get(f"/api/scan/{body['scan_id']}").json()
    assert stored["scan"]["quality_summary"] == body["quality"]
    assert all("reasoning" in verdict for verdict in body["verdicts"])


def test_bad_image_has_error_envelope(client, complete_payload):
    complete_payload["image_b64"] = "not-base64"
    response = client.post("/api/scan", json=complete_payload)
    assert response.status_code == 422
    assert set(response.json()) == {"error", "detail", "request_id"}
```

- [ ] **Step 2: Verify failure**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_analysis_pipeline.py tests/test_scan_routes.py -q
```

Expected: FAIL because the route has no version-2 pipeline.

- [ ] **Step 3: Implement orchestration without embedding algorithms in the route**

`analysis_pipeline.analyze_scan` must perform exactly this sequence:

```python
decoded = decode_image(request.image_b64, max_bytes=10_000_000, max_pixels=24_000_000)
words, lines = normalize_ocr(request.ocr_payload, request.ocr_lines)
if not words:
    raise AppError(422, "no_text_extracted", "No usable text was found; retake or replace the evidence image.")
quality = analyze_quality(decoded, words)
if quality.status == "unreadable":
    raise AppError(422, "image_unreadable", "; ".join(quality.guidance))
panel = estimate_panel(decoded, words)
context = ScanContext(
    mode=request.scan_context.mode,
    category=request.scan_context.category,
    imported=request.scan_context.imported,
    inspection_date=request.scan_context.inspection_date,
)
image_meta = ImageMeta(**request.image_meta.model_dump())
extracted = extract_all(words, image_meta, context, rules)
readability = assess_fields(extracted, words, lines, quality, panel, rules)
placement = assess_placements(extracted, panel, context, rules)
verdicts = run_engine(AnalysisInput(extracted, quality, readability, placement), rules, context)
return AnalysisResult(
    quality=quality,
    extracted=extracted,
    verdicts=tuple(verdicts),
    overall_status=overall_status(verdicts),
    analysis_version="inspection-v2",
)
```

Define `normalize_ocr` in `analysis_pipeline.py`: convert DTOs to domain values, discard no valid version-2 line, reject an out-of-range word index, and reconstruct line groups from word geometry for version-1 requests. `scan_routes.create_scan` creates a `processing_status="processing"` row with the middleware request ID, calls the pipeline once, then atomically replaces its analysis fields and sets `processing_status="complete"`. A caught pipeline error rolls back partial verdicts, stores `processing_status="failed"`, `failure_stage`, request ID, and a stable `processing_error_code`; expected `AppError` values retain their 4xx response and unexpected exceptions return the shared 500 envelope. No failure serializes a partial result as complete. Map image decode exceptions to 400 `invalid_image`, 413 `image_too_large`, or 422 `image_decode_failed`; map empty OCR and unreadable quality to the explicit 422 errors above. `get_scan` returns the same stored analysis fields.

- [ ] **Step 4: Run API and report regressions**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_analysis_pipeline.py tests/test_scan_routes.py tests/test_report_routes.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS; version-1 request tests remain green through defaults.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analysis_pipeline.py backend/app/scan_routes.py backend/app/models.py backend/app/db.py backend/tests/test_analysis_pipeline.py backend/tests/test_scan_routes.py
git commit -m "feat(backend): integrate inspection intelligence pipeline"
```

## Task 10: Send mode and line evidence from the current frontend

**Files:**
- Modify: `frontend/components/UploadDropzone.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/scan/[id]/page.tsx`
- Modify: `frontend/components/AnnotatedImage.tsx`
- Modify: `frontend/components/VerdictBadge.tsx`
- Modify: `frontend/components/VerdictCard.tsx`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/types.ts`
- Create: `frontend/tests/scan-contract.test.ts`

**Interfaces:**
- Emits: `ScanRequest` schema version 2 with selected mode and OCR lines.
- Displays: quality guidance and all five status values.

- [ ] **Step 1: Add serialization and status tests**

Extract `buildScanRequest` from the dropzone and test:

```typescript
it('emits the version-2 listing contract', () => {
  const request = buildScanRequest(ocrFixture, {
    mode: 'ecommerce_listing', category: 'unknown', imported: null,
  });
  expect(request.schema_version).toBe(2);
  expect(request.scan_context.mode).toBe('ecommerce_listing');
  expect(request.ocr_lines).toHaveLength(1);
});

it('uses manual-review status without collapsing it to warn', () => {
  expect(statusLabel('manual_review')).toBe('Manual review');
  expect(statusClass('manual_review')).toContain('review');
});
```

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/scan-contract.test.ts`.

Expected: FAIL because the helpers and status do not exist.

- [ ] **Step 3: Update request construction and minimal phase UI**

Add an explicit two-option mode control with values `retail_image` and `ecommerce_listing`, a category selector, and an import-context selector with `Domestic`, `Imported`, and `Not sure` mapped to `false`, `true`, and `null`. Do not request font size, DPI, package dimensions, or calibration. Change upload copy and `capture` behavior by mode, and send:

```typescript
return {
  schema_version: 2,
  image_b64: ocr.imageDataUrl.split(',', 2)[1],
  image_meta: { width: ocr.imageWidth, height: ocr.imageHeight, orientation: 1 },
  ocr_payload: ocr.words,
  ocr_lines: ocr.lines,
  scan_context: { mode, category, imported },
};
```

Render quality status and every guidance item above verdicts. Add violet `manual_review` overlay strokes and badge treatment, plus reasoning, confidence, and measurement method in `VerdictCard`. Retain text labels so status is not color-only.

- [ ] **Step 4: Run frontend and end-to-end phase checks**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest -q
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx 'frontend/app/scan/[id]/page.tsx' frontend/components/UploadDropzone.tsx frontend/components/AnnotatedImage.tsx frontend/components/VerdictBadge.tsx frontend/components/VerdictCard.tsx frontend/lib/api.ts frontend/lib/ocr.ts frontend/lib/ocr-lines.ts frontend/lib/types.ts frontend/tests/scan-contract.test.ts
git commit -m "feat(frontend): support retail and screenshot analysis results"
```

## Inspection intelligence completion gate

- [ ] Run `cd backend && .venv/bin/python -m pytest -q && .venv/bin/python -m ruff check app tests`.
- [ ] Run `cd frontend && pnpm test:run && pnpm exec tsc --noEmit && pnpm build`.
- [ ] Upgrade a copy of a pre-Alembic database and verify its scan IDs and report downloads.
- [ ] Confirm a low-quality image produces guidance/manual review instead of false noncompliance.
- [ ] Confirm listing mode never runs physical-only placement/font checks.
- [ ] Commit any gate-only fixes as `fix: close inspection intelligence verification gaps`.
