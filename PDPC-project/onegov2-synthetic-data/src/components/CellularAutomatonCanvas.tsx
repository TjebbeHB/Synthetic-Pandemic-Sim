import { useEffect, useRef } from "react";
import type { CellularDensityGrid, CellularFrame } from "../simulation/cellularAutomaton";

interface CellularAutomatonCanvasProps {
  grid: CellularDensityGrid;
  frame: CellularFrame;
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function densityColor(level: number): [number, number, number, number] {
  const t = Math.min(1, level / 135);
  if (t < 0.34) {
    const k = t / 0.34;
    return [mix(241, 249, k), mix(247, 214, k), mix(223, 108, k), 255];
  }
  if (t < 0.68) {
    const k = (t - 0.34) / 0.34;
    return [mix(249, 237, k), mix(214, 95, k), mix(108, 61, k), 255];
  }
  const k = (t - 0.68) / 0.32;
  return [mix(237, 60, k), mix(95, 24, k), mix(61, 69, k), 255];
}

function stateColor(code: number, level: number): [number, number, number, number] {
  const t = Math.min(1, level / 255);
  if (code === 2) return [mix(251, 232, t), mix(172, 86, t), mix(184, 138, t), 255];
  if (code === 3) return [mix(214, 21, t), mix(47, 26, t), mix(75, 92, t), 255];
  if (code === 4) return [mix(167, 37, t), mix(213, 143, t), mix(178, 114, t), 255];
  if (code === 5) return [mix(97, 18, t), mix(64, 21, t), mix(66, 24, t), 255];
  return densityColor(level);
}

export default function CellularAutomatonCanvas({ grid, frame }: CellularAutomatonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(grid.width, grid.height);

    for (let idx = 0; idx < frame.state.length; idx += 1) {
      const offset = idx * 4;
      if (!grid.mask[idx]) {
        image.data[offset] = 230;
        image.data[offset + 1] = 238;
        image.data[offset + 2] = 238;
        image.data[offset + 3] = 0;
        continue;
      }

      const [r, g, b, a] = stateColor(frame.state[idx], frame.intensity[idx]);
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = a;
    }

    context.putImageData(image, 0, 0);
  }, [frame, grid]);

  return (
    <div className="caCanvasShell">
      <canvas ref={canvasRef} className="caCanvas" aria-label="Cellular automaton density grid of the Netherlands" />
    </div>
  );
}
