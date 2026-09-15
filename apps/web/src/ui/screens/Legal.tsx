import { PRIVACY, TERMS } from "../../i18n/legal";
import { t } from "../../i18n/t";
import { Button } from "../components/ui";

export function LegalPage({ doc, onBack }: { doc: "terms" | "privacy"; onBack: () => void }) {
  const d = doc === "terms" ? TERMS : PRIVACY;
  return (
    <main class="page legal">
      <Button variant="ghost" onClick={onBack}>← {t("app.back")}</Button>
      <article>
        <h1>{d.title}</h1>
        <p class="muted">Atualizado em {d.updated}</p>
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </article>
    </main>
  );
}
