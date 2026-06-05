import { useEffect, useMemo, useRef } from "react";
import L, { type CircleMarker, type LayerGroup, type Map as LeafletMap, type Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATE, STATE_COLORS, type AreaStats, type SimFrame, type StateCode, type World } from "../simulation/types";

interface NetherlandsMapProps {
  world: World;
  frame: SimFrame;
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function statsById(areaStats: AreaStats[]) {
  return Object.fromEntries(areaStats.map((stats) => [stats.profileId, stats]));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function rgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function markerRadius(state: number) {
  if (state === STATE.infectious) return 4.4;
  if (state === STATE.exposed) return 3.7;
  if (state === STATE.recovered) return 2.9;
  if (state === STATE.deceased) return 3.1;
  return 2.2;
}

function markerOpacity(state: number) {
  if (state === STATE.susceptible) return 0.26;
  if (state === STATE.recovered) return 0.42;
  return 0.74;
}

export default function NetherlandsMap({ world, frame, selectedProfileId, onSelectProfile }: NetherlandsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const agentLayerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const profileLayerRef = useRef<LayerGroup | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const areaStatsById = useMemo(() => statsById(frame.areaStats), [frame.areaStats]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      minZoom: 6,
      maxZoom: 12,
      zoomSnap: 0.25,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

    const simulationBounds = L.latLngBounds(world.profiles.map((profile) => [profile.lat, profile.lon]));
    map.fitBounds(simulationBounds.pad(0.06), { padding: [10, 10] });
    map.setMaxBounds([
      [50.15, 2.4],
      [54.15, 8.15],
    ]);

    agentLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    profileLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [world.profiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || world.profiles.length === 0) return;
    const simulationBounds = L.latLngBounds(world.profiles.map((profile) => [profile.lat, profile.lon]));
    map.fitBounds(simulationBounds.pad(world.mode === "nation" ? 0.06 : 0.14), { padding: [12, 12], animate: false });
  }, [world.mode, world.profiles]);

  useEffect(() => {
    const map = mapRef.current;
    const agentLayer = agentLayerRef.current;
    const routeLayer = routeLayerRef.current;
    const profileLayer = profileLayerRef.current;
    if (!map || !agentLayer || !routeLayer || !profileLayer) return;

    agentLayer.clearLayers();
    routeLayer.clearLayers();
    profileLayer.clearLayers();

    for (const route of world.routeLinks.slice(0, 90)) {
      const origin = world.profileById[route.originId];
      const target = world.profileById[route.targetId];
      const originStats = areaStatsById[route.originId];
      const targetStats = areaStatsById[route.targetId];
      const activeRate = Math.max(originStats?.activeRate ?? 0, targetStats?.activeRate ?? 0);
      const active = activeRate > 0.01;
      const line: Polyline = L.polyline(
        [
          [origin.lat, origin.lon],
          [target.lat, target.lon],
        ],
        {
          color: active ? "#d84f4f" : "#627e78",
          opacity: active ? Math.min(0.6, 0.16 + activeRate * 4.4) : 0.13,
          weight: Math.max(1, Math.sqrt(route.agents) * 0.35),
          interactive: false,
        },
      );
      routeLayer.addLayer(line);
    }

    for (const agent of world.agents) {
      const state = frame.states[agent.id] as StateCode;
      const marker: CircleMarker = L.circleMarker([agent.lat, agent.lon], {
        radius: markerRadius(state),
        stroke: false,
        fillColor: STATE_COLORS[state],
        fillOpacity: markerOpacity(state),
        interactive: false,
      });
      agentLayer.addLayer(marker);
    }

    for (const profile of world.profiles) {
      const stats = areaStatsById[profile.id];
      const activeRate = stats?.activeRate ?? 0;
      const selected = selectedProfileId === profile.id;
      const baseRadius = 11 + Math.sqrt(profile.population / 12000);
      const pulseRadius = selected ? baseRadius + 7 : baseRadius + Math.min(14, activeRate * 130);

      const halo = L.circleMarker([profile.lat, profile.lon], {
        radius: pulseRadius,
        color: selected ? "#143d36" : "#da5a58",
        weight: selected ? 3 : 1,
        fillColor: activeRate > 0 ? "#e84d4f" : "#2aa884",
        fillOpacity: activeRate > 0 ? Math.min(0.36, 0.08 + activeRate * 2.1) : 0.06,
        opacity: selected ? 0.92 : activeRate > 0 ? 0.55 : 0.24,
      });

      const core = L.circleMarker([profile.lat, profile.lon], {
        radius: baseRadius,
        color: selected ? "#173c36" : rgba("#244640", 0.5),
        weight: selected ? 3 : 1.3,
        fillColor: activeRate > 0 ? "#e84d4f" : "#f8fffb",
        fillOpacity: activeRate > 0 ? 0.34 : 0.52,
      });

      const tooltip = `
        <strong>${profile.name}</strong>
        <span>${formatPercent(activeRate)} active</span>
        <span>RWZI ${profile.rwziName}</span>
      `;
      halo.bindTooltip(tooltip, { direction: "top", sticky: true, className: "profileTooltip" });
      core.bindTooltip(tooltip, { direction: "top", sticky: true, className: "profileTooltip" });
      halo.on("click", () => onSelectProfile(profile.id));
      core.on("click", () => onSelectProfile(profile.id));

      profileLayer.addLayer(halo);
      profileLayer.addLayer(core);
    }
  }, [areaStatsById, frame.states, onSelectProfile, selectedProfileId, world]);

  return (
    <div className="mapShell realMapShell">
      <div ref={containerRef} className="leafletMap" />
    </div>
  );
}
