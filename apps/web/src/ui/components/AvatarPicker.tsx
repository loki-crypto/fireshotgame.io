import { avatars } from "@fireshot/content";
import { sfx } from "../../game/audio/Sfx";
import { t } from "../../i18n/t";
import { PixelArt } from "./PixelArt";

/** Grade de bonequinhos com semântica de radiogroup (setas trocam a escolha). */
export function AvatarPicker({ value, onChange, size = 56, name = "avatar" }: { value: string; onChange: (id: string) => void; size?: number; name?: string }) {
  const pick = (id: string): void => {
    if (id === value) return;
    sfx.unlock();
    sfx.play("uiClick");
    onChange(id);
  };
  const onKey = (e: KeyboardEvent, index: number): void => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = avatars[(index + step + avatars.length) % avatars.length]!;
    pick(next.id);
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-avatar="${next.id}"]`)?.focus();
  };
  return (
    <div class="avatar-picker" role="radiogroup" aria-label={t("avatar.choose")}>
      {avatars.map((a, i) => {
        const checked = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            name={name}
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-avatar={a.id}
            class={`avatar-option ${checked ? "checked" : ""}`}
            title={`${a.name}: ${a.concept}`}
            onClick={() => pick(a.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <PixelArt sprite={a} size={size} />
            <span>{a.name}</span>
          </button>
        );
      })}
    </div>
  );
}
