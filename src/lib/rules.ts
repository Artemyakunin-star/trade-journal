// Trading rules: per-instrument templates + per-idea limits, checked
// automatically against imported trades. Pure functions — no DB access here.

export type InstrumentRule = {
  /** Position-size cap, contracts. null = not set. */
  maxContracts: number | null;
  /** Planned stop distance, ticks. Losses meaningfully deeper -> "stop wider than rule". */
  stopTicks: number | null;
  t1Ticks: number | null;
  t2Ticks: number | null;
  /** Move stop to BE after price goes this many ticks in favor. Reference only. */
  beTriggerTicks: number | null;
  /** BE window: a closed trade with result in [-beWinMinus, +beWinPlus] ticks
   *  per contract counts as a break-even. Deeper in minus = a stop. */
  beWinMinus: number;
  beWinPlus: number;
};

export type TradingRules = Record<string, InstrumentRule>; // by symbol

export type IdeaLimits = {
  maxStops: number | null; // max full stops per idea
  maxBe: number | null; // max break-evens per idea
};

export const DEFAULT_BE_WIN = { minus: 1, plus: 1 };
/** Losses deeper than stop + this many ticks are flagged (slippage allowance). */
export const STOP_TOLERANCE_TICKS = 2;

export type TradeClass = "STOP" | "BE" | "WORK" | "OPEN";

type TradeLike = {
  id: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  avgEntryPrice: string;
  pnl: string | null; // net USD
  commission: string;
  exitTime: Date | null;
};

type Spec = { tickSize: number; tickValue: number };
type ExitFill = { price: number; quantity: number };

export type TradeCheck = {
  cls: TradeClass;
  /** Worst exit portion, ticks per contract (negative = loss). */
  worstTicks: number | null;
  qtyOver: boolean; // size above the instrument rule
  stopWider: boolean; // loss deeper than the rule stop + tolerance
};

/** Classify one closed trade. When exit fills are known (NinjaTrader executions),
 *  each portion is judged separately: any portion at full stop makes the whole
 *  trade a STOP; merged trade-list trades fall back to the per-contract average. */
export function checkTrade(
  t: TradeLike,
  rule: InstrumentRule | undefined,
  spec: Spec | undefined,
  exits?: ExitFill[],
): TradeCheck {
  const none: TradeCheck = { cls: "OPEN", worstTicks: null, qtyOver: false, stopWider: false };
  if (t.pnl === null || t.exitTime === null || !spec) return none;

  const winMinus = rule?.beWinMinus ?? DEFAULT_BE_WIN.minus;
  const winPlus = rule?.beWinPlus ?? DEFAULT_BE_WIN.plus;

  // Ticks per contract for each exit portion (price-based when fills are known).
  let portions: { ticks: number; qty: number }[];
  const entry = Number(t.avgEntryPrice);
  const dir = t.direction === "LONG" ? 1 : -1;
  if (exits && exits.length > 0 && Number.isFinite(entry)) {
    portions = exits.map((e) => ({ ticks: (dir * (e.price - entry)) / spec.tickSize, qty: e.quantity }));
  } else {
    // Gross USD (pnl is net of commission) -> average ticks per contract.
    const gross = Number(t.pnl) + Number(t.commission);
    const qty = Math.max(1, t.quantity);
    portions = [{ ticks: gross / (spec.tickValue * qty), qty }];
  }

  const worstTicks = Math.min(...portions.map((p) => p.ticks));
  const anyStop = portions.some((p) => p.ticks < -winMinus - 1e-9);
  const allBe = portions.every((p) => p.ticks >= -winMinus - 1e-9 && p.ticks <= winPlus + 1e-9);
  const cls: TradeClass = anyStop ? "STOP" : allBe ? "BE" : "WORK";

  const qtyOver = rule?.maxContracts != null && t.quantity > rule.maxContracts;
  const stopWider =
    rule?.stopTicks != null && worstTicks < -(rule.stopTicks + STOP_TOLERANCE_TICKS) - 1e-9;

  return { cls, worstTicks, qtyOver, stopWider };
}

export type IdeaCheck = {
  entries: number; // closed + open trades attached
  stops: number;
  be: number;
  maxStops: number | null;
  maxBe: number | null;
  stopsOver: boolean;
  beOver: boolean;
  broken: boolean; // any limit exceeded or any per-trade violation
  /** Per-trade violations, human-readable (time formatting is the caller's job). */
  tradeChecks: Map<string, TradeCheck>;
};

export function checkIdea(
  trades: TradeLike[],
  rules: TradingRules,
  specs: Record<string, Spec>,
  limits: IdeaLimits,
  exitsByTrade?: Map<string, ExitFill[]>,
): IdeaCheck {
  const tradeChecks = new Map<string, TradeCheck>();
  let stops = 0;
  let be = 0;
  let anyTradeViolation = false;
  for (const t of trades) {
    const c = checkTrade(t, rules[t.instrument], specs[t.instrument], exitsByTrade?.get(t.id));
    tradeChecks.set(t.id, c);
    if (c.cls === "STOP") stops++;
    if (c.cls === "BE") be++;
    if (c.qtyOver || c.stopWider) anyTradeViolation = true;
  }
  const stopsOver = limits.maxStops != null && stops > limits.maxStops;
  const beOver = limits.maxBe != null && be > limits.maxBe;
  return {
    entries: trades.length,
    stops,
    be,
    maxStops: limits.maxStops,
    maxBe: limits.maxBe,
    stopsOver,
    beOver,
    broken: stopsOver || beOver || anyTradeViolation,
    tradeChecks,
  };
}
