import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction
} from "react";
import type { Command, DevCard as DevCardModel, DevCardType, GameState, PlayerState } from "../../domain/types";
import type { UiSelection, UiTool } from "../gameUiTypes";
import { DevCard } from "./DevCard";

interface DevCardGroup {
  type: DevCardType;
  cards: DevCardModel[];
}

const HOVER_SELECT_DELAY_MS = 50;
const HOVER_ANCHOR_PAD_PX = 18;
const DENIED_RETURN_DELAY_MS = 440;

interface HoverAnchor {
  cardId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function DevCardHand({
  state,
  player,
  submit,
  setTool,
  setSelection
}: {
  state: GameState;
  player: PlayerState;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const hoverTimeoutRef = useRef<number>();
  const retractTimeoutRef = useRef<number>();
  const selectedCardIdRef = useRef<string>();
  const hoverAnchorRef = useRef<HoverAnchor>();
  const lastPointerRef = useRef<{ x: number; y: number }>();
  const deniedCardIdRef = useRef<string>();
  const deniedReturnTimeoutRef = useRef<number>();
  const groupedCards = useMemo(() => {
    const groups = new Map<DevCardType, DevCardGroup>();
    for (const card of player.devCards) {
      const group = groups.get(card.type);
      if (group) {
        group.cards.push(card);
      } else {
        groups.set(card.type, { type: card.type, cards: [card] });
      }
    }
    return [...groups.values()];
  }, [player.devCards]);

  useEffect(() => {
    return () => {
      clearHoverSelect();
      clearRetract();
      clearDeniedHold();
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const selectedId = selectedCardIdRef.current;
      const anchor = hoverAnchorRef.current;
      if (!selectedId || !anchor || anchor.cardId !== selectedId) return;
      if (deniedCardIdRef.current === selectedId) return;
      if (isInsideHoverAnchor(anchor, event.clientX, event.clientY)) {
        clearRetract();
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target instanceof HTMLElement && target.closest(`[data-dev-card-id="${selectedId}"]`)) {
        clearRetract();
        return;
      }
      retractNow();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const clearHoverSelect = () => {
    if (hoverTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = undefined;
    }
  };

  const clearRetract = () => {
    if (retractTimeoutRef.current !== undefined) {
      window.clearTimeout(retractTimeoutRef.current);
      retractTimeoutRef.current = undefined;
    }
  };

  const selectCard = (cardId: string) => {
    clearHoverSelect();
    clearRetract();
    clearDeniedHold();
    setSelected(cardId);
  };

  const scheduleHoverSelect = (cardId: string, event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    hoverAnchorRef.current = {
      cardId,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    };
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    clearHoverSelect();
    clearRetract();
    hoverTimeoutRef.current = window.setTimeout(() => {
      setSelected(cardId);
      hoverTimeoutRef.current = undefined;
    }, HOVER_SELECT_DELAY_MS);
  };

  const scheduleRetract = () => {
    clearHoverSelect();
    clearRetract();
    if (isPointerInsideCurrentAnchor()) return;
    retractNow();
  };

  const retractNow = () => {
    clearHoverSelect();
    clearRetract();
    if (deniedCardIdRef.current === selectedCardIdRef.current) return;
    setSelected(undefined);
    hoverAnchorRef.current = undefined;
  };

  const clearDeniedHold = () => {
    if (deniedReturnTimeoutRef.current !== undefined) {
      window.clearTimeout(deniedReturnTimeoutRef.current);
      deniedReturnTimeoutRef.current = undefined;
    }
    deniedCardIdRef.current = undefined;
  };

  const holdSelectedDuringDeniedAnimation = (cardId: string) => {
    clearHoverSelect();
    clearRetract();
    if (deniedReturnTimeoutRef.current !== undefined) {
      window.clearTimeout(deniedReturnTimeoutRef.current);
    }
    deniedCardIdRef.current = cardId;
    deniedReturnTimeoutRef.current = window.setTimeout(() => {
      deniedReturnTimeoutRef.current = undefined;
      if (deniedCardIdRef.current !== cardId) return;
      deniedCardIdRef.current = undefined;
      if (selectedCardIdRef.current !== cardId) return;
      if (!isPointerInsideCurrentAnchor() && !isPointerOverCard(cardId)) retractNow();
    }, DENIED_RETURN_DELAY_MS);
  };

  const isPointerOverCard = (cardId: string) => {
    const pointer = lastPointerRef.current;
    if (!pointer) return false;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    return target instanceof HTMLElement && target.closest(`[data-dev-card-id="${cardId}"]`);
  };

  const setSelected = (cardId: string | undefined) => {
    selectedCardIdRef.current = cardId;
    setSelectedCardId(cardId);
  };

  const isPointerInsideCurrentAnchor = () => {
    const anchor = hoverAnchorRef.current;
    const pointer = lastPointerRef.current;
    if (!anchor || !pointer || anchor.cardId !== selectedCardIdRef.current) return false;
    return isInsideHoverAnchor(anchor, pointer.x, pointer.y);
  };

  const playCard = (card: DevCardModel): boolean => {
    const playability = getDevCardPlayability(state, player, card);
    if (!playability.playable) {
      setSelected(card.id);
      holdSelectedDuringDeniedAnimation(card.id);
      return false;
    }
    if (card.type === "merchant") {
      setTool("none");
      setSelection({ kind: "devMerchant", cardId: card.id });
      return true;
    }
    if (card.type === "militiaMobilization") {
      setTool("none");
      setSelection({ kind: "devMilitia", cardId: card.id });
      return true;
    }
    if (card.type === "roadCrew") {
      setTool("transport");
      setSelection({ kind: "devRoadCrew", cardId: card.id, routeType: "transport", routes: [] });
      return true;
    }
    submit({ type: "playDevelopmentCard", cardId: card.id });
    return true;
  };

  if (player.devCards.length === 0) return null;

  return (
    <div
      className="dev-card-hand"
      aria-label="发展卡手牌"
      onMouseEnter={clearRetract}
      onMouseLeave={scheduleRetract}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleRetract();
      }}
    >
      {groupedCards.map((group, index) => {
        const card = group.cards[0];
        const playability = getDevCardPlayability(state, player, card);
        return (
          <DevCard
            key={group.type}
            card={card}
            playable={playability.playable}
            reason={playability.reason}
            selected={selectedCardId === card.id}
            count={group.cards.length}
            index={index}
            total={groupedCards.length}
            onSelect={() => selectCard(card.id)}
            onHover={(event) => scheduleHoverSelect(card.id, event)}
            onHoverEnd={clearHoverSelect}
            onPlay={() => playCard(card)}
          />
        );
      })}
    </div>
  );
}

function isInsideHoverAnchor(anchor: HoverAnchor, x: number, y: number) {
  return (
    x >= anchor.left - HOVER_ANCHOR_PAD_PX &&
    x <= anchor.right + HOVER_ANCHOR_PAD_PX &&
    y >= anchor.top - HOVER_ANCHOR_PAD_PX &&
    y <= anchor.bottom + HOVER_ANCHOR_PAD_PX
  );
}

function getDevCardPlayability(
  state: GameState,
  player: PlayerState,
  card: DevCardModel
): { playable: boolean; reason?: string } {
  if (state.pending) return { playable: false, reason: "请先完成待处理事项" };
  if (state.phase !== "action" || player.id !== state.currentPlayerId) {
    return { playable: false, reason: "当前不能打出" };
  }
  if (card.type === "secretBase") return { playable: false, reason: "秘密据点不能主动打出" };
  if (card.purchasedTurn === state.turn) return { playable: false, reason: "本回合刚购买" };
  if (player.usedDevCardThisTurn) return { playable: false, reason: "本回合已打出发展卡" };
  return { playable: true };
}
