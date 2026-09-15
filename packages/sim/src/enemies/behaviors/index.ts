import type { EnemyBehavior } from "../../core/types";
import type { Behavior } from "./types";
import { wormBehavior } from "./worm";
import { rootkitBehavior } from "./rootkit";
import { trojanBehavior } from "./trojan";
import { swarmBehavior } from "./swarm";
import { mitmBehavior } from "./mitm";
import { bruteforcerBehavior } from "./bruteforcer";
import { phisherBehavior } from "./phisher";
import { injectorBehavior } from "./injector";
import { ransomwareBehavior } from "./ransomware";

const basic: Behavior = {};

/** Resolução tardia (evita problemas de ordem de inicialização com importações circulares). */
export function getBehavior(name: EnemyBehavior): Behavior {
  switch (name) {
    case "worm": return wormBehavior;
    case "rootkit": return rootkitBehavior;
    case "trojan": return trojanBehavior;
    case "swarm": return swarmBehavior;
    case "mitm": return mitmBehavior;
    case "bruteforcer": return bruteforcerBehavior;
    case "phisher": return phisherBehavior;
    case "injector": return injectorBehavior;
    case "ransomware": return ransomwareBehavior;
    default: return basic;
  }
}

export type { Behavior };
