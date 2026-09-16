/**
 * Aparelho só de toque (celular, tablet sem mouse). O jogo precisa de teclado e mouse
 * (pointer lock + WASD), então essas telas mostram um aviso em vez de deixar a pessoa travar
 * dentro da fase. Tablet com mouse conectado tem `any-pointer: fine` e não recebe o aviso.
 */
export function isTouchOnly(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
}
