/**
 * Apex-style per-cell frame compare (luma / saturation / edge energy).
 * Inspired by jolbol1/apex-gp tools/compare.mjs — pure PNG decode via pngjs.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

export type CellDelta = {
  row: number;
  col: number;
  lumaDelta: number;
  satDeltaPp: number;
  edgeDeltaPct: number;
  detailLost: boolean;
};

export type GridCompareResult = {
  grid: number;
  global: { lumaDelta: number; satDeltaPp: number; edgeDelta: number };
  cells: CellDelta[];
  detailLostCells: number;
  regression: boolean;
  sameHash: boolean;
  hashA: string;
  hashB: string;
  note: string;
};

function decodePng(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sat(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/** Simple horizontal+vertical gradient energy (edge proxy). */
function edgeAt(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const idx = (yy: number, xx: number) => {
    const i = (yy * width + xx) * 4;
    return luma(data[i], data[i + 1], data[i + 2]);
  };
  const x1 = Math.min(width - 1, x + 1);
  const y1 = Math.min(height - 1, y + 1);
  const dx = Math.abs(idx(y, x1) - idx(y, x));
  const dy = Math.abs(idx(y1, x) - idx(y, x));
  return dx + dy;
}

function cellStats(
  png: PNG,
  row: number,
  col: number,
  grid: number,
): { luma: number; sat: number; edge: number } {
  const { width, height, data } = png;
  const x0 = Math.floor((col * width) / grid);
  const x1 = Math.floor(((col + 1) * width) / grid);
  const y0 = Math.floor((row * height) / grid);
  const y1 = Math.floor(((row + 1) * height) / grid);
  let lSum = 0;
  let sSum = 0;
  let eSum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      lSum += luma(r, g, b);
      sSum += sat(r, g, b);
      eSum += edgeAt(data, width, height, x, y);
      n++;
    }
  }
  return {
    luma: n ? lSum / n : 0,
    sat: n ? sSum / n : 0,
    edge: n ? eSum / n : 0,
  };
}

/**
 * Compare two PNG frames on a grid.
 * `detailLost` when edge energy drops >15% in a cell (apex heuristic).
 */
export async function compareFramesGrid(
  aPath: string,
  bPath: string,
  opts: { grid?: number; edgeLossThreshold?: number } = {},
): Promise<GridCompareResult> {
  const grid = opts.grid ?? 6;
  const edgeLossThreshold = opts.edgeLossThreshold ?? 0.15;
  const bufA = await readFile(aPath);
  const bufB = await readFile(bPath);
  const hashA = createHash("sha256").update(bufA).digest("hex");
  const hashB = createHash("sha256").update(bufB).digest("hex");

  if (
    !aPath.toLowerCase().endsWith(".png") ||
    !bPath.toLowerCase().endsWith(".png")
  ) {
    return {
      grid,
      global: { lumaDelta: 0, satDeltaPp: 0, edgeDelta: 0 },
      cells: [],
      detailLostCells: 0,
      regression: false,
      sameHash: hashA === hashB,
      hashA,
      hashB,
      note: "Grid compare requires PNG. Falling back to hash-only.",
    };
  }

  const a = decodePng(bufA);
  const b = decodePng(bufB);
  // Resample conceptually by sampling each at its native grid; if sizes differ, still compare cell averages.
  const cells: CellDelta[] = [];
  let gL = 0;
  let gS = 0;
  let gE = 0;
  let detailLostCells = 0;

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const ca = cellStats(a, row, col, grid);
      const cb = cellStats(b, row, col, grid);
      const lumaDelta = cb.luma - ca.luma;
      const satDeltaPp = (cb.sat - ca.sat) * 100;
      const edgeDeltaPct =
        ca.edge === 0 ? 0 : ((cb.edge - ca.edge) / ca.edge) * 100;
      const detailLost = edgeDeltaPct < -edgeLossThreshold * 100;
      if (detailLost) detailLostCells++;
      cells.push({
        row,
        col,
        lumaDelta,
        satDeltaPp,
        edgeDeltaPct,
        detailLost,
      });
      gL += lumaDelta;
      gS += satDeltaPp;
      gE += cb.edge - ca.edge;
    }
  }

  const n = grid * grid;
  return {
    grid,
    global: {
      lumaDelta: gL / n,
      satDeltaPp: gS / n,
      edgeDelta: gE / n,
    },
    cells,
    detailLostCells,
    regression: detailLostCells > 0,
    sameHash: hashA === hashB,
    hashA,
    hashB,
    note:
      detailLostCells > 0
        ? `!! DETAIL LOST in ${detailLostCells}/${n} cells (edge energy down >${edgeLossThreshold * 100}%). Open PNGs before trusting — noise removal can false-positive.`
        : "No cell detail-loss alarms. Still open the frames — metric is a smoke alarm, not a judge.",
  };
}

export async function writeCompareReport(
  outPath: string,
  result: GridCompareResult,
): Promise<void> {
  const lines = [
    `# Frame compare (${result.grid}×${result.grid})`,
    "",
    `sameHash: ${result.sameHash}`,
    `GLOBAL luma ${result.global.lumaDelta.toFixed(2)}  sat ${result.global.satDeltaPp.toFixed(2)}pp  edge ${result.global.edgeDelta.toFixed(3)}`,
    "",
    result.note,
    "",
    "## Cells with detail loss",
    ...result.cells
      .filter((c) => c.detailLost)
      .map(
        (c) =>
          `- r${c.row}c${c.col}  edge ${c.edgeDeltaPct.toFixed(1)}%  luma ${c.lumaDelta.toFixed(1)}  sat ${c.satDeltaPp.toFixed(1)}pp`,
      ),
    "",
  ];
  await writeFile(outPath, lines.join("\n"), "utf8");
}

/** Generate tiny PNGs for unit tests. */
export function syntheticPng(opts: {
  width: number;
  height: number;
  fill: [number, number, number];
  edgeBoost?: boolean;
}): Buffer {
  const png = new PNG({ width: opts.width, height: opts.height });
  for (let y = 0; y < opts.height; y++) {
    for (let x = 0; x < opts.width; x++) {
      const i = (y * opts.width + x) * 4;
      let [r, g, b] = opts.fill;
      if (opts.edgeBoost && (x + y) % 3 === 0) {
        r = Math.min(255, r + 80);
        g = Math.min(255, g + 80);
        b = Math.min(255, b + 80);
      }
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
