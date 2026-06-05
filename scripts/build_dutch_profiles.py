"""Build browser-ready Dutch simulation profiles from local CBS CSV exports.

Inputs live one directory above the app folder:
  - CSV-kerncijfers/
  - CSV-Distances/
  - CSV-Mobiliteit/

The Hague buurt coordinates are enriched from the official PDOK/CBS Wijk- en
Buurtkaart 2024 OGC API. The generated JSON is intentionally small and
auditable; it is a simulation input, not a source of truth.
"""

from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path
from typing import Any

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
OUTPUT = REPO_ROOT / "src" / "data" / "dutchProfiles.json"

CORE_CSV = next((WORKSPACE_ROOT / "CSV-kerncijfers").glob("*.csv"))
DISTANCE_CSV = next((WORKSPACE_ROOT / "CSV-Distances").glob("*.csv"))
MOBILITY_CSV = next((WORKSPACE_ROOT / "CSV-Mobiliteit").glob("*.csv"))

PDOK_HAGUE_BBOX_URL = (
    "https://api.pdok.nl/cbs/wijken-en-buurten-2024/ogc/v1/collections/"
    "buurten/items?f=json&bbox=4.15,51.95,4.55,52.18&limit=1000"
)

HAGUE_CENTER = (52.0705, 4.3007)
ROTTERDAM_THE_HAGUE_AIRPORT = (51.9569, 4.4372)


def clean_text(value: Any) -> str:
    return str(value or "").replace("\ufeff", "").strip()


def to_float(value: Any, default: float = 0.0) -> float:
    text = clean_text(value)
    if not text or text in {".", "-99997", "-99998", "-99999"}:
        return default
    text = text.replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return default


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def normalise(weights: dict[str, float], fallback: dict[str, float]) -> dict[str, float]:
    safe = {key: max(0.0, float(value)) for key, value in weights.items()}
    total = sum(safe.values())
    if total <= 0:
        safe = fallback.copy()
        total = sum(safe.values())
    return {key: value / total for key, value in safe.items()}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def polygon_centroid(ring: list[list[float]]) -> tuple[float, float]:
    points = ring[:-1] if ring and ring[0] == ring[-1] else ring
    if len(points) < 3:
        lon = sum(point[0] for point in points) / max(1, len(points))
        lat = sum(point[1] for point in points) / max(1, len(points))
        return lat, lon

    area = 0.0
    cx = 0.0
    cy = 0.0
    for idx, point in enumerate(points):
        x1, y1 = point
        x2, y2 = points[(idx + 1) % len(points)]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross

    if abs(area) < 1e-12:
        lon = sum(point[0] for point in points) / len(points)
        lat = sum(point[1] for point in points) / len(points)
        return lat, lon
    area *= 0.5
    return cy / (6 * area), cx / (6 * area)


def geometry_centroid(geometry: dict[str, Any]) -> tuple[float, float]:
    if geometry.get("type") == "Polygon":
        return polygon_centroid(geometry["coordinates"][0])
    if geometry.get("type") == "MultiPolygon":
        weighted: list[tuple[float, tuple[float, float]]] = []
        for polygon in geometry["coordinates"]:
            ring = polygon[0]
            lat, lon = polygon_centroid(ring)
            min_lon = min(point[0] for point in ring)
            max_lon = max(point[0] for point in ring)
            min_lat = min(point[1] for point in ring)
            max_lat = max(point[1] for point in ring)
            weight = max(1e-9, (max_lon - min_lon) * (max_lat - min_lat))
            weighted.append((weight, (lat, lon)))
        total = sum(weight for weight, _ in weighted)
        return (
            sum(weight * coord[0] for weight, coord in weighted) / total,
            sum(weight * coord[1] for weight, coord in weighted) / total,
        )
    return HAGUE_CENTER


def load_pdok_centroids() -> dict[str, tuple[float, float]]:
    with urllib.request.urlopen(PDOK_HAGUE_BBOX_URL, timeout=30) as response:
        geojson = json.load(response)
    centroids: dict[str, tuple[float, float]] = {}
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        if props.get("gemeentecode") != "GM0518":
            continue
        centroids[clean_text(props.get("buurtcode"))] = geometry_centroid(feature["geometry"])
    return centroids


def read_statline(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep=";", dtype=str, keep_default_na=False)


def get(row: pd.Series, column: str, default: float = 0.0) -> float:
    return to_float(row.get(column), default)


