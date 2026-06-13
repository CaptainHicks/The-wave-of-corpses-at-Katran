import { AlertTriangle, BellRing } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
  type WheelEvent
} from "react";
import type { Command, GameState } from "../domain/types";
import { isAiPlayer } from "../domain/ai";
import type { GameAnimationEvent } from "./animation/animationTypes";
import { ZombieSiegeAlert } from "./animation/ZombieSiegeAlert";
import { BoardView } from "./Board/BoardView";
import { BottomHand } from "./Cards/BottomHand";
import { PlayerHud } from "./Hud/PlayerHud";
import { PrivacyGate } from "./Modals/PrivacyGate";
import { VictorySettlementModal } from "./Modals/VictorySettlementModal";
import { LeftInfoRail } from "./Panels/LeftInfoRail";
import { RightOperationDock } from "./Panels/RightOperationDock";
import { type InteractionMode, type UiOperationContext, type UiSelection, type UiTool } from "./gameUiTypes";
import { getTurnUiMode } from "./selectors/turnUiMode";

interface GameShellProps {
  state: GameState;
  error?: string;
  ruleHint?: string;
  operationHint?: string;
  privacy: boolean;
  seatPlayerName: string;
  viewerPlayerId: string;
  pendingPlayerId?: string;
  interactionMode: InteractionMode;
  turnReminderEnabled?: boolean;
  onlineRoomCode?: string;
  onlineConnectionState?: "disconnected" | "connecting" | "connected" | "reconnecting";
  onlineCommandBusy?: boolean;
  tool: UiTool;
  selection?: UiSelection;
  animationEvents: GameAnimationEvent[];
  animationBusy: boolean;
  onClosePrivacy: () => void;
  onDismissError: () => void;
  onReportError?: (message: string) => void;
  onClear: () => void;
  onReconnectOnlineRoom?: () => void;
  onLeaveOnlineRoom?: () => void;
  systemMenuOpen?: boolean;
  onSystemMenuToggle?: (open: boolean) => void;
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
}

const DEFAULT_MAP_SCALE = 0.7;
const MIN_MAP_SCALE = 0.62;
const MAX_MAP_SCALE = 4.2;
const MAP_ZOOM_STEP = 0.18;
const MAP_WHEEL_DELTA_PER_ZOOM_STEP = 100;
const MAP_MAX_WHEEL_ZOOM_DELTA_PER_FRAME = 0.32;
const MAP_EDGE_GUARD_PX = 64;
const MAP_DRAG_START_THRESHOLD_PX = 8;
const GAME_STAGE_WIDTH = 1672;
const GAME_STAGE_HEIGHT = 941;
const TURN_TIME_LIMIT_SECONDS = 60;
const OPERATION_HINT_VISIBLE_MS = 4200;
const ONLINE_TURN_REMINDER_VISIBLE_MS = 2600;
const BOARD_INTERACTION_SELECTOR = "[data-tile-id], [data-edge-id], [data-vertex-id]";

interface MapViewState {
  scale: number;
  x: number;
  y: number;
}

interface MapMetrics {
  layerWidth: number;
  layerHeight: number;
  worldWidth: number;
  worldHeight: number;
}

interface MapDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

interface ActiveMapPointer {
  clientX: number;
  clientY: number;
}

interface MapPinchState {
  pointerIds: [number, number];
  startDistance: number;
  startCenterX: number;
  startCenterY: number;
  startMapView: MapViewState;
}

interface OnlineTurnReminder {
  key: string;
  playerName: string;
  turn: number;
  pending: boolean;
}

function clampMapScale(scale: number) {
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, Number(scale.toFixed(2))));
}

function getStageScale() {
  if (typeof window === "undefined") return 1;
  return Math.max(0.01, Math.min(window.innerWidth / GAME_STAGE_WIDTH, window.innerHeight / GAME_STAGE_HEIGHT));
}

function syncFixedStageScale(scale: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--fixed-stage-scale", String(scale));
}

function formatMapTransformNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function buildOnlineTurnReminderKey(state: GameState, playerId: string, onlineRoomCode?: string) {
  const scope =
    state.phase === "setup"
      ? `setup:${state.setup.round}:${state.setup.placementIndex}`
      : `turn:${state.turn}`;
  return `${onlineRoomCode ?? "room"}:${scope}:${playerId}`;
}

function isBoardInteractionTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(BOARD_INTERACTION_SELECTOR));
}

