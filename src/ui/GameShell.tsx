import { AlertTriangle } from "lucide-react";
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
import type { GameAnimationEvent } from "./animation/animationTypes";
import { ZombieSiegeAlert } from "./animation/ZombieSiegeAlert";
import { BoardView } from "./Board/BoardView";
import { BottomHand } from "./Cards/BottomHand";
import { PlayerHud } from "./Hud/PlayerHud";
import { PrivacyGate } from "./Modals/PrivacyGate";
import { VictorySettlementModal } from "./Modals/VictorySettlementModal";
import { LeftInfoRail } from "./Panels/LeftInfoRail";
import { RightOperationDock } from "./Panels/RightOperationDock";
import { type InteractionMode, type UiSelection, type UiTool } from "./gameUiTypes";
import { getTurnUiMode } from "./selectors/turnUiMode";

interface GameShellProps {
  state: GameState;
  error?: string;
  ruleHint?: string;
  privacy: boolean;
  seatPlayerName: string;
  viewerPlayerId: string;
  pendingPlayerId?: string;
  interactionMode: InteractionMode;
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
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
}

const DEFAULT_MAP_SCALE = 0.7;
const MIN_MAP_SCALE = 0.62;
const MAX_MAP_SCALE = 4.2;
const MAP_ZOOM_STEP = 0.18;
const MAP_EDGE_GUARD_PX = 64;
const MAP_DRAG_START_THRESHOLD_PX = 8;
const GAME_STAGE_WIDTH = 1672;
const GAME_STAGE_HEIGHT = 941;
const TURN_TIME_LIMIT_SECONDS = 60;

interface MapViewState {
  scale: number;
  x: number;
  y: number;
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

export function GameShell({
  state,
  error,
  ruleHint,
  privacy,
  seatPlayerName,
  viewerPlayerId,
  pendingPlayerId,
  interactionMode,
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
  submit,
  setTool,
  setSelection
}: GameShellProps) {
  const mode = getTurnUiMode(state);
  const effectivePendingPlayerId = pendingPlayerId ?? state.pending?.playerId;
  const activeTimerPlayerId = effectivePendingPlayerId ?? state.currentPlayerId;
  const canInteract = interactionMode === "hot-seat" || viewerPlayerId === (effectivePendingPlayerId ?? state.currentPlayerId);
  const turnTimerScope = state.pending ? `pending:${state.pending.kind}` : "turn";
  const turnTimerKey = [
    state.turn,
    activeTimerPlayerId,
    turnTimerScope
  ].join(":");
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(TURN_TIME_LIMIT_SECONDS);
  const submittedTimeoutKeyRef = useRef<string>();
  const submitRef = useRef(submit);
  const [stageScale, setStageScale] = useState(getStageScale);
  const mapViewRef = useRef<MapViewState>({
    scale: DEFAULT_MAP_SCALE,
    x: 0,
    y: 0
  });
  const [isPanning, setIsPanning] = useState(false);
  const mapLayerRef = useRef<HTMLElement | null>(null);
  const mapWorldRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<MapDragState>();
  const activePointersRef = useRef<Map<number, ActiveMapPointer>>(new Map());
  const pinchStateRef = useRef<MapPinchState>();
  const suppressBoardClickRef = useRef(false);
  const gameStageStyle = {
    "--game-stage-scale": stageScale
  } as CSSProperties;
  const getMapView = () => mapViewRef.current;
  const getPanBounds = (scale: number) => {
    const layer = mapLayerRef.current;
    const world = mapWorldRef.current;
    if (!layer || !world) return { x: 0, y: 0 };
    const maxX = Math.max(0, (world.offsetWidth * scale - layer.clientWidth) / 2 - MAP_EDGE_GUARD_PX);
    const maxY = Math.max(0, (world.offsetHeight * scale - layer.clientHeight) / 2 - MAP_EDGE_GUARD_PX);
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
  const applyMapView = (view: MapViewState) => {
    const nextView = constrainMapView(view);
    mapViewRef.current = nextView;
    const world = mapWorldRef.current;
    if (world) {
      world.style.setProperty("--map-scale", String(nextView.scale));
      world.style.setProperty("--map-pan-x", `${nextView.x}px`);
      world.style.setProperty("--map-pan-y", `${nextView.y}px`);
    }
    return nextView;
  };
  const changeMapScale = (delta: number) => {
    const view = getMapView();
    const nextScale = clampMapScale(view.scale + delta);
    const scaleRatio = nextScale / view.scale;
    applyMapView({
      scale: nextScale,
      x: view.x * scaleRatio,
      y: view.y * scaleRatio
    });
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
    changeMapScale(event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP);
  };
  const handleMapPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });
    if (event.pointerType !== "mouse" && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (activePointersRef.current.size >= 2) {
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
      if (!drag.moved && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
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
    applyMapView(getMapView());
  }, []);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    const handleResize = () => {
      const nextScale = getStageScale();
      setStageScale(nextScale);
      syncFixedStageScale(nextScale);
      applyMapView(getMapView());
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (mode === "victory") {
      setTurnTimeRemaining(0);
      return;
    }

    const startedAt = Date.now();
    submittedTimeoutKeyRef.current = undefined;
    setTurnTimeRemaining(TURN_TIME_LIMIT_SECONDS);

    const timerId = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
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

  return (
    <main className="game-viewport">
      <div className="app-shell game-shell" style={gameStageStyle}>
        <div className="shell-background-layer" aria-hidden="true" />
        <ZombieSiegeAlert events={animationEvents} />

        {interactionMode === "hot-seat" && privacy && (
          <PrivacyGate
            playerName={seatPlayerName}
            pendingKind={state.pending?.kind}
            onEnter={onClosePrivacy}
          />
        )}

        {(ruleHint || error) && (
          <div className="shell-toast-stack">
            {ruleHint && (
              <div className="error-banner shell-rule-hint" role="status" aria-live="polite">
                <span>{ruleHint}</span>
              </div>
            )}
            {error && (
              <div className="error-banner shell-error">
                <AlertTriangle size={18} />
                <span>{error}</span>
                <button onClick={onDismissError}>{"\u5173\u95ed"}</button>
              </div>
            )}
          </div>
        )}

        <section
          ref={mapLayerRef}
          className={isPanning ? "map-layer is-panning" : "map-layer"}
          aria-label="Map layer"
          onWheel={handleMapWheel}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={stopMapPan}
          onPointerCancel={stopMapPan}
          onClickCapture={handleMapClickCapture}
        >
          <div className="map-world" ref={mapWorldRef}>
            <div className="map-battlefield" aria-hidden="true" />
            <div className="map-center-zone" aria-hidden="true" />
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
          onlineRoomCode={onlineRoomCode}
          onlineConnectionState={onlineConnectionState}
          turnTimeRemaining={turnTimeRemaining}
          turnTimeLimit={TURN_TIME_LIMIT_SECONDS}
          animationBusy={animationBusy}
          commandBusy={onlineCommandBusy}
          submit={submit}
          setTool={setTool}
          setSelection={setSelection}
          onClear={onClear}
          onReconnectOnlineRoom={onReconnectOnlineRoom}
          onLeaveOnlineRoom={onLeaveOnlineRoom}
        />

        <BottomHand
          state={state}
          viewerPlayerId={viewerPlayerId}
          animationEvents={animationEvents}
          submit={submit}
          setTool={setTool}
          setSelection={setSelection}
        />

        {state.phase === "victory" && <VictorySettlementModal state={state} onReturnHome={onClear} />}
      </div>
    </main>
  );
}
