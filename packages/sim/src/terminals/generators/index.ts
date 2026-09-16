import { mulberry32 } from "../../core/rng";
import type { Question } from "../types";
import type { Generator } from "./common";
import { classifyPool, matchPool, mcPool } from "./pool";
import { addressFormatMatch, switchTableMatch } from "./lan";
import { subnetNumeric, subnetSameNetwork } from "./subnet";
import { firewallRules, portServiceMatch } from "./firewall";
import { passwordStrength } from "./passwords";
import { phishingClassify } from "./phishing";

export const GENERATORS: Record<string, Generator> = {
  mc_pool: mcPool,
  match_pool: matchPool,
  classify_pool: classifyPool,
  address_format_match: addressFormatMatch,
  switch_table_match: switchTableMatch,
  subnet_same_network: subnetSameNetwork,
  subnet_numeric: subnetNumeric,
  port_service_match: portServiceMatch,
  firewall_rules: firewallRules,
  password_strength: passwordStrength,
  phishing_classify: phishingClassify,
};

export function registerGenerator(id: string, g: Generator): void {
  GENERATORS[id] = g;
}

/** Gera uma questão deterministicamente. */
export function generateQuestion(generator: string, params: Record<string, unknown> | undefined, seed: number, pools: Record<string, unknown>): Question {
  const g = GENERATORS[generator];
  if (!g) throw new Error(`unknown generator: ${generator}`);
  return g({ rng: mulberry32(seed), seed, params: params ?? {}, pools });
}

export type { GenContext, Generator } from "./common";