def age_distribution(row: pd.Series) -> dict[str, float]:
    return normalise(
        {
            "0-14": get(row, "Bevolking/Leeftijdsgroepen/0 tot 15 jaar (aantal)"),
            "15-24": get(row, "Bevolking/Leeftijdsgroepen/15 tot 25 jaar (aantal)"),
            "25-44": get(row, "Bevolking/Leeftijdsgroepen/25 tot 45 jaar (aantal)"),
            "45-64": get(row, "Bevolking/Leeftijdsgroepen/45 tot 65 jaar (aantal)"),
            "65+": get(row, "Bevolking/Leeftijdsgroepen/65 jaar of ouder (aantal)"),
        },
        {"0-14": 0.16, "15-24": 0.13, "25-44": 0.28, "45-64": 0.26, "65+": 0.17},
    )


def household_mix(row: pd.Series) -> dict[str, float]:
    total = get(row, "Bevolking/Particuliere huishoudens/Huishoudens totaal (aantal)")
    single = get(row, "Bevolking/Particuliere huishoudens/Eenpersoonshuishoudens (aantal)")
    no_kids = get(row, "Bevolking/Particuliere huishoudens/Huishoudens zonder kinderen (aantal)")
    kids = get(row, "Bevolking/Particuliere huishoudens/Huishoudens met kinderen (aantal)")
    if total <= 0:
        return {"single": 0.42, "couple": 0.22, "family": 0.27, "shared": 0.06, "multigen": 0.03}
    return normalise(
        {
            "single": single / total,
            "couple": max(0, no_kids - single * 0.15) / total,
            "family": kids / total,
            "shared": 0.045,
            "multigen": 0.03,
        },
        {"single": 0.42, "couple": 0.22, "family": 0.27, "shared": 0.06, "multigen": 0.03},
    )


def housing_mix(row: pd.Series) -> dict[str, float]:
    apartment = get(row, "Wonen en vastgoed/Woningen naar type/Percentage meergezinswoning (%)") / 100
    detached = (
        get(row, "Wonen en vastgoed/Woningen naar type/Percentage vrijstaande woning (eengezins (%)")
        + get(row, "Wonen en vastgoed/Woningen naar type/Percentage twee-onder-één-kap-woning (ee (%)")
    ) / 100
    row_house = max(
        0,
        get(row, "Wonen en vastgoed/Woningen naar type/Percentage eengezinswoning (%)") / 100 - detached,
    )
    return normalise(
        {"apartment": apartment, "row-house": row_house, "detached": detached},
        {"apartment": 0.7, "row-house": 0.27, "detached": 0.03},
    )


def work_sector_mix(row: pd.Series) -> dict[str, float]:
    return normalise(
        {
            "healthcare": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/O-Q Overheid, onderwijs en zorg (aantal)") * 0.55,
            "education": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/O-Q Overheid, onderwijs en zorg (aantal)") * 0.25,
            "industry": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/B-F Nijverheid en energie (aantal)"),
            "services": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/M-N Zakelijke dienstverlening (aantal)")
            + get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/K-L Financiële diensten, onroerend goed (aantal)"),
            "logistics": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/H+J Vervoer, informatie en communicatie (aantal)"),
            "hospitality": get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/G+I Handel en horeca (aantal)")
            + get(row, "Bedrijfsvestigingen, SBI 2008/Bedrijfsvestigingen naar activiteit/R-U Cultuur, recreatie, overige diensten (aantal)") * 0.35,
        },
        {
            "healthcare": 0.18,
            "education": 0.13,
            "industry": 0.08,
            "services": 0.34,
            "logistics": 0.1,
            "hospitality": 0.17,
        },
    )


def event_pull(distance_row: pd.Series | None) -> float:
    if distance_row is None:
        return 0.55
    counts = (
        get(distance_row, "Horeca/Cafés en dergelijke/Aantal cafés e.d./Binnen 1 km (aantal)")
        + get(distance_row, "Horeca/Restaurants/Aantal restaurants/Binnen 1 km (aantal)") * 0.45
        + get(distance_row, "Vrije tijd en cultuur/Podiumkunsten (excl. festivals)/Aantal podiumkunsten totaal/Binnen 5 km (aantal)") * 0.15
        + get(distance_row, "Vrije tijd en cultuur/Bioscoop/Aantal bioscopen/Binnen 5 km (aantal)") * 0.35
        + get(distance_row, "Vrije tijd en cultuur/Museum/Aantal musea/Binnen 5 km (aantal)") * 0.08
    )
    cafe_dist = get(distance_row, "Horeca/Cafés en dergelijke/Afstand tot café e.d. (km)", 1.2)
    station_dist = get(distance_row, "Verkeer en vervoer/Treinstations/Afstand tot treinstations totaal (km)", 2.0)
    return clamp(0.22 + counts * 0.009 - cafe_dist * 0.035 - station_dist * 0.012, 0.14, 1.08)


