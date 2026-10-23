import type { PublicInsightResponse } from "@/shared/api";
import type { StreetName } from "@/shared/contracts";
import type { PublicActionSnapshot } from "./types";

const STREET_TEXT: Record<StreetName, string> = {
  preflop: "翻前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
};

function actionPhrase(snapshot: PublicActionSnapshot): string {
  const amount = snapshot.amountTo ?? snapshot.amount;
  switch (snapshot.action) {
    case "fold":
      return "弃牌";
    case "check":
      return "过牌";
    case "call":
      return `跟注 ${amount}`;
    case "bet":
      return `下注至 ${snapshot.amountTo ?? amount}`;
    case "raise":
      return `加注至 ${snapshot.amountTo ?? amount}`;
    case "all_in":
      return "全下";
  }
}

function publicEffect(action: PublicActionSnapshot["action"]): string {
  switch (action) {
    case "fold":
      return "退出本手争夺。";
    case "check":
      return "没有增加本街投入。";
    case "call":
      return "继续参与底池。";
    case "bet":
    case "raise":
      return "提高了其他玩家继续参与的成本。";
    case "all_in":
      return "把全部筹码投入底池。";
  }
}

/**
 * Independent public template. It never reads a private decision reason, card,
 * confidence label or model output; only the captured public action snapshot.
 */
export function buildPublicInsight(snapshot: PublicActionSnapshot): PublicInsightResponse {
  return {
    actionEventId: snapshot.actionEventId,
    handId: snapshot.handId,
    seat: snapshot.seat,
    playerId: snapshot.playerId,
    action: snapshot.action,
    amountTo: snapshot.amountTo,
    street: snapshot.street,
    generatedBy: "template",
    text:
      `${snapshot.playerName} 在${STREET_TEXT[snapshot.street]}${actionPhrase(snapshot)}。` +
      `${publicEffect(snapshot.action)}` +
      "这个动作可能出于多种公开可见的意图；公开信息不足以确定其真实手牌或完整内部决策理由。",
  };
}
