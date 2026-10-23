"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEEPSEEK_KEY_HEADER,
  type AiConnectionStatus,
  type AiModeOperation,
  type AiTestResponse,
  type BotDecisionResponse,
  type GameActionRequest,
  type GameStateResponse,
  type NextHandRequest,
} from "@/shared/api";
import type {
  ActionName,
  LegalActionView,
  PublicActionView,
  PublicPlayerView,
  PublicTableView,
  SeatId,
} from "@/shared/contracts";

const STORAGE_KEY = "poker-ai.gameId";
const KEY_STORAGE = "poker-ai.deepseek-key";

type KeyStatus = AiConnectionStatus | "untested" | "testing" | "unconfirmed";

function readStoredKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function storeKey(value: string): void {
  try {
    if (value) sessionStorage.setItem(KEY_STORAGE, value);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // sessionStorage can be unavailable in hardened/private contexts.
  }
}

const KEY_STATUS_TEXT: Record<KeyStatus, string> = {
  untested: "已保存，未测试",
  testing: "正在测试连接…",
  available: "连接可用",
  key_invalid: "Key 无效",
  insufficient_balance: "余额不足",
  rate_limited: "请求限流",
  unavailable: "暂时不可用",
  not_configured: "未配置",
  unconfirmed: "本地已清除，服务端停用未确认",
};

const SEAT_NAMES: Record<SeatId, string> = {
  0: "你",
  1: "AI-1 · 紧弱",
  2: "AI-2 · 松凶",
  3: "AI-3 · 均衡",
  4: "AI-4 · 观察",
};
function positionName(seat: SeatId, button: SeatId | null): string {
  if (button === null) return "—";
  return ["按钮位", "小盲", "大盲", "UTG", "CO"][(seat - button + 5) % 5] ?? "—";
}

class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
  }
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random()}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data as { error?: { code?: string; message?: string } } | null;
    throw new ClientApiError(
      response.status,
      body?.error?.code ?? "INTERNAL",
      body?.error?.message ?? "请求失败",
    );
  }
  return data as T;
}

function formatChips(value: number): string {
  return value.toLocaleString("zh-CN");
}

function cardLabel(card: string): { rank: string; suit: string; red: boolean } {
  const rank = card[0] === "T" ? "10" : (card[0] ?? "?");
  const suit = card[1] ?? "?";
  const symbol = suit === "s" ? "♠" : suit === "h" ? "♥" : suit === "d" ? "♦" : "♣";
  return { rank, suit: symbol, red: suit === "h" || suit === "d" };
}

function PlayingCard({ card, hidden = false }: { card?: string | null; hidden?: boolean }) {
  if (hidden || !card) {
    return <span className="card-face card-back">?</span>;
  }
  const parsed = cardLabel(card);
  return (
    <span className={`card-face ${parsed.red ? "card-red" : ""}`}>
      {parsed.rank}
      {parsed.suit}
    </span>
  );
}

function actionText(action: PublicActionView): string {
  const name = action.playerId ? SEAT_NAMES[action.seat ?? 0] : "牌桌";
  if (action.type === "uncalled_return") {
    return `${name} 收回未跟注 ${formatChips(action.amount ?? 0)}`;
  }
  const verb: Record<Exclude<PublicActionView["type"], "uncalled_return">, string> = {
    fold: "弃牌",
    check: "过牌",
    call: `跟注 ${formatChips(action.amount ?? 0)}`,
    bet: `下注至 ${formatChips(action.amountTo ?? 0)}`,
    raise: `加注至 ${formatChips(action.amountTo ?? 0)}`,
    all_in: "全下",
  };
  return `${name} ${verb[action.type]}`;
}

function seatBadge(seat: SeatId, table: PublicTableView): string | null {
  if (table.buttonSeat === null) return null;
  if (seat === table.buttonSeat) return "D";
  if (seat === (table.buttonSeat + 1) % 5) return "SB";
  if (seat === (table.buttonSeat + 2) % 5) return "BB";
  return null;
}

