"""Build per-city synthetic profiles from the CBS "NL and big cities" Kerncijfers
export, for nation mode (real city-wide averages) and per-city tabs (real
buurt-level detail).

Stdlib only (no pandas) so it runs anywhere. Buurt centroids come from the PDOK
Wijk- en Buurtkaart 2024 OGC API (same source as the Hague pipeline).

Output: src/data/cityProfiles.json
  {
    nationalContext, mobilityBaseline,
    cities: [{ id, name, gemeenteCode, lat, lon, average, buurten:[...] }]
  }

The `average` profile (city-wide CBS averages) is the node used in nation mode;
`buurten` are the detailed profiles used when a city tab is selected. Den Haag's
detailed buurten already live in dutchProfiles.json (hagueProfiles), so only its
average node is produced here.
"""

from __future__ import annotations

import csv
import json
import math
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
KERN_DIR = WORKSPACE_ROOT / "CSV-kerncijfers"
OUTPUT = REPO_ROOT / "src" / "data" / "cityProfiles.json"

BIG_CITIES_CSV = KERN_DIR / "Kerncijfers_wijken_en_buurten_NL_and_Big_Cities.csv"
NATIONAL_CSV = KERN_DIR / "Kerncijfers_wijken_en_buurten_National_and_DenHaag.csv"

SCHIPHOL = (52.3105, 4.7683)

# id, display name, gemeentecode, centre (lat, lon), whether to build buurt detail here
CITIES = [
    ("amsterdam", "Amsterdam", "GM0363", (52.3676, 4.9041), True),
    ("rotterdam", "Rotterdam", "GM0599", (51.9244, 4.4777), True),
    ("denhaag", "Den Haag", "GM0518", (52.0705, 4.3007), False),  # detail = hagueProfiles
    ("utrecht", "Utrecht", "GM0344", (52.0907, 5.1214), True),
    ("eindhoven", "Eindhoven", "GM0772", (51.4416, 5.4697), True),
    ("groningen", "Groningen", "GM0014", (53.2194, 6.5665), True),
    ("arnhem", "Arnhem", "GM0202", (51.9851, 5.8987), True),
    ("leeuwarden", "Leeuwarden", "GM0080", (53.2012, 5.7999), True),
]

# --- column headers (exact CBS StatLine names) -----------------------------
C_CODE = "Regioaanduiding/Codering (code)"
C_TYPE = "Regioaanduiding/Soort regio (omschrijving)"
C_NAME = "Wijken en buurten"
C_POP = "Bevolking/Aantal inwoners (aantal)"
C_AGE = {
    "0-14": "Bevolking/Leeftijdsgroepen/0 tot 15 jaar (aantal)",
    "15-24": "Bevolking/Leeftijdsgroepen/15 tot 25 jaar (aantal)",
    "25-44": "Bevolking/Leeftijdsgroepen/25 tot 45 jaar (aantal)",
    "45-64": "Bevolking/Leeftijdsgroepen/45 tot 65 jaar (aantal)",
    "65+": "Bevolking/Leeftijdsgroepen/65 jaar of ouder (aantal)",
}
C_HH_TOTAL = "Bevolking/Particuliere huishoudens/Huishoudens totaal (aantal)"
C_HH_SINGLE = "Bevolking/Particuliere huishoudens/Eenpersoonshuishoudens (aantal)"
C_HH_NOKIDS = "Bevolking/Particuliere huishoudens/Huishoudens zonder kinderen (aantal)"
C_HH_KIDS = "Bevolking/Particuliere huishoudens/Huishoudens met kinderen (aantal)"
C_DENSITY = "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)"
C_MULTI = "Wonen en vastgoed/Woningen naar type/Percentage meergezinswoning (%)"
C_SINGLEFAM = "Wonen en vastgoed/Woningen naar type/Percentage eengezinswoning (%)"
C_DETACHED = "Wonen en vastgoed/Woningen naar type/Percentage vrijstaande woning (eengezins (%)"
C_SEMI = "Wonen en vastgoed/Woningen naar type/Percentage twee-onder-één-kap-woning (ee (%)"
C_INCOME = "Inkomen/Huishoudens/Gem. gestandaardiseerd inkomen (x 1 000 euro)"
C_URBAN = "Stedelijkheid/Mate van stedelijkheid (code)"
C_AREA = "Oppervlakte/Oppervlakte totaal (ha)"
C_WATER = "Oppervlakte/Oppervlakte water (ha)"
C_NONEU = "Bevolking/Bevolking naar herkomst/Herkomstland/Buiten Europa  (aantal)"
C_LABOR = "Arbeid/Nettoarbeidsparticipatie (%)"
SBI = "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/"
C_SBI = {
    "oqz": SBI + "O-Q Overheid, onderwijs en zorg (aantal)",
    "industry": SBI + "B-F Nijverheid en energie (aantal)",
    "services_mn": SBI + "M-N Zakelijke dienstverlening (aantal)",
    "services_kl": SBI + "K-L Financiële diensten, onroerend goed (aantal)",
    "logistics": SBI + "H+J Vervoer, informatie en communicatie (aantal)",
    "horeca": SBI + "G+I Handel en horeca (aantal)",
    "culture": SBI + "R-U Cultuur, recreatie, overige diensten (aantal)",
}


