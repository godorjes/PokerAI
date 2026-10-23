import type { PlayerId, SeatId } from "@/shared/contracts";

export type BotSeat = Exclude<SeatId, 0>;
export type BotStyleId = "tight" | "loose" | "balanced" | "adaptive";

export interface BotStyleConfig {
  readonly seat: BotSeat;
  readonly playerId: PlayerId;
  readonly name: string;
  readonly styleId: BotStyleId;
  /** Short prompt-facing behaviour guidance; never a hard rule override. */
  readonly guidance: string;
}

/**
 * One style record per bot seat. The style guides model suggestions but cannot
 * grant actions outside the legal-action window.
 */
export const BOT_STYLES: Readonly<Record<BotSeat, BotStyleConfig>> = {
  1: {
    seat: 1,
    playerId: "ai-1",
    name: "AI-1 · 紧弱",
    styleId: "tight",
    guidance:
      "Play a conservative starting range. When facing clear pressure and weak equity, prefer folding over speculative calls.",
  },
  2: {
    seat: 2,
    playerId: "ai-2",
    name: "AI-2 · 松凶",
    styleId: "loose",
    guidance:
      "Play a wider range and apply pressure with bets and raises, while respecting stack size and position.",
  },
  3: {
    seat: 3,
    playerId: "ai-3",
    name: "AI-3 · 均衡",
    styleId: "balanced",
    guidance:
      "Choose actions by combining position, price, board texture and the public betting sequence. Avoid a fixed tendency.",
  },
  4: {
    seat: 4,
    playerId: "ai-4",
    name: "AI-4 · 观察",
    styleId: "adaptive",
    guidance:
      "Adjust to the public actions already taken in this hand. Stay within this hand; do not claim cross-hand learning or a long-term player profile.",
  },
};

export function botStyleForSeat(seat: BotSeat): BotStyleConfig {
  return BOT_STYLES[seat];
}

const POSITION_NAMES = ["button", "small_blind", "big_blind", "utg", "co"] as const;

export function positionForSeat(seat: SeatId, button: SeatId | null): string {
  if (button === null) return "unknown";
  return POSITION_NAMES[(seat - button + 5) % 5] ?? "unknown";
}
