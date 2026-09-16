/// <reference types="vite/client" />
import type { BadgeDef, ContentRegistry, EnemyDef, PhaseDef, UpgradeDef, WeaponDef } from "@fireshot/sim";
import enemiesJson from "./enemies.json";
import weaponsJson from "./weapons.json";
import upgradesJson from "./upgrades.json";
import badgesJson from "./badges.json";
import avatarsJson from "./avatars.json";
import upgradeIconsJson from "./upgrade-icons.json";

/** Descoberta automática: adicionar um JSON em phases/ ou pools/ não exige alterar código. */
const phaseModules = import.meta.glob<{ default: PhaseDef }>("./phases/*.json", { eager: true });
const poolModules = import.meta.glob<{ default: unknown }>("./pools/*.json", { eager: true });

export const phases: PhaseDef[] = Object.values(phaseModules)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);

export const pools: Record<string, unknown> = Object.fromEntries(
  Object.entries(poolModules).map(([path, m]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), m.default]),
);

export const registry: ContentRegistry = {
  enemies: enemiesJson.enemies as EnemyDef[],
  weapons: weaponsJson.weapons as WeaponDef[],
  upgrades: upgradesJson.upgrades as UpgradeDef[],
  badges: badgesJson.badges as BadgeDef[],
  phases,
  pools,
};

/** Arte em pixel: uma string por fileira, um caractere por pixel ('.' é transparente), cor pela paleta. */
export interface PixelSprite {
  id: string;
  palette: Record<string, string>;
  rows: string[];
}

export interface AvatarDef extends PixelSprite {
  name: string;
  concept: string;
}

/** Bonequinhos escolhidos no cadastro. O servidor valida o id; o cliente desenha a arte. */
export const avatars = avatarsJson.avatars as unknown as AvatarDef[];
export const defaultAvatar = avatars[0]!.id;
export const avatarById = (id: string | null | undefined): AvatarDef => avatars.find((a) => a.id === id) ?? avatars[0]!;

/** Um ícone em pixel art por upgrade da loja. */
export const upgradeIcons: Record<string, PixelSprite> = Object.fromEntries((upgradeIconsJson.icons as unknown as PixelSprite[]).map((i) => [i.id, i]));

/** Fases do currículo (exclui treino/laboratório). */
export const curriculum = (): PhaseDef[] => phases.filter((p) => !p.tags.includes("practice"));

export const contentVersion = [
  enemiesJson.version, weaponsJson.version, upgradesJson.version, badgesJson.version, avatarsJson.version,
  ...phases.map((p) => `${p.id}@${p.version}`),
].join(";");
