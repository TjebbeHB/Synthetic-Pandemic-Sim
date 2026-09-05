import { fmt, type Estimates, type RunOutput } from './model';
import { useEffect, useRef, useState } from 'react';

interface Props { result: RunOutput | null; baseline?: RunOutput | null; selected?: string; day: number; onDay: (day: number) => void }
export default function Curve({ result, baseline, selected, day, onDay }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 900, height: 145 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const values = result?.frames.map(f => (selected ? f.areas[selected] : f.total)?.infectious) ?? [];
  const previous = baseline?.frames.map(f => (selected ? f.areas[selected] : f.total)?.infectious) ?? [];
  const W = size.width, H = size.height, left = 55, right = 18, top = 18, bottom = 28;
  const days = Math.max(result?.settings.days ?? 120, baseline?.settings.days ?? 0);
  const max = Math.max(1, ...values.map(v => Math.max(v?.p90 ?? 0, v?.mean ?? 0)), ...previous.map(v => v?.mean ?? 0));
  const x = (d: number) => left + d / days * (W - left - right);
  const y = (n: number) => H - bottom - n / max * (H - top - bottom);
  const line = (vals: typeof values, key: keyof Estimates['infectious']) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v?.[key] ?? 0)}`).join(' ');
  const band = values.length ? `${line(values, 'p90')} ${[...values].reverse().map((v, i) => `L${x(values.length - i - 1)},${y(v.p10)}`).join(' ')} Z` : '';
  return <svg ref={ref} className="pdpc-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Besmettelijke inwoners: gemiddelde en 10e tot 90e percentiel" onClick={e => {
    if (!result) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onDay(Math.max(0, Math.min(result.settings.days, Math.round((((e.clientX - rect.left) / rect.width * W) - left) / (W - left - right) * days))));
  }}>
    {[0, 0.5, 1].map(v => <g key={v}><line x1={left} x2={W-right} y1={y(max*v)} y2={y(max*v)} stroke="#e6e9ed"/><text x={left-10} y={y(max*v)+4} textAnchor="end">{fmt(max*v, max < 2 ? 1 : 0)}</text></g>)}
    {[0, Math.round(days/4), Math.round(days/2), Math.round(3*days/4), days].map(d => <text key={d} x={x(d)} y={H-6} textAnchor="middle">{d}</text>)}
    {previous.length > 0 && <path d={line(previous, 'mean')} fill="none" stroke="#657b86" strokeWidth={2} strokeDasharray="5 4"/>}
    {values.length > 0 && <><path d={band} fill="#f5aa97" fillOpacity={0.3}/><path d={line(values, 'mean')} fill="none" stroke="#c74c43" strokeWidth={2.5}/><line x1={x(day)} x2={x(day)} y1={top} y2={H-bottom} stroke="#176f75" strokeDasharray="3 3"/><circle cx={x(day)} cy={y(values[day]?.mean ?? 0)} r={4} fill="#176f75" stroke="white" strokeWidth={2}/></>}
    {!values.length && <text x={W/2} y={H/2} textAnchor="middle">Nog geen simulatieresultaat</text>}
  </svg>;
}