function captureMapPointer(target: HTMLElement, pointerId: number) {
  if (!target.hasPointerCapture(pointerId)) {
    target.setPointerCapture(pointerId);
  }
}

function buildMapTransform(view: MapViewState) {
  return `translate3d(calc(-50% + ${formatMapTransformNumber(view.x)}px), calc(-50% + ${formatMapTransformNumber(
    view.y
  )}px), 0)`;
}

function buildMapScaleTransform(view: MapViewState) {
  return `scale(${formatMapTransformNumber(view.scale)})`;
}

export function GameShell({
  state,
  error,
  ruleHint,
  operationHint,
  privacy,
  seatPlayerName,
  viewerPlayerId,
  pendingPlayerId,
  interactionMode,
  turnReminderEnabled,
  onlineRoomCode,
  onlineConnectionState,
  onlineCommandBusy = false,
  tool,
  selection,
  animationEvents,
  animationBusy,
  onClosePrivacy,
  onDismissError,
  onReportError,
  onClear,
  onReconnectOnlineRoom,
  onLeaveOnlineRoom,
  systemMenuOpen,
  onSystemMenuToggle,
  submit,
  setTool,
  setSelection,
  setOperationContext
}: GameShellProps) {
  const mode = getTurnUiMode(state);
  const effectivePendingPlayerId = pendingPlayerId ?? state.pending?.playerId;
  const activeTimerPlayerId = effectivePendingPlayerId ?? state.currentPlayerId;
  const activeDecisionPlayer = state.players.find((player) => player.id === activeTimerPlayerId);
  const shouldShowTurnReminder = turnReminderEnabled ?? interactionMode === "online";
  const canInteract =
    !isAiPlayer(activeDecisionPlayer) &&
    (interactionMode === "hot-seat" || viewerPlayerId === (effectivePendingPlayerId ?? state.currentPlayerId));
  const turnTimerScope = state.pending ? `pending:${state.pending.kind}` : "turn";
  const turnTimerKey = [
    state.turn,
    activeTimerPlayerId,
    turnTimerScope
  ].join(":");
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(TURN_TIME_LIMIT_SECONDS);
  const [visibleOperationHintText, setVisibleOperationHintText] = useState<string>();
  const [visibleOnlineTurnReminder, setVisibleOnlineTurnReminder] = useState<OnlineTurnReminder>();
  const visibleOperationHint = canInteract && !ruleHint ? visibleOperationHintText : undefined;
  const onlineTurnReminderPlayer = state.players.find((player) => player.id === activeTimerPlayerId);
  const onlineTurnReminderPlayerName = onlineTurnReminderPlayer?.name;
  const onlineTurnReminderKey =
    shouldShowTurnReminder && mode !== "victory" && activeTimerPlayerId === viewerPlayerId && onlineTurnReminderPlayer
      ? buildOnlineTurnReminderKey(state, activeTimerPlayerId, onlineRoomCode)
      : undefined;
  const shownOnlineTurnReminderKeysRef = useRef<Set<string>>(new Set());
  const submittedTimeoutKeyRef = useRef<string>();
  const submitRef = useRef(submit);
  // 点击菜单暂停计时器的机制只用于本地(hot-seat)游玩;在线游玩不暂停。
  const menuPauseActive = interactionMode === "hot-seat" && Boolean(systemMenuOpen);
  const menuPauseActiveRef = useRef(menuPauseActive);
  menuPauseActiveRef.current = menuPauseActive;
  const pauseStartRef = useRef<number>(0);
  const totalPausedMsRef = useRef(0);
  const [stageScale, setStageScale] = useState(getStageScale);
  const mapViewRef = useRef<MapViewState>({
    scale: DEFAULT_MAP_SCALE,
    x: 0,
    y: 0
  });
  const [isPanning, setIsPanning] = useState(false);
  const mapLayerRef = useRef<HTMLElement | null>(null);
  const mapWorldRef = useRef<HTMLDivElement | null>(null);
  const mapScaleWorldRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<MapDragState>();
  const activePointersRef = useRef<Map<number, ActiveMapPointer>>(new Map());
  const pinchStateRef = useRef<MapPinchState>();
  const mapMetricsRef = useRef<MapMetrics>({
    layerWidth: 0,
    layerHeight: 0,
    worldWidth: 0,
    worldHeight: 0
  });
  const pendingMapViewRef = useRef<MapViewState>();
  const mapFrameRef = useRef<number>();
  const wheelZoomDeltaRef = useRef(0);
  const wheelZoomFrameRef = useRef<number>();
  const suppressBoardClickRef = useRef(false);
  const gameStageStyle = {
    "--game-stage-scale": stageScale
  } as CSSProperties;
  const getMapView = () => mapViewRef.current;
  const measureMapMetrics = () => {
    const layer = mapLayerRef.current;
    const world = mapWorldRef.current;
    if (!layer || !world) return mapMetricsRef.current;
    const nextMetrics = {
      layerWidth: layer.clientWidth,
      layerHeight: layer.clientHeight,
      worldWidth: world.offsetWidth,
      worldHeight: world.offsetHeight
    };
    mapMetricsRef.current = nextMetrics;
    return nextMetrics;
  };
  const getPanBounds = (scale: number) => {
    const metrics =
      mapMetricsRef.current.layerWidth > 0 && mapMetricsRef.current.worldWidth > 0
        ? mapMetricsRef.current
        : measureMapMetrics();
    const maxX = Math.max(0, (metrics.worldWidth * scale - metrics.layerWidth) / 2 - MAP_EDGE_GUARD_PX);
    const maxY = Math.max(0, (metrics.worldHeight * scale - metrics.layerHeight) / 2 - MAP_EDGE_GUARD_PX);
    return { x: maxX, y: maxY };
  };
  const constrainMapView = (view: MapViewState): MapViewState => {
    const bounds = getPanBounds(view.scale);
    return {
      ...view,
      x: Math.min(bounds.x, Math.max(-bounds.x, view.x)),
      y: Math.min(bounds.y, Math.max(-bounds.y, view.y))
    };
  };
  const writeMapViewStyle = (view: MapViewState) => {
    const world = mapWorldRef.current;
    const scaleWorld = mapScaleWorldRef.current;
    if (!world || !scaleWorld) return;
    world.style.transform = buildMapTransform(view);
    scaleWorld.style.transform = buildMapScaleTransform(view);
  };
  const flushMapViewStyle = () => {
    mapFrameRef.current = undefined;
    const view = pendingMapViewRef.current;
    if (!view) return;
    pendingMapViewRef.current = undefined;
    writeMapViewStyle(view);
  };
  const scheduleMapViewStyle = (view: MapViewState) => {
    pendingMapViewRef.current = view;
    if (mapFrameRef.current !== undefined) return;
    mapFrameRef.current = window.requestAnimationFrame(flushMapViewStyle);
  };
  const applyMapView = (view: MapViewState, immediate = false) => {
    const nextView = constrainMapView(view);
    mapViewRef.current = nextView;
    if (immediate) {
      if (mapFrameRef.current !== undefined) {
        window.cancelAnimationFrame(mapFrameRef.current);
        mapFrameRef.current = undefined;
      }
      pendingMapViewRef.current = undefined;
      writeMapViewStyle(nextView);
    } else {
      scheduleMapViewStyle(nextView);
    }
    return nextView;
  };
  const changeMapScale = (delta: number) => {
    const view = getMapView();
    const nextScale = clampMapScale(view.scale + delta);
    if (nextScale === view.scale) return;
    const scaleRatio = nextScale / view.scale;
    applyMapView({
      scale: nextScale,
      x: view.x * scaleRatio,
      y: view.y * scaleRatio
    });
  };
  const normalizeWheelDeltaY = (event: WheelEvent<HTMLElement>) => {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * (mapLayerRef.current?.clientHeight || 800);
    return event.deltaY;
  };
  const flushWheelZoom = () => {
    wheelZoomFrameRef.current = undefined;
    const rawDelta = wheelZoomDeltaRef.current;
    wheelZoomDeltaRef.current = 0;
    const zoomDelta = Math.max(
      -MAP_MAX_WHEEL_ZOOM_DELTA_PER_FRAME,
      Math.min(MAP_MAX_WHEEL_ZOOM_DELTA_PER_FRAME, (-rawDelta / MAP_WHEEL_DELTA_PER_ZOOM_STEP) * MAP_ZOOM_STEP)
    );
    changeMapScale(zoomDelta);
  };
  const scheduleWheelZoom = () => {
    if (wheelZoomFrameRef.current !== undefined) return;
    wheelZoomFrameRef.current = window.requestAnimationFrame(flushWheelZoom);
  };
  const getLayerAnchor = (clientX: number, clientY: number) => {
    const layer = mapLayerRef.current;
    if (!layer) return { x: 0, y: 0 };
    const rect = layer.getBoundingClientRect();
    const width = rect.width || layer.clientWidth;
    const height = rect.height || layer.clientHeight;
    return {
      x: (clientX - (rect.left + width / 2)) / stageScale,
      y: (clientY - (rect.top + height / 2)) / stageScale
    };
  };
  const clearSuppressedClickSoon = () => {
    if (!suppressBoardClickRef.current) return;
    window.setTimeout(() => {
      suppressBoardClickRef.current = false;
    }, 120);
  };
  const beginPinchGesture = (startMapView: MapViewState) => {
    const pointerEntries = Array.from(activePointersRef.current.entries()).slice(0, 2);
    if (pointerEntries.length < 2) return;
    const [[firstPointerId, firstPointer], [secondPointerId, secondPointer]] = pointerEntries;
    pinchStateRef.current = {
      pointerIds: [firstPointerId, secondPointerId],
      startDistance: Math.max(1, Math.hypot(secondPointer.clientX - firstPointer.clientX, secondPointer.clientY - firstPointer.clientY)),
      startCenterX: (firstPointer.clientX + secondPointer.clientX) / 2,
      startCenterY: (firstPointer.clientY + secondPointer.clientY) / 2,
      startMapView
    };
    dragStateRef.current = undefined;
    suppressBoardClickRef.current = true;
    setIsPanning(true);
  };
  const updatePinchGesture = () => {
    const pinch = pinchStateRef.current;
    if (!pinch) return;
    const firstPointer = activePointersRef.current.get(pinch.pointerIds[0]);
    const secondPointer = activePointersRef.current.get(pinch.pointerIds[1]);
    if (!firstPointer || !secondPointer) return;

    const currentCenterX = (firstPointer.clientX + secondPointer.clientX) / 2;
    const currentCenterY = (firstPointer.clientY + secondPointer.clientY) / 2;
    const nextScale = clampMapScale(
      pinch.startMapView.scale *
        (Math.hypot(secondPointer.clientX - firstPointer.clientX, secondPointer.clientY - firstPointer.clientY) / pinch.startDistance)
    );
    const scaleRatio = nextScale / pinch.startMapView.scale;
    const anchor = getLayerAnchor(pinch.startCenterX, pinch.startCenterY);
    const centerDeltaX = (currentCenterX - pinch.startCenterX) / stageScale;
    const centerDeltaY = (currentCenterY - pinch.startCenterY) / stageScale;

    applyMapView({
      scale: nextScale,
      x: centerDeltaX + pinch.startMapView.x * scaleRatio + anchor.x * (1 - scaleRatio),
      y: centerDeltaY + pinch.startMapView.y * scaleRatio + anchor.y * (1 - scaleRatio)
    });
  };
  const handleMapWheel = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault();
    wheelZoomDeltaRef.current += normalizeWheelDeltaY(event);
    scheduleWheelZoom();
  };
  const handleMapPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const startedOnBoardTarget = isBoardInteractionTarget(event.target);
    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });
    if (event.pointerType !== "mouse" && !startedOnBoardTarget) {
      captureMapPointer(event.currentTarget, event.pointerId);
    }
    if (activePointersRef.current.size >= 2) {
      if (event.pointerType !== "mouse") {
        activePointersRef.current.forEach((_, pointerId) => captureMapPointer(event.currentTarget, pointerId));
      }
      beginPinchGesture(getMapView());
      return;
    }
    const mapView = getMapView();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapView.x,
      originY: mapView.y,
      moved: false
    };
  };
  const handleMapPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY
      });
    }
    if (activePointersRef.current.size >= 2) {
      if (!pinchStateRef.current) beginPinchGesture(getMapView());
      updatePinchGesture();
      return;
    }
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rawDx = event.clientX - drag.startX;
    const rawDy = event.clientY - drag.startY;
    const dx = rawDx / stageScale;
    const dy = rawDy / stageScale;
    if (!drag.moved && Math.hypot(rawDx, rawDy) <= MAP_DRAG_START_THRESHOLD_PX) return;
    if (!drag.moved) {
      captureMapPointer(event.currentTarget, event.pointerId);
      drag.moved = true;
      suppressBoardClickRef.current = true;
      setIsPanning(true);
    }
    applyMapView({ ...getMapView(), x: drag.originX + dx, y: drag.originY + dy });
  };
  const stopMapPan = (event: PointerEvent<HTMLElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size >= 2) {
      beginPinchGesture(getMapView());
      return;
    }

    if (pinchStateRef.current) {
      pinchStateRef.current = undefined;
      const remainingPointer = Array.from(activePointersRef.current.entries())[0];
      if (remainingPointer) {
        const [pointerId, pointer] = remainingPointer;
        const mapView = getMapView();
        dragStateRef.current = {
          pointerId,
          startX: pointer.clientX,
          startY: pointer.clientY,
          originX: mapView.x,
          originY: mapView.y,
          moved: false
        };
        setIsPanning(false);
        return;
      }
    }

    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (activePointersRef.current.size === 0) {
        setIsPanning(false);
        clearSuppressedClickSoon();
      }
      return;
    }
    dragStateRef.current = undefined;
    setIsPanning(false);
    if (drag.moved) clearSuppressedClickSoon();
  };
  const handleMapClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressBoardClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  useLayoutEffect(() => {
    measureMapMetrics();
    applyMapView(getMapView(), true);
  }, []);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    if (!onlineTurnReminderKey || !onlineTurnReminderPlayerName) {
      setVisibleOnlineTurnReminder(undefined);
      return;
    }
    if (shownOnlineTurnReminderKeysRef.current.has(onlineTurnReminderKey)) return;
    shownOnlineTurnReminderKeysRef.current.add(onlineTurnReminderKey);

    setVisibleOnlineTurnReminder({
      key: onlineTurnReminderKey,
      playerName: onlineTurnReminderPlayerName,
      turn: state.turn,
      pending: Boolean(state.pending)
    });

    const timerId = window.setTimeout(() => {
      setVisibleOnlineTurnReminder((current) => (current?.key === onlineTurnReminderKey ? undefined : current));
    }, ONLINE_TURN_REMINDER_VISIBLE_MS);

    return () => window.clearTimeout(timerId);
  }, [onlineTurnReminderKey, onlineTurnReminderPlayerName]);

  useEffect(() => {
    if (!operationHint) {
      setVisibleOperationHintText(undefined);
      return;
    }
    setVisibleOperationHintText(operationHint);
    if (selection?.kind.startsWith("dev")) return;
    const timerId = window.setTimeout(() => setVisibleOperationHintText(undefined), OPERATION_HINT_VISIBLE_MS);
    return () => window.clearTimeout(timerId);
  }, [operationHint, selection?.kind]);

  useEffect(() => {
    const handleResize = () => {
      const nextScale = getStageScale();
      setStageScale(nextScale);
      syncFixedStageScale(nextScale);
      measureMapMetrics();
      applyMapView(getMapView(), true);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (mapFrameRef.current !== undefined) window.cancelAnimationFrame(mapFrameRef.current);
      if (wheelZoomFrameRef.current !== undefined) window.cancelAnimationFrame(wheelZoomFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (menuPauseActive) {
      pauseStartRef.current = Date.now();
    } else if (pauseStartRef.current) {
      totalPausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
  }, [menuPauseActive]);

  useEffect(() => {
    if (mode === "victory") {
      setTurnTimeRemaining(0);
      return;
    }

    const startedAt = Date.now();
    submittedTimeoutKeyRef.current = undefined;
    setTurnTimeRemaining(TURN_TIME_LIMIT_SECONDS);
    totalPausedMsRef.current = 0;
    // 若计时器在菜单已打开时重启,从当前时刻开始记账暂停时长,避免按 epoch 0 计算。
    pauseStartRef.current = menuPauseActiveRef.current ? startedAt : 0;

    const timerId = window.setInterval(() => {
      const pausedMs = totalPausedMsRef.current + (menuPauseActiveRef.current ? Date.now() - pauseStartRef.current : 0);
      const elapsedMs = Date.now() - startedAt - pausedMs;
      const nextRemaining = Math.max(0, Math.ceil((TURN_TIME_LIMIT_SECONDS * 1000 - elapsedMs) / 1000));
      setTurnTimeRemaining(nextRemaining);

      if (nextRemaining > 0 || !canInteract || submittedTimeoutKeyRef.current === turnTimerKey) return;
      submittedTimeoutKeyRef.current = turnTimerKey;
      submitRef.current({
        type: "timeoutTurn",
        expectedPlayerId: activeTimerPlayerId,
        expectedTurn: state.turn
      });
    }, 250);

    return () => window.clearInterval(timerId);
  }, [activeTimerPlayerId, canInteract, mode, state.turn, turnTimerKey]);

  const mapLayerClassName = [
    "map-layer",
    isPanning ? "is-panning" : undefined,
    selection ? `selection-${selection.kind}` : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="game-viewport">
      <div className="app-shell game-shell" style={gameStageStyle}>
        <div className="shell-background-layer" aria-hidden="true" />
        <ZombieSiegeAlert events={animationEvents} />
        {visibleOnlineTurnReminder && <OnlineTurnReminderAlert reminder={visibleOnlineTurnReminder} />}

        {interactionMode === "hot-seat" && privacy && (
          <PrivacyGate
            playerName={seatPlayerName}
            pendingKind={state.pending?.kind}
            onEnter={onClosePrivacy}
          />
        )}

        {(visibleOperationHint || ruleHint || error) && (
          <div className="shell-toast-stack">
            {visibleOperationHint && (
              <div className="error-banner shell-rule-hint shell-operation-hint" role="status" aria-live="polite">
                <span>{formatToastMessage(visibleOperationHint)}</span>
              </div>
            )}
            {ruleHint && (
              <div className="error-banner shell-rule-hint" role="status" aria-live="polite">
                <span>{formatToastMessage(ruleHint)}</span>
              </div>
            )}
            {error && (
              <div className="error-banner shell-error">
                <AlertTriangle size={18} />
                <span>{formatToastMessage(error)}</span>
                <button onClick={onDismissError}>{"\u5173\u95ed"}</button>
              </div>
            )}
          </div>
        )}

        <section
          ref={mapLayerRef}
          className={mapLayerClassName}
          aria-label="Map layer"
          onWheel={handleMapWheel}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={stopMapPan}
          onPointerCancel={stopMapPan}
          onClickCapture={handleMapClickCapture}
        >
          <div className="map-world" ref={mapWorldRef}>
            <div className="map-scale-world" ref={mapScaleWorldRef}>
              <div className="map-battlefield" aria-hidden="true" />
              <div className="map-board-frame">
                <BoardView
                  state={state}
                  tool={tool}
                  selection={selection}
                  canInteract={canInteract}
                  animationEvents={animationEvents}
                  setSelection={setSelection}
                  reportError={onReportError}
                  submit={submit}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="top-player-hud">
          <PlayerHud state={state} pendingPlayerId={effectivePendingPlayerId} />
        </section>

        <LeftInfoRail state={state} mode={mode} viewerPlayerId={viewerPlayerId} />

        <RightOperationDock
          state={state}
          mode={mode}
          tool={tool}
          selection={selection}
          viewerPlayerId={viewerPlayerId}
          pendingPlayerId={effectivePendingPlayerId}
          interactionMode={interactionMode}
          canInteract={canInteract}
          onlineRoomCode={onlineRoomCode}
          onlineConnectionState={onlineConnectionState}
          turnTimeRemaining={turnTimeRemaining}
          turnTimeLimit={TURN_TIME_LIMIT_SECONDS}
          animationBusy={animationBusy}
          commandBusy={onlineCommandBusy}
          submit={submit}
          setTool={setTool}
          setSelection={setSelection}
          setOperationContext={setOperationContext}
          onClear={onClear}
          onReconnectOnlineRoom={onReconnectOnlineRoom}
          onLeaveOnlineRoom={onLeaveOnlineRoom}
          onSystemMenuToggle={onSystemMenuToggle}
        />

        <BottomHand
          state={state}
          viewerPlayerId={viewerPlayerId}
          animationEvents={animationEvents}
          submit={submit}
          setTool={setTool}
          setSelection={setSelection}
          setOperationContext={setOperationContext}
        />

        {state.phase === "victory" && (
          <VictorySettlementModal
            state={state}
            onReturnHome={onClear}
            returnLabel={interactionMode === "online" ? "返回房间大厅" : "返回主页面"}
          />
        )}
      </div>
    </main>
  );
}

function formatToastMessage(message: string) {
  return message.trim().replace(/[。.]$/, "");
}

function OnlineTurnReminderAlert({ reminder }: { reminder: OnlineTurnReminder }) {
  return (
    <div className="online-turn-reminder" role="status" aria-live="assertive">
      <div className="online-turn-reminder__flare" aria-hidden="true" />
      <div className="online-turn-reminder__panel">
        <BellRing size={54} aria-hidden="true" />
        <div>
          <span>{reminder.pending ? "需要你响应" : `第 ${reminder.turn} 回合`}</span>
          <strong>轮到你了</strong>
          <p>{reminder.pending ? `${reminder.playerName}，请处理当前响应。` : `${reminder.playerName}，开始你的行动。`}</p>
        </div>
      </div>
    </div>
  );
}
