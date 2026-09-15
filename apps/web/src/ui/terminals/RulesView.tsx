import { useEffect, useState } from "preact/hooks";
import type { RulesAnswer, RulesQuestion } from "@fireshot/sim";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

export function RulesView({ q, locked, items, onSubmit }: { q: RulesQuestion; locked: boolean; items: boolean[] | null; onSubmit: (a: RulesAnswer) => void }) {
  const [policy, setPolicy] = useState<"allow" | "deny">("allow");
  const [actions, setActions] = useState<Record<number, "allow" | "deny" | "default">>({});
  useEffect(() => { setPolicy("allow"); setActions({}); }, [q.seed]);
  const effective = (port: number): "allow" | "deny" => {
    const a = actions[port];
    return a && a !== "default" ? a : policy;
  };
  const submit = (): void => onSubmit({
    defaultPolicy: policy,
    rules: q.ports.filter((p) => actions[p.port] && actions[p.port] !== "default").map((p) => ({ port: p.port, action: actions[p.port] as "allow" | "deny" })),
  });
  return (
    <div class="rules">
      <p class="term-hint">{t("terminal.rulesHint")}</p>
      <div class="rules-policy">
        <span>{t("terminal.defaultPolicy")}</span>
        <div class="segmented">
          {(["allow", "deny"] as const).map((p) => (
            <button key={p} type="button" disabled={locked} class={`seg ${policy === p ? "sel" : ""} ${p}`} onClick={() => setPolicy(p)}>{t(`terminal.${p}`)}</button>
          ))}
        </div>
      </div>
      <table class="term-table rules-table">
        <thead><tr><th>{t("terminal.port")}</th><th>{t("terminal.service")}</th><th>{t("terminal.action")}</th><th>Efeito</th></tr></thead>
        <tbody>
          {q.ports.map((p, i) => (
            <tr key={p.port} class={locked && items ? (items[i] ? "ok" : "bad") : ""}>
              <td><code>{p.port}</code></td>
              <td><strong>{p.service}</strong><br /><small class="muted">{p.description}</small></td>
              <td>
                <div class="segmented">
                  {(["default", "allow", "deny"] as const).map((a) => (
                    <button key={a} type="button" disabled={locked} class={`seg ${(actions[p.port] ?? "default") === a ? "sel" : ""} ${a}`} onClick={() => setActions({ ...actions, [p.port]: a })}>
                      {a === "default" ? t("terminal.defaultPolicy") : t(`terminal.${a}`)}
                    </button>
                  ))}
                </div>
              </td>
              <td class={`effect ${effective(p.port)}`}>{effective(p.port) === "allow" ? "✔ entra" : "✖ bloqueado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!locked && <Button onClick={submit}>{t("terminal.submit")}</Button>}
    </div>
  );
}
