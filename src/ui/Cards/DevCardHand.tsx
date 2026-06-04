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
import type { UiOperationContext, UiSelection, UiTool } from "../gameUiTypes";
import { useCoarsePointer } from "../useCoarsePointer";
import { DevCard } from "./DevCard";

interface DevCardGroup {
  type: DevCardType;
  cards: DevCardModel[];
}

const HOVER_SELECT_DELAY_MS = 50;
const HOVER_ANCHOR_PAD_PX = 18;
const DENIED_RETURN_DELAY_MS = 440;
const TOUCH_CARD_ZONE_PAD_PX = 28;
const TOUCH_PULL_START_PX = 34;
const TOUCH_PULL_INTENT_RATIO = 0.55;
const TOUCH_PULL_RETAIN_PX = 20;
const TOUCH_PULL_PLAY_PX = 88;
const TOUCH_PULL_MAX_PX = 110;

interface HoverAnchor {
  cardId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

type TouchCardZone = HoverAnchor;

interface TouchExploreState {
  pointerId: number;
  cardId?: string;
  mode: "explore" | "pull";
  startX: number;
  startY: number;
}

interface TouchDragVisual {
  cardId: string;
  pullDistance: number;
  playReady: boolean;
}

export function DevCardHand({
  state,
  player,
  submit,
  setTool,
  setSelection,
  setOperationContext
}: {
  state: GameState;
  player: PlayerState;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
}) {
  const isCoarsePointer = useCoarsePointer();
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [touchDragVisual, setTouchDragVisual] = useState<TouchDragVisual>();
  const [touchDeniedCardId, setTouchDeniedCardId] = useState<string>();
  const [touchExploring, setTouchExploring] = useState(false);
  const handRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<number>();
  const retractTimeoutRef = useRef<number>();
  const selectedCardIdRef = useRef<string>();
  const hoverAnchorRef = useRef<HoverAnchor>();
  const touchCardZonesRef = useRef<TouchCardZone[]>([]);
  const activeTouchRef = useRef<TouchExploreState>();
  const lastPointerRef = useRef<{ x: number; y: number }>();
  const deniedCardIdRef = useRef<string>();
  const deniedReturnTimeoutRef = useRef<number>();
  const touchDeniedTimeoutRef = useRef<number>();
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
  const renderedCardsById = useMemo(() => {
    return new Map(groupedCards.map((group) => [group.cards[0].id, group.cards[0]]));
  }, [groupedCards]);

  useEffect(() => {
    return () => {
      clearHoverSelect();
      clearRetract();
      clearDeniedHold();
      clearTouchDeniedFeedback();
      activeTouchRef.current = undefined;
      touchCardZonesRef.current = [];
      setTouchExploring(false);
    };
  }, []);

  useEffect(() => {
    if (isCoarsePointer) return undefined;
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
  }, [isCoarsePointer]);

  useEffect(() => {
    if (!isCoarsePointer) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const hand = handRef.current;
      if (!hand || !selectedCardIdRef.current) return;
      if (event.target instanceof Node && hand.contains(event.target)) return;
      retractNow();
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true, capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [isCoarsePointer]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const activeTouch = activeTouchRef.current;
      if (!activeTouch || event.pointerId !== activeTouch.pointerId) return;
      event.preventDefault();
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      const targetCardId = getTouchCardIdAtPoint(event.clientX, event.clientY);
      if (activeTouch.mode === "pull") {
        const pullDistance = activeTouch.cardId ? Math.max(0, activeTouch.startY - event.clientY) : 0;
        if (targetCardId && pullDistance < TOUCH_PULL_RETAIN_PX) {
          activateTouchCard(activeTouch, targetCardId, event.clientX, event.clientY);
          clearTouchDrag();
          return;
        }
        if (activeTouch.cardId) setTouchPull(activeTouch.cardId, pullDistance);
        return;
      }

      if (targetCardId) {
        activateTouchCard(activeTouch, targetCardId, event.clientX, event.clientY);
        if (shouldStartTouchPull(activeTouch, event.clientX, event.clientY)) {
          activeTouch.mode = "pull";
          setTouchPull(targetCardId, Math.max(0, activeTouch.startY - event.clientY));
          return;
        }
        clearTouchDrag();
        return;
      }

      if (activeTouch.cardId && shouldStartTouchPull(activeTouch, event.clientX, event.clientY)) {
        activeTouch.mode = "pull";
        setTouchPull(activeTouch.cardId, Math.max(0, activeTouch.startY - event.clientY));
        return;
      }

      activeTouch.cardId = undefined;
      clearTouchDrag();
      retractNow();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const activeTouch = activeTouchRef.current;
      if (!activeTouch || event.pointerId !== activeTouch.pointerId) return;
      event.preventDefault();
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const cardId = activeTouch.cardId;
      const pullDistance = cardId && activeTouch.mode === "pull" ? Math.max(0, activeTouch.startY - event.clientY) : 0;

      clearTouchSession();

      if (cardId && pullDistance >= TOUCH_PULL_PLAY_PX) {
        const card = renderedCardsById.get(cardId);
        if (card) attemptPlayCard(card);
        return;
      }
      retractNow();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const activeTouch = activeTouchRef.current;
      if (!activeTouch || event.pointerId !== activeTouch.pointerId) return;
      clearTouchSession();
      retractNow();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [renderedCardsById]);

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

  const clearTouchDrag = () => {
    setTouchDragVisual(undefined);
  };

  const clearTouchSession = () => {
    activeTouchRef.current = undefined;
    touchCardZonesRef.current = [];
    clearTouchDrag();
    setTouchExploring(false);
  };

  const activateTouchCard = (activeTouch: TouchExploreState, cardId: string, clientX: number, clientY: number) => {
    if (activeTouch.cardId !== cardId) {
      activeTouch.startX = clientX;
      activeTouch.startY = clientY;
    }
    activeTouch.cardId = cardId;
    activeTouch.mode = "explore";
    if (selectedCardIdRef.current !== cardId) selectCard(cardId);
  };

  const setTouchPull = (cardId: string, pullDistance: number) => {
    const clampedDistance = Math.min(TOUCH_PULL_MAX_PX, Math.max(0, pullDistance));
    const playReady = pullDistance >= TOUCH_PULL_PLAY_PX;
    setTouchDragVisual((current) => {
      if (
        current?.cardId === cardId &&
        current.pullDistance === clampedDistance &&
        current.playReady === playReady
      ) {
        return current;
      }
      return { cardId, pullDistance: clampedDistance, playReady };
    });
  };

  const selectCard = (cardId: string) => {
    clearHoverSelect();
    clearRetract();
    clearDeniedHold();
    setSelected(cardId);
  };

  const scheduleHoverSelect = (cardId: string, event: MouseEvent<HTMLElement>) => {
    if (isCoarsePointer) return;
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
    if (isCoarsePointer) return;
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

  const clearTouchDeniedFeedback = () => {
    if (touchDeniedTimeoutRef.current !== undefined) {
      window.clearTimeout(touchDeniedTimeoutRef.current);
      touchDeniedTimeoutRef.current = undefined;
    }
    setTouchDeniedCardId(undefined);
  };

  const showTouchDeniedFeedback = (cardId: string) => {
    clearTouchDeniedFeedback();
    window.requestAnimationFrame(() => {
      setTouchDeniedCardId(cardId);
      touchDeniedTimeoutRef.current = window.setTimeout(() => setTouchDeniedCardId(undefined), 420);
    });
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
    if (!cardId) {
      setOperationContext?.((current) => (current?.kind === "devCardHand" ? undefined : current));
      return;
    }
    const card = renderedCardsById.get(cardId);
    if (!card) return;
    const playability = getDevCardPlayability(state, player, card);
    setOperationContext?.({
      kind: "devCardHand",
      cardType: card.type,
      playable: playability.playable,
      reason: playability.reason
    });
  };

  const captureTouchCardZones = () => {
    const hand = handRef.current;
    if (!hand) {
      touchCardZonesRef.current = [];
      return;
    }
    touchCardZonesRef.current = Array.from(hand.querySelectorAll<HTMLElement>("[data-dev-card-id]")).map(
      (element) => {
        const rect = element.getBoundingClientRect();
        return {
          cardId: element.dataset.devCardId ?? "",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        };
      }
    );
  };

  const getTouchCardIdAtPoint = (x: number, y: number) => {
    const zones = touchCardZonesRef.current;
    let closestZone: { cardId: string; distance: number } | undefined;
    for (const zone of zones) {
      if (
        zone.cardId &&
        x >= zone.left - TOUCH_CARD_ZONE_PAD_PX &&
        x <= zone.right + TOUCH_CARD_ZONE_PAD_PX &&
        y >= zone.top - TOUCH_CARD_ZONE_PAD_PX &&
        y <= zone.bottom + TOUCH_CARD_ZONE_PAD_PX
      ) {
        const centerX = (zone.left + zone.right) / 2;
        const centerY = (zone.top + zone.bottom) / 2;
        const distance = Math.abs(x - centerX) + Math.abs(y - centerY) * 0.35;
        if (!closestZone || distance < closestZone.distance) closestZone = { cardId: zone.cardId, distance };
      }
    }
    if (closestZone) return closestZone.cardId;
    const hand = handRef.current;
    const target = document.elementFromPoint(x, y);
    if (!hand || !(target instanceof HTMLElement)) return undefined;
    const cardElement = target.closest("[data-dev-card-id]") as HTMLElement | null;
    if (!cardElement || !hand.contains(cardElement)) return undefined;
    return cardElement.dataset.devCardId;
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
      setSelection({ kind: "devMilitia", cardId: card.id, vertexIds: [] });
      return true;
    }
    if (card.type === "roadCrew") {
      setTool("transport");
      setSelection({ kind: "devRoadCrew", cardId: card.id, routeType: "transport", routes: [] });
      return true;
    }
    if (card.type === "requisition") {
      setTool("none");
      setSelection({ kind: "devRequisition", cardId: card.id });
      return true;
    }
    submit({ type: "playDevelopmentCard", cardId: card.id });
    return true;
  };

  const attemptPlayCard = (card: DevCardModel) => {
    if (!playCard(card)) showTouchDeniedFeedback(card.id);
  };

  const activateCard = (card: DevCardModel) => {
    selectCard(card.id);
  };

  const beginTouchExplore = (cardId: string, pointerId: number, clientX: number, clientY: number) => {
    captureTouchCardZones();
    lastPointerRef.current = { x: clientX, y: clientY };
    activeTouchRef.current = { pointerId, cardId, mode: "explore", startX: clientX, startY: clientY };
    setTouchExploring(true);
    clearTouchDrag();
    selectCard(cardId);
  };

  if (player.devCards.length === 0) return null;

  return (
    <div
      ref={handRef}
      className={touchExploring ? "dev-card-hand touch-exploring" : "dev-card-hand"}
      aria-label="发展卡手牌"
      onMouseEnter={() => {
        if (!isCoarsePointer) clearRetract();
      }}
      onMouseLeave={() => {
        if (!isCoarsePointer) scheduleRetract();
      }}
      onBlur={(event) => {
        if (!isCoarsePointer && !event.currentTarget.contains(event.relatedTarget)) scheduleRetract();
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
            coarsePointer={isCoarsePointer}
            index={index}
            total={groupedCards.length}
            touchDragging={touchDragVisual?.cardId === card.id}
            touchPullDistance={touchDragVisual?.cardId === card.id ? touchDragVisual.pullDistance : 0}
            touchPlayReady={touchDragVisual?.cardId === card.id && touchDragVisual.playReady}
            forceDenied={touchDeniedCardId === card.id}
            onActivate={() => activateCard(card)}
            onSelect={() => selectCard(card.id)}
            onHover={(event) => scheduleHoverSelect(card.id, event)}
            onHoverEnd={clearHoverSelect}
            onPlay={() => playCard(card)}
            onCoarsePointerDown={(pointerId, clientX, clientY) =>
              beginTouchExplore(card.id, pointerId, clientX, clientY)
            }
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

function shouldStartTouchPull(activeTouch: TouchExploreState, x: number, y: number) {
  if (!activeTouch.cardId) return false;
  const pullDistance = Math.max(0, activeTouch.startY - y);
  const horizontalDistance = Math.abs(x - activeTouch.startX);
  return pullDistance >= TOUCH_PULL_START_PX && pullDistance >= horizontalDistance * TOUCH_PULL_INTENT_RATIO;
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
