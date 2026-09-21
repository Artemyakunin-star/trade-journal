// Micro contracts trade the same price series as their e-mini siblings, so
// mini bars (NQ, ES, …) can back charts, simulations and MAE/MFE for micro
// trades (MNQ, MES, …) — no separate bar import needed.
export const MICRO_TO_MINI: Record<string, string> = {
  MNQ: "NQ",
  MES: "ES",
  MYM: "YM",
  M2K: "RTY",
  MGC: "GC",
  MCL: "CL",
};

export const MINI_TO_MICRO: Record<string, string> = Object.fromEntries(
  Object.entries(MICRO_TO_MINI).map(([micro, mini]) => [mini, micro]),
);

/** The other member of the micro/mini pair, or null when the symbol has none. */
export function siblingOf(symbol: string): string | null {
  return MICRO_TO_MINI[symbol] ?? MINI_TO_MICRO[symbol] ?? null;
}