function Seat({
  seat,
  player,
  table,
  isActing,
}: {
  seat: SeatId;
  player: PublicPlayerView;
  table: PublicTableView;
  isActing: boolean;
}) {
  const badge = seatBadge(seat, table);
  const isHuman = seat === 0;
  const latest = [...table.actions].reverse().find((action) => action.seat === seat);
  const hidden = player.cards === null || player.cards.length === 0;

  return (
    <div className={`seat seat-${seat}`}>
      <div
        className={`rounded-2xl border p-2.5 shadow-xl backdrop-blur-sm transition ${
          isActing
            ? "border-[#f4c76b] bg-[#173f32]/95 shadow-[#f4c76b]/20"
            : "border-white/10 bg-[#0c211b]/90"
        } ${player.isFolded ? "opacity-60" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-[#f7f2e7]">
                {SEAT_NAMES[seat]}
              </span>
              {badge ? (
                <span className="rounded-full bg-[#f4c76b] px-1.5 py-0.5 text-[9px] font-black text-[#1c2019]">
                  {badge}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[10px] text-white/55">
              {positionName(seat, table.buttonSeat)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-[#f4c76b]">{formatChips(player.stack)}</div>
            <div className="text-[9px] uppercase tracking-wide text-white/45">
              {player.status === "all_in" ? "全下" : player.status === "folded" ? "已弃牌" : "筹码"}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-h-11 items-center gap-1">
            {isHuman ? (
              hidden ? (
                <PlayingCard hidden />
              ) : (
                player.cards?.map((card, index) => (
                  <PlayingCard key={`${seat}-${index}`} card={card} />
                ))
              )
            ) : hidden && !player.cardsShown ? (
              <>
                <PlayingCard hidden />
                <PlayingCard hidden />
              </>
            ) : (
              player.cards?.map((card, index) => (
                <PlayingCard key={`${seat}-${index}`} card={card} hidden={card === null} />
              ))
            )}
          </div>
          {player.betThisStreet > 0 ? (
            <span className="rounded-full bg-black/25 px-2 py-1 text-[10px] font-semibold text-[#f4c76b]">
              本轮 {formatChips(player.betThisStreet)}
            </span>
          ) : null}
        </div>

        {latest ? (
          <div className="mt-1 truncate text-[10px] text-white/45">{actionText(latest)}</div>
        ) : (
          <div className="mt-1 text-[10px] text-white/30">尚未行动</div>
        )}
      </div>
    </div>
  );
}

function AmountControls({
  legal,
  amount,
  setAmount,
  disabled,
  onSubmit,
}: {
  legal: LegalActionView;
  amount: string;
  setAmount: (value: string) => void;
  disabled: boolean;
  onSubmit: (action: ActionName, amountTo: number | null) => void;
}) {
  const canBet = legal.actions.includes("bet");
  const canRaise = legal.actions.includes("raise");
  const canAllIn = legal.actions.includes("all_in");
  const min = canBet ? legal.minBetTo : canRaise ? legal.minRaiseTo : null;
  const label = canBet ? "下注至" : "加注至";
  const numeric = Number(amount);
  const valid =
    Number.isSafeInteger(numeric) &&
    numeric > 0 &&
    (min === null || numeric >= min) &&
    numeric <= legal.maxTo;

  return (
    <div className="flex flex-wrap items-end gap-2">
      {canBet || canRaise ? (
        <>
          <label className="text-[11px] text-white/60">
            {label}
            <input
              className="ml-1 w-24 rounded-lg border border-white/15 bg-black/25 px-2 py-2 text-sm text-white"
              type="number"
              inputMode="numeric"
              min={min ?? 1}
              max={legal.maxTo}
              step={1}
              value={amount}
              disabled={disabled}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={disabled || !valid}
            onClick={() => onSubmit(canBet ? "bet" : "raise", numeric)}
            className="rounded-lg bg-[#f4c76b] px-3 py-2 text-xs font-bold text-[#182018] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {canBet ? "下注" : "加注"}
          </button>
        </>
      ) : null}
      {canAllIn ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit("all_in", null)}
          className="rounded-lg border border-[#f4c76b]/40 px-3 py-2 text-xs font-bold text-[#f4c76b] disabled:opacity-40"
        >
          全下
        </button>
      ) : null}
      <span className="text-[10px] text-white/35">
        {min !== null ? `最小 ${formatChips(min)} · ` : ""}
        最大 {formatChips(legal.maxTo)}
      </span>
    </div>
  );
}

export default function HomePage() {
  const [game, setGame] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [storedKey, setStoredKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("not_configured");
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const booted = useRef(false);
  const botGuard = useRef<string | null>(null);
  const modeInFlight = useRef(false);

  useEffect(() => {
    const stored = readStoredKey();
    setAiKey(stored);
    setStoredKey(stored);
    setKeyStatus(stored ? "untested" : "not_configured");
    setKeyLoaded(true);
  }, []);

  const reportError = useCallback((caught: unknown) => {
    if (caught instanceof ClientApiError) {
      setError(`${caught.code}: ${caught.message}`);
    } else {
      setError(caught instanceof Error ? caught.message : "未知错误");
    }
  }, []);

  const startTable = useCallback(
    async (restart: boolean) => {
      setBusy(true);
      setError(null);
      setExpired(false);
      try {
        const data = await api<GameStateResponse>("/api/game/start", {
          method: "POST",
          body: JSON.stringify({ requestId: newRequestId(), restart }),
        });
        localStorage.setItem(STORAGE_KEY, data.gameId);
        botGuard.current = null;
        setGame(data);
        setNotice(restart ? "已创建新牌桌" : "牌桌已创建");
      } catch (caught) {
        reportError(caught);
      } finally {
        setBusy(false);
        setLoading(false);
      }
    },
    [reportError],
  );

  const loadTable = useCallback(async () => {
    const gameId = localStorage.getItem(STORAGE_KEY);
    if (!gameId) {
      await startTable(false);
      return;
    }
    try {
      const data = await api<GameStateResponse>(
        `/api/game/state?gameId=${encodeURIComponent(gameId)}`,
      );
      botGuard.current = null;
      setGame(data);
      setExpired(false);
      setError(null);
    } catch (caught) {
      if (caught instanceof ClientApiError && (caught.status === 404 || caught.status === 410)) {
        localStorage.removeItem(STORAGE_KEY);
        setExpired(true);
        setGame(null);
        setError("原牌桌会话已过期或服务端已重启。请创建新牌桌。");
      } else {
        reportError(caught);
      }
    } finally {
      setLoading(false);
    }
  }, [reportError, startTable]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void loadTable();
  }, [loadTable]);

  useEffect(() => {
    if (!game || game.table.actionToSeat !== 0 || !game.table.legalActions) return;
    const legal = game.table.legalActions;
    const suggested = legal.minRaiseTo ?? legal.minBetTo ?? legal.maxTo;
    setAmount(suggested > 0 ? String(suggested) : "");
  }, [game?.gameId, game?.turnId]);

  const changeAiMode = useCallback(
    async (operation: AiModeOperation): Promise<boolean> => {
      if (!game || modeInFlight.current) return false;
      if (operation === "enable" && keyStatus !== "available") {
        setKeyMessage("请先保存并测试 Key");
        return false;
      }
      modeInFlight.current = true;
      setModeBusy(true);
      setKeyMessage(null);
      try {
        const data = await api<GameStateResponse>("/api/ai/mode", {
          method: "POST",
          body: JSON.stringify({
            gameId: game.gameId,
            expectedVersion: game.stateVersion,
            requestId: newRequestId(),
            operation,
          }),
        });
        setGame(data);
        setError(null);
        if (operation === "enable") setNotice("智能模式已启用");
        if (operation === "rotate") setNotice("Key 已轮换，aiEpoch 已推进");
        return true;
      } catch (caught) {
        reportError(caught);
        return false;
      } finally {
        modeInFlight.current = false;
        setModeBusy(false);
      }
    },
    [game, keyStatus, reportError],
  );

  const saveAndTestKey = useCallback(async () => {
    const key = aiKey.trim();
    if (!key) {
      setKeyStatus("not_configured");
      setKeyMessage("请输入 Key");
      return;
    }
    setKeyBusy(true);
    setKeyStatus("testing");
    setKeyMessage("正在连接 DeepSeek…");
    try {
      const result = await api<AiTestResponse>("/api/ai/test", {
        method: "POST",
        headers: { [DEEPSEEK_KEY_HEADER]: key },
        body: JSON.stringify({ requestId: newRequestId() }),
      });
      setKeyStatus(result.status);
      setKeyMessage(result.message);
      if (result.status === "available") {
        if (game?.aiMode === "enabled" && storedKey !== key) {
          const rotated = await changeAiMode("rotate");
          if (!rotated) {
            setKeyMessage("新 Key 已验证，但 aiEpoch 轮换未确认；旧 Key 仍为当前 Key");
            return;
          }
        }
        storeKey(key);
        setStoredKey(key);
      } else {
        storeKey("");
        setStoredKey("");
      }
    } catch (caught) {
      storeKey("");
      setStoredKey("");
      setKeyStatus("unavailable");
      setKeyMessage(
        caught instanceof ClientApiError ? `${caught.code}: ${caught.message}` : "连接测试失败",
      );
    } finally {
      setKeyBusy(false);
    }
  }, [aiKey, changeAiMode, game?.aiMode, storedKey]);

  const clearKey = useCallback(async () => {
    storeKey("");
    setAiKey("");
    setStoredKey("");
    setKeyStatus("not_configured");
    setKeyMessage("本地 Key 已清除");
    botGuard.current = null;
    if (game?.aiMode === "enabled") {
      if (modeInFlight.current) {
        setKeyMessage("本地已清除，正在等待服务端停用确认");
        return;
      }
      const confirmed = await changeAiMode("disable");
      if (!confirmed) {
        setKeyStatus("unconfirmed");
        setKeyMessage("本地已清除，服务端停用尚未确认");
      }
    }
  }, [changeAiMode, game?.aiMode]);

  const autoDisableGuard = useRef<string | null>(null);
  useEffect(() => {
    if (!keyLoaded || !game || game.aiMode !== "enabled" || storedKey.trim() || modeBusy) return;
    const key = `${game.gameId}:${game.aiEpoch}`;
    if (autoDisableGuard.current === key) return;
    autoDisableGuard.current = key;
    void changeAiMode("disable");
  }, [keyLoaded, storedKey, changeAiMode, game, modeBusy]);

  useEffect(() => {
    if (!game?.pendingDecision) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const data = await api<GameStateResponse>(
          `/api/game/state?gameId=${encodeURIComponent(game.gameId)}`,
        );
        if (!cancelled) setGame(data);
      } catch {
        // The next poll or a mode change will settle the state.
      }
    }, 700);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [game?.gameId, game?.pendingDecision?.decisionId]);

  useEffect(() => {
    if (!keyLoaded || !game || game.phase !== "playing" || game.pendingDecision) return;
    const seat = game.table.actionToSeat;
    if (seat === null || seat === 0) return;
    if (game.aiMode === "enabled" && !storedKey.trim()) return;

    const key = `${game.gameId}:${game.turnId}`;
    if (botGuard.current === key) return;
    botGuard.current = key;

    const run = async () => {
      setBusy(true);
      try {
        const data = await api<BotDecisionResponse>("/api/ai/decision", {
          method: "POST",
          headers:
            game.aiMode === "enabled" && storedKey.trim()
              ? { [DEEPSEEK_KEY_HEADER]: storedKey.trim() }
              : undefined,
          body: JSON.stringify({
            gameId: game.gameId,
            handId: game.handId,
            turnId: game.turnId,
            expectedVersion: game.stateVersion,
            requestId: newRequestId(),
            aiEpoch: game.aiEpoch,
          }),
        });
        if (botGuard.current === key) {
          setGame(data);
          setError(null);
        }
      } catch (caught) {
        if (botGuard.current === key) reportError(caught);
      } finally {
        if (botGuard.current === key) setBusy(false);
      }
    };

    // Do not cancel this request in the effect cleanup: React StrictMode runs
    // effect setup/cleanup/setup in development, and cancelling the first
    // request while keeping the turn guard would leave the table stuck.
    void run();
  }, [storedKey, keyLoaded, game, reportError]);

  const refresh = useCallback(async () => {
    if (!game) return;
    botGuard.current = null;
    try {
      const data = await api<GameStateResponse>(
        `/api/game/state?gameId=${encodeURIComponent(game.gameId)}`,
      );
      setGame(data);
      setError(null);
    } catch (caught) {
      reportError(caught);
    }
  }, [game, reportError]);

  const submitAction = useCallback(
    async (action: ActionName, amountTo: number | null) => {
      if (!game || busy || game.phase !== "playing" || game.table.actionToSeat !== 0) return;
      const request: GameActionRequest = {
        gameId: game.gameId,
        handId: game.handId,
        turnId: game.turnId,
        expectedVersion: game.stateVersion,
        requestId: newRequestId(),
        action,
        amountTo: action === "bet" || action === "raise" ? amountTo : null,
      };
      setBusy(true);
      setError(null);
      try {
        const data = await api<GameStateResponse>("/api/game/action", {
          method: "POST",
          body: JSON.stringify(request),
        });
        setGame(data);
      } catch (caught) {
        reportError(caught);
      } finally {
        setBusy(false);
      }
    },
    [busy, game, reportError],
  );

  const nextHand = useCallback(async () => {
    if (!game || busy || !game.canStartNextHand) return;
    const request: NextHandRequest = {
      gameId: game.gameId,
      expectedVersion: game.stateVersion,
      requestId: newRequestId(),
      rebuy: game.rebuyRequired,
    };
    setBusy(true);
    setError(null);
    try {
      const data = await api<GameStateResponse>("/api/game/next", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setGame(data);
      setNotice(game.rebuyRequired ? "已补充 1,000 虚拟筹码" : "下一手已开始");
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }, [busy, game, reportError]);

  const table = game?.table;
  const legal = table?.legalActions;
  const humanPlayer = table?.players.find((player) => player.seat === 0);
  const callCost = legal ? Math.min(legal.toCall, humanPlayer?.stack ?? legal.toCall) : 0;
  const isHumanTurn = Boolean(game && table?.actionToSeat === 0 && game.phase === "playing");

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-8 py-6 text-center">
          <div className="text-lg font-semibold text-[#f4c76b]">正在准备牌桌…</div>
          <div className="mt-2 text-xs text-white/50">本地机器人 · 无需 Key</div>
        </div>
      </main>
    );
  }

  if (expired || !game || !table) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/25 p-8 text-center shadow-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f4c76b]">
            Poker AI V3.2
          </div>
          <h1 className="mt-3 text-2xl font-bold">牌桌未连接</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            {error ?? "会话不可用。刷新仅在原服务进程存活且会话未过期时有效。"}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startTable(true)}
            className="mt-6 rounded-xl bg-[#f4c76b] px-5 py-3 text-sm font-bold text-[#182018] disabled:opacity-40"
          >
            {busy ? "正在创建…" : "创建新牌桌"}
          </button>
        </section>
      </main>
    );
  }

  const lastTopUp = game.topUps.at(-1);
  const pot = table.potTotal;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#f4c76b]">
            Poker AI · Stage C
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            五人桌 · 本地 / 智能机器人
          </h1>
          <p className="mt-1 text-xs text-white/45">
            5/10 盲注 · 1,000 起始筹码 · 服务端裁决 · 智能模式需自带 DeepSeek Key
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#f4c76b]/30 bg-[#f4c76b]/10 px-3 py-1.5 text-[10px] font-semibold text-[#f4c76b]">
            {game.aiMode === "disabled" ? "基础策略" : `智能模式 · e${game.aiEpoch}`}
          </span>
          {game.pendingDecision ? (
            <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1.5 text-[10px] text-sky-200">
              AI 思考中
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45">
            第 {table.handNumber} 手 · v{game.stateVersion}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/65 hover:bg-white/5"
          >
            刷新状态
          </button>
          <button
            type="button"
            onClick={() => void startTable(true)}
            disabled={busy}
            className="rounded-lg border border-[#f4c76b]/30 px-3 py-1.5 text-xs font-semibold text-[#f4c76b] disabled:opacity-40"
          >
            新牌桌
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-300/70">
            关闭
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-200/85">
          {notice}
          {lastTopUp
            ? ` · 最近补码：${SEAT_NAMES[lastTopUp.seat]} +${formatChips(lastTopUp.amount)}`
            : ""}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="poker-table">
          <div className="absolute left-1/2 top-1/2 z-10 w-[300px] -translate-x-1/2 -translate-y-1/2 text-center sm:w-[380px]">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#f4c76b]/80">
              {table.street === "preflop"
                ? "翻前"
                : table.street === "flop"
                  ? "翻牌"
                  : table.street === "turn"
                    ? "转牌"
                    : table.street === "river"
                      ? "河牌"
                      : "摊牌"}
            </div>
            <div className="flex min-h-14 items-center justify-center gap-1.5">
              {table.board.length > 0 ? (
                table.board.map((card) => <PlayingCard key={card} card={card} />)
              ) : (
                <span className="text-xs text-white/30">公共牌</span>
              )}
            </div>
            <div className="mt-3 inline-flex items-baseline gap-2 rounded-full border border-[#f4c76b]/20 bg-black/20 px-4 py-2">
              <span className="text-[10px] uppercase tracking-widest text-white/45">底池</span>
              <span className="text-xl font-black text-[#f4c76b]">{formatChips(pot)}</span>
            </div>
            {game.phase === "playing" && table.actionToSeat !== null ? (
              <div className="mt-3 text-[11px] text-white/55">
                {game.pendingDecision
                  ? "AI 正在思考…"
                  : table.actionToSeat === 0
                    ? "轮到你行动"
                    : `${SEAT_NAMES[table.actionToSeat]} 思考中…`}
              </div>
            ) : null}
          </div>

          {table.players.map((player) => (
            <Seat
              key={player.seat}
              seat={player.seat}
              player={player}
              table={table}
              isActing={table.actionToSeat === player.seat}
            />
          ))}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[#8ec5ff]/20 bg-[#0a2334]/45 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white/85">DeepSeek Key</h2>
                <p className="mt-1 text-[10px] leading-4 text-white/40">
                  只存当前标签页 sessionStorage；测试会请求 DeepSeek，可能产生少量用量。
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[9px] text-white/60">
                {KEY_STATUS_TEXT[keyStatus]}
              </span>
            </div>

            <input
              type="password"
              value={aiKey}
              onChange={(event) => {
                setAiKey(event.target.value);
                setKeyStatus(event.target.value.trim() ? "untested" : "not_configured");
                setKeyMessage(null);
              }}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
              className="mt-3 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/25"
            />

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={keyBusy || !aiKey.trim()}
                onClick={() => void saveAndTestKey()}
                className="rounded-lg bg-[#8ec5ff] px-2.5 py-1.5 text-[10px] font-bold text-[#10202b] disabled:opacity-35"
              >
                {keyBusy ? "测试中…" : "保存并测试"}
              </button>

              {game.aiMode === "disabled" ? (
                <button
                  type="button"
                  disabled={keyStatus !== "available" || modeBusy || keyBusy}
                  onClick={() => void changeAiMode("enable")}
                  className="rounded-lg border border-emerald-300/30 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200 disabled:opacity-30"
                >
                  启用智能
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={modeBusy || keyStatus !== "available" || keyBusy}
                    onClick={() => void changeAiMode("rotate")}
                    className="rounded-lg border border-[#f4c76b]/30 px-2.5 py-1.5 text-[10px] font-semibold text-[#f4c76b] disabled:opacity-30"
                  >
                    轮换 Key
                  </button>
                  <button
                    type="button"
                    disabled={modeBusy}
                    onClick={() => void changeAiMode("disable")}
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] font-semibold text-white/65 disabled:opacity-30"
                  >
                    停用智能
                  </button>
                </>
              )}

              <button
                type="button"
                disabled={!storedKey && game.aiMode === "disabled"}
                onClick={() => void clearKey()}
                className="rounded-lg border border-rose-300/20 px-2.5 py-1.5 text-[10px] font-semibold text-rose-200/80 disabled:opacity-25"
              >
                清除 Key
              </button>
            </div>

            {keyMessage ? (
              <p className="mt-2 text-[10px] leading-4 text-white/45">{keyMessage}</p>
            ) : null}
            {game.aiMode === "enabled" ? (
              <p className="mt-2 text-[10px] leading-4 text-[#f4c76b]/70">
                智能模式 epoch {game.aiEpoch}。清除或轮换会使旧响应失效。
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white/85">行动</h2>
              <span className="text-[10px] text-white/35">
                {game.pendingDecision
                  ? "AI 决策中"
                  : isHumanTurn
                    ? `跟注成本 ${formatChips(callCost)}`
                    : "等待"}
              </span>
            </div>

            {game.phase === "settled" ? (
              <div className="mt-4">
                <div className="text-xs text-white/55">本手已结算</div>
                <div className="mt-2 space-y-1.5">
                  {(table.winners ?? []).map((winner) => (
                    <div
                      key={winner.seat}
                      className="flex items-center justify-between rounded-lg bg-[#f4c76b]/10 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-[#f4c76b]">
                        {SEAT_NAMES[winner.seat]} +{formatChips(winner.amount)}
                      </span>
                      <span className="text-white/45">{winner.handRank ?? "胜出"}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void nextHand()}
                  className="mt-4 w-full rounded-xl bg-[#f4c76b] px-4 py-3 text-sm font-bold text-[#182018] disabled:opacity-40"
                >
                  {busy ? "处理中…" : game.rebuyRequired ? "补充 1,000 虚拟筹码并继续" : "下一手"}
                </button>
                {game.rebuyRequired ? (
                  <p className="mt-2 text-center text-[10px] text-white/40">
                    你在本手输光了筹码；补码只发生在两手之间。
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!isHumanTurn || busy || !legal?.actions.includes("fold")}
                    onClick={() => void submitAction("fold", null)}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-30"
                  >
                    弃牌
                  </button>
                  {legal?.actions.includes("check") ? (
                    <button
                      type="button"
                      disabled={!isHumanTurn || busy}
                      onClick={() => void submitAction("check", null)}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
                    >
                      过牌
                    </button>
                  ) : null}
                  {legal?.actions.includes("call") ? (
                    <button
                      type="button"
                      disabled={!isHumanTurn || busy}
                      onClick={() => void submitAction("call", null)}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
                    >
                      跟注 {formatChips(callCost)}
                      {callCost < legal.toCall ? "（全下）" : ""}
                    </button>
                  ) : null}
                </div>

                {isHumanTurn && legal ? (
                  <div className="mt-3">
                    <AmountControls
                      legal={legal}
                      amount={amount}
                      setAmount={setAmount}
                      disabled={busy}
                      onSubmit={(action, amountTo) => void submitAction(action, amountTo)}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-white/40">
                    {game.pendingDecision
                      ? "正在等待当前 AI 决策提交；刷新会先同步，不会新建同一回合的决策。"
                      : game.phase === "playing"
                        ? "机器人按行动顺序自动推进。"
                        : "等待结算。"}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white/85">行动记录</h2>
              <span className="text-[10px] text-white/30">{table.actions.length} 条</span>
            </div>
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {table.actions.length === 0 ? (
                <p className="text-xs text-white/35">本手尚未行动</p>
              ) : (
                [...table.actions]
                  .slice(-30)
                  .reverse()
                  .map((action) => (
                    <div
                      key={action.eventId}
                      className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-[10px] hover:bg-white/5"
                    >
                      <span className="text-white/60">{actionText(action)}</span>
                      <span className="shrink-0 text-white/25">{action.street}</span>
                    </div>
                  ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/15 p-4 text-[10px] leading-5 text-white/40">
            <div className="font-semibold text-white/60">当前边界</div>
            <p className="mt-1">
              阶段 C 已接入按请求传输的 DeepSeek Key、模式/epoch 与 pending
              控制；真实模型质量/完整输出校验仍属阶段 D。刷新依赖同一 Node
              进程与未过期会话；服务端重启会要求重新开桌。
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
