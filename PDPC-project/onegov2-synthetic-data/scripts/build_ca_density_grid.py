"""Build a Netherlands cellular-automaton density grid from PDOK/CBS buurten.

The grid is intentionally compact for browser simulation. Each cell center is
tested against CBS Wijk- en Buurtkaart 2024 buurt polygons and receives the
buurt's population density in inhabitants per km2.
"""

from __future__ import annotations

import json
import math
import time
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlencode


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = REPO_ROOT / "src" / "data" / "netherlandsCaDensity.json"

PDOK_BUURTEN_URL = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/buurten/items"
SOURCE_URL = "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1?f=html&lang=nl"

WIDTH = 190
HEIGHT = 230
BBOX = (3.1, 50.68, 7.32, 53.67)  # lon_min, lat_min, lon_max, lat_max


def clean_number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number <= -99990:
        return default
    return number


def fetch_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response)


def next_url(payload: dict[str, Any]) -> str | None:
    for link in payload.get("links", []):
        if link.get("rel") == "next":
            return link.get("href")
    return None


def fetch_features() -> list[dict[str, Any]]:
    params = urlencode({"f": "json", "limit": 1000})
    url: str | None = f"{PDOK_BUURTEN_URL}?{params}"
    features: list[dict[str, Any]] = []
    page = 0

    while url:
        page += 1
        payload = fetch_json(url)
        batch = payload.get("features", [])
        features.extend(batch)
        print(f"Fetched page {page}: {len(batch)} features")
        url = next_url(payload)
        time.sleep(0.08)

    return features


def ring_bbox(ring: list[list[float]]) -> tuple[float, float, float, float]:
    return (
        min(point[0] for point in ring),
        min(point[1] for point in ring),
        max(point[0] for point in ring),
        max(point[1] for point in ring),
    )


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        xi, yi = point
        xj, yj = ring[j]
        crosses = (yi > lat) != (yj > lat)
        if crosses:
            x_at_lat = (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
            if lon < x_at_lat:
                inside = not inside
        j = i
    return inside


def point_in_polygon(lon: float, lat: float, polygon: list[list[list[float]]]) -> bool:
    if not polygon or not point_in_ring(lon, lat, polygon[0]):
        return False
    return not any(point_in_ring(lon, lat, hole) for hole in polygon[1:])


def iter_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    if geometry.get("type") == "Polygon":
        return [geometry["coordinates"]]
    if geometry.get("type") == "MultiPolygon":
        return geometry["coordinates"]
    return []


def lon_for_x(x: int) -> float:
    lon_min, _, lon_max, _ = BBOX
    return lon_min + (x + 0.5) / WIDTH * (lon_max - lon_min)


def lat_for_y(y: int) -> float:
    _, lat_min, _, lat_max = BBOX
    return lat_max - (y + 0.5) / HEIGHT * (lat_max - lat_min)


def cell_range(min_value: float, max_value: float, global_min: float, global_max: float, count: int, invert = False) -> range:
    if invert:
        start = math.floor((global_max - max_value) / (global_max - global_min) * count)
        end = math.ceil((global_max - min_value) / (global_max - global_min) * count)
    else:
        start = math.floor((min_value - global_min) / (global_max - global_min) * count)
        end = math.ceil((max_value - global_min) / (global_max - global_min) * count)
    return range(max(0, start), min(count, end))


def build_grid(features: list[dict[str, Any]]) -> dict[str, Any]:
    density = [0 for _ in range(WIDTH * HEIGHT)]
    population = [0 for _ in range(WIDTH * HEIGHT)]
    mask = [0 for _ in range(WIDTH * HEIGHT)]
    names = ["" for _ in range(WIDTH * HEIGHT)]
    assigned = [0 for _ in range(WIDTH * HEIGHT)]
    lon_min, lat_min, lon_max, lat_max = BBOX

    usable_features = []
    total_population = 0
    for feature in features:
        props = feature.get("properties", {})
        if props.get("gemeentecode") == "GM0998":
            continue
        inwoners = clean_number(props.get("aantal_inwoners"))
        density_value = clean_number(props.get("bevolkingsdichtheid_inwoners_per_km2"))
        land_ha = clean_number(props.get("oppervlakte_land_in_ha"))
        if land_ha <= 0 and inwoners <= 0:
            continue
        usable_features.append(feature)
        total_population += inwoners

    for feature in usable_features:
        props = feature.get("properties", {})
        inwoners = round(clean_number(props.get("aantal_inwoners")))
        density_value = round(clean_number(props.get("bevolkingsdichtheid_inwoners_per_km2")))
        name = props.get("buurtnaam") or props.get("gemeentenaam") or ""

        for polygon in iter_polygons(feature.get("geometry", {})):
            exterior = polygon[0]
            min_lon, min_lat, max_lon, max_lat = ring_bbox(exterior)
            if max_lon < lon_min or min_lon > lon_max or max_lat < lat_min or min_lat > lat_max:
                continue

            candidate_cells: list[int] = []
            for y in cell_range(min_lat, max_lat, lat_min, lat_max, HEIGHT, invert=True):
                lat = lat_for_y(y)
                for x in cell_range(min_lon, max_lon, lon_min, lon_max, WIDTH):
                    lon = lon_for_x(x)
                    if point_in_polygon(lon, lat, polygon):
                        idx = y * WIDTH + x
                        candidate_cells.append(idx)
                        mask[idx] = 1
                        if density_value >= density[idx]:
                            density[idx] = density_value
                            names[idx] = str(name)

            if candidate_cells and inwoners > 0:
                share = inwoners / len(candidate_cells)
                for idx in candidate_cells:
                    population[idx] += round(share)
                    assigned[idx] += 1

    nonzero_density = [value for value in density if value > 0]
    sorted_density = sorted(nonzero_density)
    p95 = sorted_density[round((len(sorted_density) - 1) * 0.95)] if sorted_density else 0
    p99 = sorted_density[round((len(sorted_density) - 1) * 0.99)] if sorted_density else 0

    return {
        "metadata": {
            "source": "CBS/PDOK Wijk- en Buurtkaart 2024 OGC API, buurten collection",
            "sourceUrl": SOURCE_URL,
            "generatedFrom": PDOK_BUURTEN_URL,
            "method": "Cell centers rasterized from buurt polygons; density is bevolkingsdichtheid_inwoners_per_km2.",
            "totalPopulationFromFeatures": round(total_population),
            "width": WIDTH,
            "height": HEIGHT,
            "bbox": BBOX,
            "densityP95": p95,
            "densityP99": p99,
            "activeCells": sum(mask),
        },
        "width": WIDTH,
        "height": HEIGHT,
        "bbox": BBOX,
        "density": density,
        "population": population,
        "mask": mask,
        "names": names,
    }


def main() -> None:
    features = fetch_features()
    payload = build_grid(features)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT} with {payload['metadata']['activeCells']} active cells "
        f"and population {payload['metadata']['totalPopulationFromFeatures']}"
    )


if __name__ == "__main__":
    main()
