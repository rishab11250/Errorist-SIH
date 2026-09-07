"""Evidence-based declaration placement checks."""

from app.placement.evaluator import assess_placements, evaluate_placement
from app.placement.geometry import (
    area,
    edge_distance,
    inside_ratio,
    intersection,
    intersection_ratio,
    union,
)

__all__ = [
    "area",
    "assess_placements",
    "edge_distance",
    "evaluate_placement",
    "inside_ratio",
    "intersection",
    "intersection_ratio",
    "union",
]