def land_use(row: pd.Series, distance_row: pd.Series | None) -> dict[str, float]:
    total = max(1, get(row, "Oppervlakte/Oppervlakte totaal (ha)", 1))
    water = clamp(get(row, "Oppervlakte/Oppervlakte water (ha)") / total, 0, 0.7)
    density = get(row, "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)", 5000)
    industry = clamp(work_sector_mix(row)["industry"] * 0.48, 0.02, 0.24)
    agriculture = 0.01 if density > 2500 else 0.06
    green_distance = get(distance_row, "Groenvoorzieningen/Openbaar groen/Afstand tot openbaar groen totaal (km)", 0.8) if distance_row is not None else 0.8
    green = clamp(0.12 + 0.22 / max(0.25, green_distance), 0.08, 0.42)
    residential = max(0.1, 1 - water - industry - agriculture - green)
    return normalise(
        {
            "residential": residential,
            "industry": industry,
            "agriculture": agriculture,
            "green": green,
            "water": water,
        },
        {"residential": 0.5, "industry": 0.08, "agriculture": 0.01, "green": 0.28, "water": 0.13},
    )


def build_hague_profiles() -> list[dict[str, Any]]:
    core = read_statline(CORE_CSV)
    distances = read_statline(DISTANCE_CSV)
    centroids = load_pdok_centroids()

    code_col = "Regioaanduiding/Codering (code)"
    type_col = "Regioaanduiding/Soort regio (omschrijving)"
    distance_by_code = {
        clean_text(row[code_col]): row
        for _, row in distances.iterrows()
        if clean_text(row[code_col]).startswith("BU")
    }

    profiles: list[dict[str, Any]] = []
    for _, row in core.iterrows():
        code = clean_text(row[code_col])
        if not code.startswith("BU") or clean_text(row[type_col]) != "Buurt":
            continue
        population = get(row, "Bevolking/Aantal inwoners (aantal)")
        if population <= 0:
            continue
        lat, lon = centroids.get(code, HAGUE_CENTER)
        distance_row = distance_by_code.get(code)
        density = get(row, "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)", 5000)
        labor = get(row, "Arbeid/Nettoarbeidsparticipatie (%)", 65)
        train_distance = get(distance_row, "Verkeer en vervoer/Treinstations/Afstand tot treinstations totaal (km)", 2.0) if distance_row is not None else 2.0
        car_per_household = get(row, "Motorvoertuigen/Personenauto's/Personenauto's per huishouden (per huishouden)", 0.7)
        outside_europe = get(row, "Bevolking/Bevolking naar herkomst/Herkomstland/Buiten Europa  (aantal)")
        income = get(row, "Inkomen/Huishoudens/Gem. gestandaardiseerd inkomen (x 1 000 euro)", 33) * 1000
        urbanity = int(clamp(get(row, "Stedelijkheid/Mate van stedelijkheid (code)", 1), 1, 5))
        airport_distance = haversine_km((lat, lon), ROTTERDAM_THE_HAGUE_AIRPORT)
        commuter_share = clamp(0.18 + labor / 100 * 0.35 + car_per_household * 0.04 - train_distance * 0.018, 0.16, 0.58)

        profile = {
            "id": code,
            "name": clean_text(row["Wijken en buurten"]),
            "municipality": "The Hague",
            "province": "Zuid-Holland",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "population": round(population),
            "urbanity": urbanity,
            "averageIncome": round(income),
            "nonWesternShare": round(clamp(outside_europe / population, 0, 0.95), 4),
            "commuterShare": round(commuter_share, 4),
            "airportDistanceKm": round(airport_distance, 2),
            "eventPull": round(event_pull(distance_row), 4),
            "rwziId": "RWZI-HOUTRUST" if lon < 4.29 else "RWZI-HARNASCHPOLDER",
            "rwziName": "Houtrust" if lon < 4.29 else "Harnaschpolder",
            "ageDistribution": age_distribution(row),
            "householdMix": household_mix(row),
            "housingMix": housing_mix(row),
            "workSectorMix": work_sector_mix(row),
            "landUse": land_use(row, distance_row),
            "commuteLinks": [],
            "facilityContext": {
                "density": density,
                "trainDistanceKm": train_distance,
                "gpDistanceKm": get(distance_row, "Gezondheid en welzijn/Huisartsenpraktijk/Afstand tot huisartsenpraktijk (km)", 0.8) if distance_row is not None else 0.8,
                "hospitalDistanceKm": get(distance_row, "Gezondheid en welzijn/Ziekenhuis (incl. buitenpolikliniek)/Afstand tot ziekenhuis (km)", 2.8) if distance_row is not None else 2.8,
                "schoolDistanceKm": get(distance_row, "Onderwijs/Basisonderwijs/Afstand tot school (km)", 0.7) if distance_row is not None else 0.7,
                "supermarketDistanceKm": get(distance_row, "Detailhandel/Winkels dagelijkse boodschappen/Afstand tot grote supermarkt (km)", 0.7) if distance_row is not None else 0.7,
                "cafeCount1Km": get(distance_row, "Horeca/Cafés en dergelijke/Aantal cafés e.d./Binnen 1 km (aantal)") if distance_row is not None else 0,
            },
        }
        profiles.append(profile)

    add_commute_links(profiles)
    return sorted(profiles, key=lambda profile: profile["population"], reverse=True)