def to_float(value: Any, default: float = 0.0) -> float:
    text = str(value or "").replace("﻿", "").strip()
    if not text or text in {".", "-99997", "-99998", "-99999"}:
        return default
    text = text.replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return default


def clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def clean(value: Any) -> str:
    return str(value or "").replace("﻿", "").strip()


def normalise(weights: dict[str, float], fallback: dict[str, float]) -> dict[str, float]:
    safe = {k: max(0.0, float(v)) for k, v in weights.items()}
    total = sum(safe.values())
    if total <= 0:
        safe = dict(fallback)
        total = sum(safe.values())
    return {k: v / total for k, v in safe.items()}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    x = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter=";"))


def g(row: dict[str, str], col: str, default: float = 0.0) -> float:
    return to_float(row.get(col), default)


# --- feature extractors (mirror build_dutch_profiles transformations) -------
def age_distribution(row):
    return normalise(
        {band: g(row, col) for band, col in C_AGE.items()},
        {"0-14": 0.16, "15-24": 0.13, "25-44": 0.28, "45-64": 0.26, "65+": 0.17},
    )


def household_mix(row):
    total = g(row, C_HH_TOTAL)
    single = g(row, C_HH_SINGLE)
    nokids = g(row, C_HH_NOKIDS)
    kids = g(row, C_HH_KIDS)
    if total <= 0:
        return {"single": 0.42, "couple": 0.22, "family": 0.27, "shared": 0.06, "multigen": 0.03}
    return normalise(
        {
            "single": single / total,
            "couple": max(0, nokids - single * 0.15) / total,
            "family": kids / total,
            "shared": 0.045,
            "multigen": 0.03,
        },
        {"single": 0.42, "couple": 0.22, "family": 0.27, "shared": 0.06, "multigen": 0.03},
    )


def housing_mix(row):
    apartment = g(row, C_MULTI) / 100
    detached = (g(row, C_DETACHED) + g(row, C_SEMI)) / 100
    row_house = max(0.0, g(row, C_SINGLEFAM) / 100 - detached)
    return normalise(
        {"apartment": apartment, "row-house": row_house, "detached": detached},
        {"apartment": 0.7, "row-house": 0.27, "detached": 0.03},
    )


def work_sector_mix(row):
    return normalise(
        {
            "healthcare": g(row, C_SBI["oqz"]) * 0.55,
            "education": g(row, C_SBI["oqz"]) * 0.25,
            "industry": g(row, C_SBI["industry"]),
            "services": g(row, C_SBI["services_mn"]) + g(row, C_SBI["services_kl"]),
            "logistics": g(row, C_SBI["logistics"]),
            "hospitality": g(row, C_SBI["horeca"]) + g(row, C_SBI["culture"]) * 0.35,
        },
        {"healthcare": 0.18, "education": 0.13, "industry": 0.08, "services": 0.34, "logistics": 0.1, "hospitality": 0.17},
    )


def land_use(row, work_mix):
    total = max(1.0, g(row, C_AREA, 1))
    water = clamp(g(row, C_WATER) / total, 0, 0.7)
    density = g(row, C_DENSITY, 5000)
    industry = clamp(work_mix["industry"] * 0.48, 0.02, 0.24)
    agriculture = 0.01 if density > 2500 else 0.06
    green = 0.2
    residential = max(0.1, 1 - water - industry - agriculture - green)
    return normalise(
        {"residential": residential, "industry": industry, "agriculture": agriculture, "green": green, "water": water},
        {"residential": 0.5, "industry": 0.08, "agriculture": 0.01, "green": 0.28, "water": 0.13},
    )


def event_pull(density: float, urbanity: float) -> float:
    # No nabijheid CSV for the big cities, so approximate the venue-density proxy
    # from population density and urbanity class (1 = most urban).
    return round(clamp(0.25 + min(1.0, density / 11000) * 0.6 + (3 - urbanity) * 0.05, 0.2, 0.98), 4)


