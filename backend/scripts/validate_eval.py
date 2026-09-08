"""Validate an evaluation dataset and report its immutable evidence summary."""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from app.evaluation import DatasetError, dataset_digest, load_dataset


def _formatted_counts(counts: Counter[str]) -> str:
    return ", ".join(f"{key}={counts[key]}" for key in sorted(counts)) or "none"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset",
        type=Path,
        required=True,
        help="directory containing manifest.csv and ground_truth.jsonl",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        dataset = load_dataset(args.dataset, split="all")
    except DatasetError as error:
        print(f"dataset validation failed: {error}", file=sys.stderr)
        return 2

    manifests = [example.manifest for example in dataset.examples]
    verdicts = [
        (rule_id, verdict.status)
        for example in dataset.examples
        for rule_id, verdict in example.ground_truth.verdicts.items()
    ]
    print(f"examples: {len(dataset.examples)}")
    print(f"splits: {_formatted_counts(Counter(row.split for row in manifests))}")
    print(f"modes: {_formatted_counts(Counter(row.mode for row in manifests))}")
    print(f"sources: {_formatted_counts(Counter(row.source_classification for row in manifests))}")
    print(f"statuses: {_formatted_counts(Counter(status for _, status in verdicts))}")
    print(f"rules: {_formatted_counts(Counter(rule_id for rule_id, _ in verdicts))}")
    print(f"dataset_digest: {dataset_digest(dataset)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