def add_commute_links(profiles: list[dict[str, Any]]) -> None:
    for profile in profiles:
        ranked: list[tuple[float, dict[str, Any]]] = []
        for other in profiles:
            if other["id"] == profile["id"]:
                continue
            distance = max(0.25, haversine_km((profile["lat"], profile["lon"]), (other["lat"], other["lon"])))
            centrality = other["eventPull"] * 0.35 + other["population"] / 40000
            score = centrality / (distance**1.1)
            ranked.append((score, other))
        top = sorted(ranked, reverse=True, key=lambda item: item[0])[:5]
        total = sum(score for score, _ in top) or 1
        profile["commuteLinks"] = [
            {"targetId": other["id"], "share": round(score / total, 4)}
            for score, other in top
        ]


def mobility_baseline() -> dict[str, float]:
    mobility = read_statline(MOBILITY_CSV)
    latest = mobility[
        (mobility["Perioden"].astype(str).str.startswith("2024"))
        & (mobility["Persoonskenmerken"] == "Totaal personen")
        & (mobility["Vervoerwijzen"] == "Totaal")
        & (mobility["Marges"] == "Waarde")
    ].iloc[0]
    return {
        "year": 2024,
        "tripsPerPersonPerDay": get(latest, "Gemiddeld per persoon per dag /Verplaatsingen  (aantal)", 2.71),
        "kmPerPersonPerDay": get(latest, "Gemiddeld per persoon per dag /Afstand  (reizigerskilometers)", 32.35),
        "minutesPerPersonPerDay": get(latest, "Gemiddeld per persoon per dag /Reisduur (minuten)", 74.23),
    }


def national_context() -> dict[str, Any]:
    core = read_statline(CORE_CSV)
    row = core[core["Regioaanduiding/Codering (code)"].map(clean_text) == "NL00"].iloc[0]
    population = get(row, "Bevolking/Aantal inwoners (aantal)", 18044027)
    outside_europe = get(row, "Bevolking/Bevolking naar herkomst/Herkomstland/Buiten Europa  (aantal)")
    return {
        "code": "NL00",
        "name": "Nederland",
        "population": round(population),
        "ageDistribution": age_distribution(row),
        "householdMix": household_mix(row),
        "density": get(row, "Bevolking/Bevolkingsdichtheid (aantal inwoners per km²)", 536),
        "nonWesternShare": round(clamp(outside_europe / max(1, population), 0, 0.95), 4),
    }


def main() -> None:
    payload = {
        "metadata": {
            "generatedFrom": [
                str(CORE_CSV.relative_to(WORKSPACE_ROOT)),
                str(DISTANCE_CSV.relative_to(WORKSPACE_ROOT)),
                str(MOBILITY_CSV.relative_to(WORKSPACE_ROOT)),
                PDOK_HAGUE_BBOX_URL,
            ],
            "notes": [
                "The Hague mode uses local CBS StatLine CSV rows for BU-level demographics and facilities.",
                "Coordinates are centroids from PDOK/CBS Wijk- en Buurtkaart 2024 OGC API geometries.",
                "Commute links are synthetic nearest-neighbour flows weighted by population and event pull.",
            ],
        },
        "nationalContext": national_context(),
        "mobilityBaseline": mobility_baseline(),
        "hagueProfiles": build_hague_profiles(),
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(payload['hagueProfiles'])} The Hague buurt profiles")


if __name__ == "__main__":
    main()
