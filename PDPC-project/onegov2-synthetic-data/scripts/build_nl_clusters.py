"""Aggregate the population-density raster into ~200 population clusters and snap a
real NS intercity rail backbone onto them. Output: src/data/netherlandsClusters.json
(small) — the substrate for the nationwide metapopulation model (NetherlandsMacroView).
stdlib only."""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
grid = json.load(open(ROOT / "src/data/netherlandsCaDensity.json"))
W, H = grid["width"], grid["height"]
lonMin, latMin, lonMax, latMax = grid["bbox"]
cellLon = (lonMax - lonMin) / W
cellLat = (latMax - latMin) / H            # row 0 = NORTH (verified vs Rotterdam centre)
pop = grid["population"]; names = grid["names"]

def cell_lonlat(idx):
    r, c = divmod(idx, W)
    return lonMin + (c + 0.5) * cellLon, latMax - (r + 0.5) * cellLat

# --- coarsen into blocks of B*B cells -> clusters ---------------------------
B = 6
blocks = {}
for idx, p in enumerate(pop):
    if p <= 0: continue
    r, c = divmod(idx, W)
    key = (r // B, c // B)
    b = blocks.setdefault(key, {"pop": 0.0, "slon": 0.0, "slat": 0.0, "top": (0, "")})
    lon, lat = cell_lonlat(idx)
    b["pop"] += p; b["slon"] += p * lon; b["slat"] += p * lat
    if p > b["top"][0] and names[idx]: b["top"] = (p, names[idx])

clusters = []
for (br, bc), b in blocks.items():
    if b["pop"] < 400: continue           # drop near-empty blocks
    clusters.append({
        "name": b["top"][1] or "—",
        "lat": round(b["slat"] / b["pop"], 4),
        "lon": round(b["slon"] / b["pop"], 4),
        "pop": int(round(b["pop"])),
    })
# scale cluster pop up to the true national total (raster undercounts)
tot = sum(c["pop"] for c in clusters)
scale = 17_942_915 / tot
for c in clusters: c["pop"] = int(round(c["pop"] * scale))
clusters.sort(key=lambda c: -c["pop"])
for i, c in enumerate(clusters): c["id"] = i
print(f"{len(clusters)} clusters, pop {sum(c['pop'] for c in clusters):,}")

# --- real NS intercity backbone: city -> nearest cluster, edges along lines ---
CITY = {  # lat, lon
 "Amsterdam":(52.379,4.900),"Schiphol":(52.309,4.762),"Haarlem":(52.388,4.638),
 "Alkmaar":(52.638,4.739),"Zaandam":(52.439,4.826),"Almere":(52.375,5.218),
 "Lelystad":(52.508,5.474),"Hilversum":(52.224,5.181),"Utrecht":(52.089,5.110),
 "Amersfoort":(52.155,5.374),"Zwolle":(52.505,6.092),"Groningen":(53.211,6.566),
 "Assen":(52.995,6.564),"Leeuwarden":(53.196,5.792),"Heerenveen":(52.960,5.918),
 "DenHaag":(52.080,4.325),"Leiden":(52.166,4.482),"Delft":(52.006,4.357),
 "Rotterdam":(51.924,4.469),"Dordrecht":(51.807,4.667),"Gouda":(52.017,4.704),
 "DenBosch":(51.690,5.293),"Eindhoven":(51.443,5.480),"Tilburg":(51.560,5.083),
 "Breda":(51.586,4.780),"Roosendaal":(51.531,4.456),"Weert":(51.255,5.706),
 "Roermond":(51.194,5.985),"Sittard":(51.001,5.868),"Maastricht":(50.850,5.705),
 "Venlo":(51.370,6.172),"Heerlen":(50.888,5.971),"Arnhem":(51.985,5.899),
 "Nijmegen":(51.843,5.852),"Zutphen":(52.145,6.196),"Deventer":(52.257,6.160),
 "Apeldoorn":(52.210,5.969),"Almelo":(52.357,6.665),"Hengelo":(52.265,6.793),
 "Enschede":(52.221,6.890),
}
LINES = [
 ["Amsterdam","Schiphol","Leiden","DenHaag","Delft","Rotterdam","Dordrecht","Roosendaal"],
 ["Amsterdam","Utrecht","DenBosch","Eindhoven","Weert","Roermond","Sittard","Maastricht"],
 ["Utrecht","Amersfoort","Zwolle","Assen","Groningen"],
 ["Zwolle","Heerenveen","Leeuwarden"],
 ["Zwolle","Deventer","Almelo","Hengelo","Enschede"],
 ["Utrecht","Arnhem","Nijmegen"],
 ["Arnhem","Zutphen","Deventer"],
 ["DenBosch","Tilburg","Breda","Dordrecht"],
 ["Eindhoven","Tilburg"],
 ["Rotterdam","Gouda","Utrecht"],
 ["DenHaag","Gouda"],
 ["Amsterdam","Almere","Lelystad","Zwolle"],
 ["Amsterdam","Hilversum","Amersfoort","Apeldoorn","Deventer"],
 ["Amsterdam","Zaandam","Alkmaar"],
 ["Amsterdam","Haarlem","Leiden"],
 ["Nijmegen","DenBosch"],
 ["Venlo","Eindhoven"],
 ["Venlo","Roermond"],
 ["Heerlen","Sittard"],
 ["Groningen","Leeuwarden"],
]
def nearest(lat, lon):
    return min(range(len(clusters)),
              key=lambda i: (clusters[i]["lat"]-lat)**2 + (clusters[i]["lon"]-lon)**2)
city_node = {c: nearest(*CITY[c]) for c in CITY}
rail = set()
for line in LINES:
    for a, b in zip(line, line[1:]):
        i, j = city_node[a], city_node[b]
        if i != j: rail.add((min(i, j), max(i, j)))
rail = sorted(rail)
print(f"{len(rail)} rail edges over {len(set(city_node.values()))} hub clusters")

out = {"bbox": grid["bbox"],
       "clusters": clusters,
       "rail": rail,
       "railHubs": sorted(set(city_node.values()))}
json.dump(out, open(ROOT / "src/data/netherlandsClusters.json", "w"), separators=(",", ":"))
print("wrote src/data/netherlandsClusters.json", f"({(ROOT/'src/data/netherlandsClusters.json').stat().st_size//1024} KB)")
