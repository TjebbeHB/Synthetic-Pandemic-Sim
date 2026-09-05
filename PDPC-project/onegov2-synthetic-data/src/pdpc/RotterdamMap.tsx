import { useEffect, useRef, useState } from 'react';
import L, { type GeoJSON as GeoLayer, type Map as MapType, type Path as MapPath } from 'leaflet';
import type { FeatureCollection, Geometry } from 'geojson';
import { Expand, Focus, Minus, Plus } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import geometry from '../data/rotterdamBuurten.json';
import { PROFILES } from './data';
import { colorFor, fmt, METRICS, metricValue, type Metric, type RunOutput, type SummaryFrame } from './model';

type Properties = { code: string; name: string };
const GEO = geometry as FeatureCollection<Geometry, Properties>;
const PROFILE_MAP = new Map(PROFILES.map(p => [p.id, p]));
interface Props {
  metric: Metric; frame?: SummaryFrame; result: RunOutput | null;
  selected: string; onSelect: (id: string) => void;
  streets: boolean; flows: boolean; labels: boolean;
}
const CITY_BOUNDS: L.LatLngBoundsExpression = [[51.867, 4.40], [51.962, 4.58]];

export default function RotterdamMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapType | null>(null);
  const geoRef = useRef<GeoLayer | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const flowRef = useRef<L.LayerGroup | null>(null);
  const labelRef = useRef<L.LayerGroup | null>(null);
  const current = useRef(props);
  current.current = props;
  const [tileError, setTileError] = useState(false);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { zoomControl: false, minZoom: 8, maxZoom: 17, zoomSnap: 0.25, attributionControl: true });
    mapRef.current = map;
    map.fitBounds(CITY_BOUNDS, { padding: [24, 24] });
    map.createPane('pdpcLabels');
    map.getPane('pdpcLabels')!.style.zIndex = '450';
    map.getPane('pdpcLabels')!.style.pointerEvents = 'none';
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', className: 'pdpc-base-tiles',
    });
    tileRef.current = tiles;
    tiles.on('tileerror', () => setTileError(true));
    map.attributionControl.addAttribution('Buurtgrenzen: CBS / PDOK 2024');
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 110 }).addTo(map);
    const geo = L.geoJSON(GEO, {
      style: { color: '#ffffff', weight: 1, fillOpacity: 0.66 },
      onEachFeature: (feature, layer) => {
        const p = PROFILE_MAP.get(feature.properties.code);
        layer.on('click', () => { if (p) current.current.onSelect(p.id); });
        layer.bindTooltip(() => {
          const now = current.current;
          const box = document.createElement('div');
          const title = document.createElement('strong'); title.textContent = feature.properties.name; box.append(title);
          const detail = document.createElement('span');
          const value = p ? metricValue(now.metric, p, now.frame?.areas[p.id]) : null;
          detail.textContent = !p ? 'Buiten de gemodelleerde bevolking' : value === null ? 'Nog geen resultaat' : `${fmt(value, value < 10 ? 1 : 0)} ${METRICS[now.metric].unit}`;
          box.append(detail);
          if (p) { const pop = document.createElement('small'); pop.textContent = `${fmt(p.population)} inwoners · ${p.id}`; box.append(pop); }
          return box;
        }, { sticky: true, className: 'pdpc-map-tooltip' });
        layer.on('add', () => {
          const element = (layer as MapPath).getElement();
          if (!element || !p) return;
          element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button');
          element.setAttribute('aria-label', p.name); element.setAttribute('data-buurt', p.id);
          element.addEventListener('keydown', (event) => {
            const e = event as KeyboardEvent;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); current.current.onSelect(p.id); }
          });
        });
      },
    }).addTo(map);
    geoRef.current = geo;
    flowRef.current = L.layerGroup().addTo(map);
    labelRef.current = L.layerGroup().addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(container.current);
    map.on('moveend zoomend', () => setViewport(v => v + 1));
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; geoRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, tiles = tileRef.current;
    if (!map || !tiles) return;
    if (props.streets) tiles.addTo(map); else tiles.remove();
  }, [props.streets]);

  useEffect(() => {
    geoRef.current?.eachLayer(layer => {
      const path = layer as L.Polygon & { feature: { properties: Properties } };
      const p = PROFILE_MAP.get(path.feature.properties.code);
      const selected = p?.id === props.selected;
      const value = p ? metricValue(props.metric, p, props.frame?.areas[p.id]) : null;
      path.setStyle({ color: selected ? '#163f43' : p ? '#ffffff' : '#aeb6bc', weight: selected ? 2.8 : 1,
        fillColor: colorFor(value, props.metric), fillOpacity: p ? (props.streets ? 0.68 : 0.9) : 0.24,
        dashArray: p ? undefined : '3 4' });
      if (selected) path.bringToFront();
    });
  }, [props.metric, props.frame, props.selected, props.streets]);

  useEffect(() => {
    const p = PROFILE_MAP.get(props.selected), map = mapRef.current;
    if (p && map && !map.getBounds().contains([p.lat, p.lon])) map.panTo([p.lat, p.lon]);
  }, [props.selected]);

  useEffect(() => {
    const map = mapRef.current, labels = labelRef.current;
    if (!map || !labels) return;
    labels.clearLayers();
    const occupied: { x: number; y: number; width: number }[] = [];
    const candidates = [...PROFILES].sort((a, b) => Number(b.id === props.selected) - Number(a.id === props.selected) || b.population - a.population);
    for (const p of candidates) {
      const selected = p.id === props.selected;
      if (!selected && (!props.labels || map.getZoom() < 11.2)) continue;
      if (!map.getBounds().contains([p.lat, p.lon])) continue;
      const point = map.latLngToContainerPoint([p.lat, p.lon]);
      const width = Math.min(180, p.name.length * 6.5 + 14);
      if (!selected && occupied.some(o => Math.abs(o.x - point.x) < (o.width + width) / 2 + 12 && Math.abs(o.y - point.y) < 29)) continue;
      occupied.push({ x: point.x, y: point.y, width });
      const el = document.createElement('span'); el.textContent = p.name;
      el.className = `pdpc-place-label ${selected ? 'selected' : ''}`;
      L.marker([p.lat, p.lon], { pane: 'pdpcLabels', interactive: false, keyboard: false,
        icon: L.divIcon({ html: el, className: 'pdpc-label-anchor', iconSize: [width, 24], iconAnchor: [width / 2, 12] }) }).addTo(labels);
    }
  }, [props.selected, props.labels, viewport]);

  useEffect(() => {
    const group = flowRef.current;
    if (!group) return;
    group.clearLayers();
    if (!props.flows || !props.result) return;
    const routes = props.result.routes.filter(r => r.originId === props.selected || r.targetId === props.selected).slice(0, 12);
    const max = Math.max(1, ...routes.map(r => r.people));
    for (const route of routes) {
      const a = PROFILE_MAP.get(route.originId), b = PROFILE_MAP.get(route.targetId);
      if (!a || !b) continue;
      const line = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: '#177a89', weight: 1 + 3 * Math.sqrt(route.people / max), opacity: 0.7, dashArray: '5 5' }).addTo(group);
      const label = document.createElement('span'); label.textContent = `${a.name} → ${b.name}: ${fmt(route.people)} gewogen modelreizigers`;
      line.bindTooltip(label, { sticky: true });
    }
  }, [props.flows, props.selected, props.result]);

  const fit = (whole = false) => {
    if (whole && geoRef.current) mapRef.current?.fitBounds(geoRef.current.getBounds(), { padding: [28, 28] });
    else mapRef.current?.fitBounds(CITY_BOUNDS, { padding: [24, 24] });
  };
  const focus = () => {
    geoRef.current?.eachLayer(layer => {
      const path = layer as L.Polygon & { feature: { properties: Properties } };
      if (path.feature.properties.code === props.selected) mapRef.current?.fitBounds(path.getBounds(), { padding: [65, 65], maxZoom: 14 });
    });
  };
  return <div className="pdpc-map-wrap">
    <div className="pdpc-map" ref={container} aria-label="Rotterdam buurtkaart" />
    <div className="pdpc-map-buttons">
      <button aria-label="Inzoomen" title="Inzoomen" onClick={() => mapRef.current?.zoomIn()}><Plus size={18}/></button>
      <button aria-label="Uitzoomen" title="Uitzoomen" onClick={() => mapRef.current?.zoomOut()}><Minus size={18}/></button>
      <button aria-label="Naar geselecteerde buurt" title="Naar geselecteerde buurt" onClick={focus}><Focus size={18}/></button>
      <button aria-label="Stadsgebied" title="Stadsgebied" onClick={() => fit()}><Expand size={18}/></button>
    </div>
    <div className="pdpc-map-location"><span>ROTTERDAM</span><button onClick={() => fit(true)}>Hele gemeente</button></div>
    {props.flows && <div className="pdpc-flow-caption">Synthetische pendelverbindingen · selectie · maximaal 12</div>}
    {tileError && props.streets && <div className="pdpc-tile-message" role="status">Straatkaart deels onbereikbaar. Lokale buurtgrenzen blijven beschikbaar.</div>}
    <div className="pdpc-map-legend" aria-label="Kaartlegenda">
      <strong>{METRICS[props.metric].label}</strong><span>{METRICS[props.metric].unit}</span>
      <div className="pdpc-legend-scale">{METRICS[props.metric].colors.map((color, i) => <div key={color}><i style={{ background: color }}/><small>{fmt(METRICS[props.metric].breaks[i])}{i === METRICS[props.metric].colors.length - 1 ? '+' : ''}</small></div>)}</div>
      <small><i className="pdpc-missing-swatch"/> Buiten model <span>Vaste klassegrenzen</span></small>
    </div>
  </div>;
}
