"""Normalized bounding-box operations used by placement analysis."""

from __future__ import annotations

import math

BBox = tuple[float, float, float, float]


def _bounds(box: BBox) -> tuple[float, float, float, float]:
    x, y, width, height = box
    left = min(1.0, max(0.0, float(x)))
    top = min(1.0, max(0.0, float(y)))
    right = min(1.0, max(0.0, float(x) + max(0.0, float(width))))
    bottom = min(1.0, max(0.0, float(y) + max(0.0, float(height))))
    return left, top, max(left, right), max(top, bottom)


def _box(bounds: tuple[float, float, float, float]) -> BBox:
    left, top, right, bottom = bounds
    return left, top, max(0.0, right - left), max(0.0, bottom - top)


def area(box: BBox) -> float:
    """Return the area of a box after clipping it to normalized bounds."""

    _, _, width, height = _box(_bounds(box))
    return width * height


def intersection(first: BBox, second: BBox) -> BBox:
    """Return the normalized intersection of two boxes."""

    first_left, first_top, first_right, first_bottom = _bounds(first)
    second_left, second_top, second_right, second_bottom = _bounds(second)
    return _box(
        (
            max(first_left, second_left),
            max(first_top, second_top),
            min(first_right, second_right),
            min(first_bottom, second_bottom),
        )
    )


def intersection_ratio(first: BBox, second: BBox) -> float:
    """Return the fraction of the first box covered by the second."""

    first_area = area(first)
    return area(intersection(first, second)) / first_area if first_area > 0 else 0.0


def union(first: BBox, second: BBox) -> BBox:
    """Return the smallest normalized box enclosing both inputs."""

    first_left, first_top, first_right, first_bottom = _bounds(first)
    second_left, second_top, second_right, second_bottom = _bounds(second)
    return _box(
        (
            min(first_left, second_left),
            min(first_top, second_top),
            max(first_right, second_right),
            max(first_bottom, second_bottom),
        )
    )


def inside_ratio(inner: BBox, outer: BBox) -> float:
    """Return the normalized fraction of ``inner`` that lies in ``outer``."""

    return intersection_ratio(inner, outer)


def edge_distance(first: BBox, second: BBox) -> float:
    """Return the shortest normalized edge-to-edge distance between two boxes."""

    first_left, first_top, first_right, first_bottom = _bounds(first)
    second_left, second_top, second_right, second_bottom = _bounds(second)
    horizontal = max(second_left - first_right, first_left - second_right, 0.0)
    vertical = max(second_top - first_bottom, first_top - second_bottom, 0.0)
    return math.hypot(horizontal, vertical)