def make_profile(row, code, name, lat, lon, city_id, city_name) -> dict[str, Any]:
    population = g(row, C_POP)
    density = g(row, C_DENSITY, 4000)
    urbanity = int(clamp(g(row, C_URBAN, 2), 1, 5))
    work_mix = work_sector_mix(row)
    income = g(row, C_INCOME, 30) * 1000
    noneu = g(row, C_NONEU)
    labor = g(row, C_LABOR, 64)
    return {
        "id": code,
        "name": name,
        "municipality": city_name,
        "province": city_name,
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "population": round(population),
        "urbanity": urbanity,
        "averageIncome": round(income),
        "nonWesternShare": round(clamp(noneu / max(1, population), 0, 0.95), 4),
        "commuterShare": round(clamp(0.18 + labor / 100 * 0.4, 0.16, 0.62), 4),
        "airportDistanceKm": round(haversine_km((lat, lon), SCHIPHOL), 2),
        "eventPull": event_pull(density, urbanity),
        "rwziId": f"RWZI-{city_id.upper()}",
        "rwziName": f"{city_name} RWZI",
        "ageDistribution": age_distribution(row),
        "householdMix": household_mix(row),
        "housingMix": housing_mix(row),
        "workSectorMix": work_mix,
        "landUse": land_use(row, work_mix),
        "commuteLinks": [],
        "facilityContext": {
            "density": density,
            "trainDistanceKm": 2.0,
            "gpDistanceKm": 0.8,
            "hospitalDistanceKm": 2.8,
            "schoolDistanceKm": 0.7,
            "supermarketDistanceKm": 0.7,
            "cafeCount1Km": round(min(60.0, density / 350), 1),
        },
    }


def polygon_centroid(ring):
    pts = ring[:-1] if ring and ring[0] == ring[-1] else ring
    if len(pts) < 3:
        return (sum(p[1] for p in pts) / max(1, len(pts)), sum(p[0] for p in pts) / max(1, len(pts)))
    area = cx = cy = 0.0
    for i, p in enumerate(pts):
        x1, y1 = p
        x2, y2 = pts[(i + 1) % len(pts)]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area) < 1e-12:
        return (sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts))
    area *= 0.5
    return (cy / (6 * area), cx / (6 * area))


def geometry_centroid(geom):
    if geom.get("type") == "Polygon":
        return polygon_centroid(geom["coordinates"][0])
    if geom.get("type") == "MultiPolygon":
        best = None
        best_area = -1.0
        for poly in geom["coordinates"]:
            ring = poly[0]
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            area = (max(lons) - min(lons)) * (max(lats) - min(lats))
            if area > best_area:
                best_area = area
                best = polygon_centroid(ring)
        return best
    return None


def fetch_city_centroids(gemeentecode: str, center: tuple[float, float]) -> dict[str, tuple[float, float]]:
    lat, lon = center
    bbox = f"{lon - 0.22},{lat - 0.16},{lon + 0.22},{lat + 0.16}"
    url = (
        "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/"
        f"buurten/items?f=json&limit=1000&bbox={bbox}"
    )
    centroids: dict[str, tuple[float, float]] = {}
    pages = 0
    while url and pages < 30:
        with urllib.request.urlopen(url, timeout=60) as resp:
            payload = json.load(resp)
        for feat in payload.get("features", []):
            props = feat.get("properties", {})
            if clean(props.get("gemeentecode")) != gemeentecode:
                continue
            centroid = geometry_centroid(feat.get("geometry", {}))
            if centroid:
                centroids[clean(props.get("buurtcode"))] = centroid
        url = None
        for link in payload.get("links", []):
            if link.get("rel") == "next":
                url = link.get("href")
                break
        pages += 1
    return centroids


def assign_sewer_catchments(buurten: list[dict[str, Any]], city_id: str, city_name: str) -> None:
    """Split a city's buurten into geographic sewer sub-catchments via a small
    k-means on centroids, so an uptick in one catchment points to specific
    neighbourhoods. Each catchment is named after its largest neighbourhood."""
    n = len(buurten)
    if n == 0:
        return
    k = max(2, min(12, round(n / 35)))
    if n <= k:
        for i, b in enumerate(buurten):
            b["rwziId"] = f"RWZI-{city_id.upper()}-{i + 1}"
            b["rwziName"] = f"{city_name} – {b['name']}"
        return

    pts = [(b["lat"], b["lon"]) for b in buurten]
    # Seed centroids spread across the sorted-by-longitude order (deterministic).
    order = sorted(range(n), key=lambda i: (pts[i][1], pts[i][0]))
    centroids = [pts[order[round((i + 0.5) * n / k)]] for i in range(k)]
    assign = [0] * n
    for _ in range(12):
        for i, p in enumerate(pts):
            best, bestd = 0, float("inf")
            for c, cen in enumerate(centroids):
                d = (p[0] - cen[0]) ** 2 + (p[1] - cen[1]) ** 2
                if d < bestd:
                    bestd, best = d, c
            assign[i] = best
        new_cen = []
        for c in range(k):
            members = [pts[i] for i in range(n) if assign[i] == c]
            if members:
                new_cen.append((sum(m[0] for m in members) / len(members), sum(m[1] for m in members) / len(members)))
            else:
                new_cen.append(centroids[c])
        if new_cen == centroids:
            break
        centroids = new_cen

    for c in range(k):
        members = [i for i in range(n) if assign[i] == c]
        if not members:
            continue
        anchor = max(members, key=lambda i: buurten[i]["population"])
        name = f"{city_name} – {buurten[anchor]['name']}"
        rid = f"RWZI-{city_id.upper()}-{c + 1}"
        for i in members:
            buurten[i]["rwziId"] = rid
            buurten[i]["rwziName"] = name


