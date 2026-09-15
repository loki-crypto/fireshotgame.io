import type { ContextBlock } from "@fireshot/sim";

export function ContextBlocks({ blocks }: { blocks: ContextBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div class="term-context">
      {blocks.map((b, i) => {
        if (b.type === "text") return <p key={i} class="term-text">{b.text}</p>;
        if (b.type === "code") return <pre key={i} class="term-code">{b.text}</pre>;
        return (
          <div key={i} class="term-table-wrap">
            <div class="term-table-title">{b.title}</div>
            <table class="term-table">
              <thead><tr>{b.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
