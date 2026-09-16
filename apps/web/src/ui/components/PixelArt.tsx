import type { PixelSprite } from "@fireshot/content";

interface Run { x: number; y: number; w: number; fill: string }

const cache = new WeakMap<PixelSprite, { runs: Run[]; cols: number; rows: number }>();

/** Junta pixels vizinhos da mesma cor em cada fileira: ~50 retângulos em vez de 144. */
function runsOf(sprite: PixelSprite): { runs: Run[]; cols: number; rows: number } {
  const hit = cache.get(sprite);
  if (hit) return hit;
  const runs: Run[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const fill = sprite.palette[ch];
      if (ch !== "." && fill) runs.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  const out = { runs, cols: Math.max(...sprite.rows.map((r) => r.length)), rows: sprite.rows.length };
  cache.set(sprite, out);
  return out;
}

/**
 * Desenha pixel art de `packages/content` (avatares e ícones da loja) em SVG.
 * SVG em vez de canvas: escala sem borrar em qualquer tamanho, não precisa de efeito para
 * redesenhar e funciona no jsdom dos testes.
 */
export function PixelArt({ sprite, size = 48, label, class: cls }: { sprite: PixelSprite; size?: number; label?: string; class?: string }) {
  const { runs, cols, rows } = runsOf(sprite);
  return (
    <svg
      class={`pixel-art ${cls ?? ""}`} width={size} height={(size * rows) / cols} viewBox={`0 0 ${cols} ${rows}`} shape-rendering="crispEdges"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {runs.map((r) => <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  );
}