def gravity_links(profiles: list[dict[str, Any]], k: int, pop_div: float) -> None:
    for profile in profiles:
        ranked = []
        for other in profiles:
            if other["id"] == profile["id"]:
                continue
            dist = max(0.4, haversine_km((profile["lat"], profile["lon"]), (other["lat"], other["lon"])))
            score = (other["eventPull"] * 0.35 + other["population"] / pop_div) / (dist ** 1.1)
            ranked.append((score, other))
        top = sorted(ranked, key=lambda item: item[0], reverse=True)[:k]
        total = sum(score for score, _ in top) or 1.0
        profile["commuteLinks"] = [{"targetId": o["id"], "share": round(s / total, 4)} for s, o in top]


def national_context(rows) -> dict[str, Any]:
    row = next((r for r in rows if clean(r[C_CODE]) == "NL00"), None)
    if row is None:
        return {}
    population = g(row, C_POP, 18044027)
    return {
        "code": "NL00",
        "name": "Nederland",
        "population": round(population),
        "ageDistribution": age_distribution(row),
        "householdMix": household_mix(row),
        "density": g(row, C_DENSITY, 536),
        "nonWesternShare": round(clamp(g(row, C_NONEU) / max(1, population), 0, 0.95), 4),
    }


def main() -> None:
    big = read_rows(BIG_CITIES_CSV)
    national_rows = read_rows(NATIONAL_CSV)
    by_code_big = {clean(r[C_CODE]): r for r in big}

    cities_out: list[dict[str, Any]] = []
    averages: list[dict[str, Any]] = []

    for city_id, city_name, gm, center, build_detail in CITIES:
        gem_row = by_code_big.get(gm) or next((r for r in national_rows if clean(r[C_CODE]) == gm), None)
        if gem_row is None:
            print(f"  ! no gemeente row for {city_name} ({gm}); skipping")
            continue
        average = make_profile(gem_row, city_id, city_name, center[0], center[1], city_id, city_name)
        averages.append(average)

        buurten: list[dict[str, Any]] = []
        if build_detail:
            print(f"  fetching centroids for {city_name} ...", flush=True)
            centroids = fetch_city_centroids(gm, center)
            for row in big:
                if clean(row[C_TYPE]) != "Buurt":
                    continue
                code = clean(row[C_CODE])
                # buurt belongs to this gemeente if its code shares the GM digits
                if not code.startswith("BU" + gm[2:]):
                    continue
                if g(row, C_POP) <= 0:
                    continue
                centroid = centroids.get(code)
                if centroid is None:
                    continue
                buurten.append(
                    make_profile(row, code, clean(row[C_NAME]), centroid[0], centroid[1], city_id, city_name)
                )
            assign_sewer_catchments(buurten, city_id, city_name)
            gravity_links(buurten, k=5, pop_div=8000.0)
            catchments = len({b["rwziId"] for b in buurten})
            print(f"    {city_name}: {len(buurten)} buurten, {catchments} sewer catchments")

        cities_out.append(
            {
                "id": city_id,
                "name": city_name,
                "gemeenteCode": gm,
                "lat": center[0],
                "lon": center[1],
                "average": average,
                "buurten": buurten,
            }
        )

    # Inter-city commute links live on the average nodes (used by nation mode).
    gravity_links(averages, k=4, pop_div=120000.0)

    payload = {
        "metadata": {
            "generatedFrom": [
                str(BIG_CITIES_CSV.relative_to(WORKSPACE_ROOT)),
                str(NATIONAL_CSV.relative_to(WORKSPACE_ROOT)),
                "PDOK/CBS Wijk- en Buurtkaart 2024 OGC API (buurt centroids)",
            ],
            "notes": [
                "City averages come from CBS gemeente rows; buurten from CBS buurt rows.",
                "Buurt coordinates are PDOK 2024 centroids; Den Haag detail uses dutchProfiles.json.",
                "Commute links are synthetic gravity flows.",
            ],
        },
        "nationalContext": national_context(national_rows) or national_context(big),
        "cities": cities_out,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    detail = sum(len(c["buurten"]) for c in cities_out)
    print(f"Wrote {OUTPUT} with {len(cities_out)} cities and {detail} detailed buurten")


if __name__ == "__main__":
    main()
