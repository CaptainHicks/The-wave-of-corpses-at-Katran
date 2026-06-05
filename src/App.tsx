import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { applyCommand, serializeStateForText, RuleError } from "./domain/rules";
import type { Command, GameState } from "./domain/types";
import { buildOnlineViewRevision, materializeOnlineGameState } from "./online/clientState";
import { loadGame, saveGame } from "./persistence/storage";
import { useOnlineSession } from "./online/useOnlineSession";
import { diffGameStates } from "./ui/animation/diffGameStates";
import { useGameAnimations } from "./ui/animation/useGameAnimations";
import { gameAudio } from "./ui/audio/audioController";
import { useAudioUnlock, useInteractiveAudioFeedback, useMusicMode } from "./ui/audio/useAudio";
import { isCriticalGameArtPreloadComplete, preloadCriticalGameArtAssets } from "./ui/art/preloadGameAssets";
import { GameShell } from "./ui/GameShell";
import { StartScreen } from "./ui/StartScreen";
import type { UiOperationContext, UiSelection, UiTool } from "./ui/gameUiTypes";
import { getOperationHint } from "./ui/operationHints";

interface AppModel {
  state?: GameState;
  error?: string;
}

type AppAction =
  | { type: "command"; command: Command }
  | { type: "import"; state: GameState }
  | { type: "clear" }
  | { type: "error"; message?: string };

function appReducer(model: AppModel, action: AppAction): AppModel {
  try {
    if (action.type === "command") {
      return { state: applyCommand(model.state, action.command) };
    }
    if (action.type === "import") return { state: action.state };
    if (action.type === "clear") return {};
    if (action.type === "error") return { ...model, error: action.message };
    return model;
  } catch (error) {
    return {
      ...model,
      error: error instanceof RuleError || error instanceof Error ? error.message : "\u53d1\u751f\u672a\u77e5\u9519\u8bef\u3002"
    };
  }
}

function App() {
  const [savedGame, setSavedGame] = useState<GameState | undefined>(() => loadGame());
  const [model, dispatch] = useReducer(appReducer, undefined, () => ({}));
  const [ruleHint, setRuleHint] = useState<{ id: number; message: string }>();
  const onlineSession = useOnlineSession();
  const localState = model.state;
  const onlineState = useMemo(
    () => (onlineSession.gameView ? materializeOnlineGameState(onlineSession.gameView) : undefined),
    [onlineSession.gameView]
  );
  const activeState = localState ?? onlineState;
  const previousStateRef = useRef<GameState>();
  const previousOnlineStateRef = useRef<GameState>();
  const lastAnimatedOnlineViewRef = useRef<string>();
  const lastCommandRef = useRef<Command>();
  const { events: animationEvents, pushEvents, isAnimating } = useGameAnimations();
  const [tool, setTool] = useState<UiTool>("none");
  const [selection, setSelection] = useState<UiSelection>();
  const [operationContext, setOperationContext] = useState<UiOperationContext>();
  const [privacy, setPrivacy] = useState(false);
  const [lastSeatPlayerId, setLastSeatPlayerId] = useState<string | undefined>();
  const ruleHintTimerRef = useRef<number>();
  const ruleHintIdRef = useRef(0);
  const [criticalGameArtReady, setCriticalGameArtReady] = useState(isCriticalGameArtPreloadComplete);
  const activeStateExists = Boolean(activeState);
  const canShowGameBoard = !activeState || criticalGameArtReady || isCriticalGameArtPreloadComplete();

  const clearRuleHint = () => {
    if (ruleHintTimerRef.current) {
      window.clearTimeout(ruleHintTimerRef.current);
      ruleHintTimerRef.current = undefined;
    }
    setRuleHint(undefined);
  };

  const showRuleHint = (message: string) => {
    const id = ++ruleHintIdRef.current;
    if (ruleHintTimerRef.current) {
      window.clearTimeout(ruleHintTimerRef.current);
    }
    setRuleHint({ id, message });
    ruleHintTimerRef.current = window.setTimeout(() => {
      setRuleHint((current) => (current?.id === id ? undefined : current));
      if (ruleHintTimerRef.current) {
        window.clearTimeout(ruleHintTimerRef.current);
        ruleHintTimerRef.current = undefined;
      }
    }, 2400);
  };

  useAudioUnlock();
  useInteractiveAudioFeedback();
  useMusicMode(
    !activeState || !canShowGameBoard
      ? "menu"
      : activeState.phase === "victory"
        ? activeState.winnerId
          ? "settlement-clear"
          : "settlement-over"
        : "gameplay"
  );

  useEffect(() => {
    return () => {
      if (ruleHintTimerRef.current) {
        window.clearTimeout(ruleHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeStateExists || isCriticalGameArtPreloadComplete()) {
      setCriticalGameArtReady(isCriticalGameArtPreloadComplete());
      return;
    }

    let cancelled = false;
    setCriticalGameArtReady(false);
    void preloadCriticalGameArtAssets().then((result) => {
      if (cancelled) return;
      setCriticalGameArtReady(true);
      if (result.failed > 0) {
        console.warn(`Game art preload completed with ${result.failed} failed asset(s).`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeStateExists]);

  useEffect(() => {
    if (localState) {
      saveGame(localState);
      setSavedGame(localState);
    }
  }, [localState]);

  useEffect(() => {
    const previous = previousStateRef.current;
    const command = lastCommandRef.current;
    if (!command) return;
    if (!model.state || !previous) {
      previousStateRef.current = undefined;
      lastCommandRef.current = undefined;
      return;
    }
    if (model.state === previous) {
      if (model.error) {
        previousStateRef.current = undefined;
        lastCommandRef.current = undefined;
      }
      return;
    }
    const viewerPlayerId = model.state.pending?.playerId ?? model.state.currentPlayerId;
    const animationInputs = diffGameStates(previous, model.state, command, viewerPlayerId);
    pushEvents(animationInputs);
    gameAudio.playAnimationEvents(animationInputs);
    previousStateRef.current = undefined;
    lastCommandRef.current = undefined;
  }, [model.error, model.state, pushEvents]);

  useEffect(() => {
    if (!onlineState || !onlineSession.gameView) {
      previousOnlineStateRef.current = undefined;
      lastAnimatedOnlineViewRef.current = undefined;
      return;
    }
    const previous = previousOnlineStateRef.current;
    const command = onlineSession.gameView.lastCommand;
    const revision = buildOnlineViewRevision(onlineSession.gameView);
    if (previous && command && lastAnimatedOnlineViewRef.current !== revision) {
      const animationInputs = diffGameStates(previous, onlineState, command, onlineSession.gameView.viewerPlayerId);
      pushEvents(animationInputs);
      gameAudio.playAnimationEvents(animationInputs);
    }
    previousOnlineStateRef.current = onlineState;
    lastAnimatedOnlineViewRef.current = revision;
  }, [onlineSession.gameView, onlineState, pushEvents]);

  useEffect(() => {
    if (!localState) return;
    const nextSeatPlayerId = localState.pending?.playerId ?? localState.currentPlayerId;
    if (lastSeatPlayerId && nextSeatPlayerId !== lastSeatPlayerId && localState.phase !== "setup") {
      setPrivacy(true);
    }
    setLastSeatPlayerId(nextSeatPlayerId);
  }, [lastSeatPlayerId, localState?.currentPlayerId, localState?.pending?.playerId, localState?.phase]);

  useEffect(() => {
    if (localState) {
      window.render_game_to_text = () => serializeStateForText(localState);
      window.advanceTime = () => undefined;
      return;
    }
    const gameView = onlineSession.gameView;
    if (onlineState && gameView) {
      window.render_game_to_text = () =>
        serializeStateForText(onlineState, {
          mode: "online",
          viewerPlayerId: gameView.viewerPlayerId,
          pendingPlayerId: gameView.publicState.pending?.playerId,
          playerSummaries: gameView.publicState.players.map((player) => ({
            id: player.id,
            name: player.name,
            resourceCount: player.resourceCount
          }))
        });
      window.advanceTime = () => undefined;
      return;
    }
    window.render_game_to_text = undefined;
    window.advanceTime = () => undefined;
  }, [localState, onlineSession.gameView, onlineState]);

  useEffect(() => {
    if (onlineSession.connectionState !== "connected") {
      previousOnlineStateRef.current = undefined;
      lastAnimatedOnlineViewRef.current = undefined;
    }
  }, [onlineSession.connectionState]);

  const submitLocal = (command: Command) => {
    clearRuleHint();
    try {
      const nextState = applyCommand(localState, command);
      previousStateRef.current = localState;
      lastCommandRef.current = command;
      dispatch({ type: "import", state: nextState });
      dispatch({ type: "error", message: undefined });
      setSelection(undefined);
      setOperationContext(undefined);
    } catch (error) {
      previousStateRef.current = undefined;
      lastCommandRef.current = undefined;
      setSelection(undefined);
      setOperationContext(undefined);
      if (error instanceof RuleError) {
        showRuleHint(error.message);
        dispatch({ type: "error", message: undefined });
        return;
      }
      dispatch({ type: "error", message: error instanceof Error ? error.message : "\u53d1\u751f\u672a\u77e5\u9519\u8bef\u3002" });
    }
  };

  const submitOnline = (command: Command) => {
    if (!onlineSession.gameView) return;
    clearRuleHint();
    dispatch({ type: "error", message: undefined });
    setSelection(undefined);
    setOperationContext(undefined);
    void onlineSession.sendCommand({
      roomCode: onlineSession.gameView.roomMeta.roomCode,
      command
    });
  };

  const clearToMenu = () => {
    clearRuleHint();
    dispatch({ type: "clear" });
    setSavedGame(loadGame());
    setPrivacy(false);
    setLastSeatPlayerId(undefined);
    setOperationContext(undefined);
  };

  const continueSavedGame = () => {
    if (!savedGame) return;
    clearRuleHint();
    const nextSeatPlayerId = savedGame.pending?.playerId ?? savedGame.currentPlayerId;
    onlineSession.leaveRoom();
    dispatch({ type: "import", state: savedGame });
    setOperationContext(undefined);
    setLastSeatPlayerId(nextSeatPlayerId);
    setPrivacy(
      Boolean(
        savedGame.pending &&
          savedGame.pending.playerId !== savedGame.currentPlayerId &&
          savedGame.phase !== "setup"
      )
    );
  };

  if (!activeState) {
    const currentSavedPlayer =
      savedGame?.players.find((player) => player.id === (savedGame.pending?.playerId ?? savedGame.currentPlayerId)) ??
      savedGame?.players.find((player) => player.id === savedGame.currentPlayerId);

    return (
      <StartScreen
        hasSavedGame={Boolean(savedGame)}
        savedGameSummary={
          savedGame && currentSavedPlayer
            ? { turn: savedGame.turn, currentPlayerName: currentSavedPlayer.name }
            : undefined
        }
        onContinue={continueSavedGame}
        onCreate={(command) => {
          clearRuleHint();
          onlineSession.leaveRoom();
          submitLocal(command);
        }}
        online={{
          busy: onlineSession.busy,
          error: onlineSession.error,
          connectionState: onlineSession.connectionState,
          lobbyView: onlineSession.lobbyView,
          onCreateRoom: (payload) => onlineSession.createRoom(payload),
          onJoinRoom: (payload) => onlineSession.joinRoom(payload),
          onChooseFaction: (payload) => onlineSession.chooseFaction(payload),
          onStartRoom: () => {
            if (!onlineSession.lobbyView) return;
            void onlineSession.startRoom({ roomCode: onlineSession.lobbyView.roomMeta.roomCode });
          },
          onLeaveRoom: () => {
            clearRuleHint();
            onlineSession.leaveRoom();
            setTool("none");
            setSelection(undefined);
            setOperationContext(undefined);
          },
          onDismissError: onlineSession.dismissError
        }}
      />
    );
  }

  const viewerPlayerId =
    localState
      ? localState.pending?.playerId ?? localState.currentPlayerId
      : onlineSession.gameView?.viewerPlayerId ?? activeState.currentPlayerId;
  const pendingPlayerId = localState?.pending?.playerId ?? onlineSession.gameView?.publicState.pending?.playerId;
  const currentPlayer = activeState.players.find((player) => player.id === activeState.currentPlayerId)!;
  const seatPlayer = activeState.players.find((player) => player.id === viewerPlayerId) ?? currentPlayer;
  const operationHint = getOperationHint(activeState, tool, selection, operationContext);
  const clearHandler = localState
    ? clearToMenu
    : () => {
        clearRuleHint();
        if (onlineSession.gameView?.roomMeta.status === "finished") {
          void onlineSession.returnToLobby({ roomCode: onlineSession.gameView.roomMeta.roomCode });
        } else {
          onlineSession.leaveRoom();
        }
        setTool("none");
        setSelection(undefined);
        setOperationContext(undefined);
      };
  if (!canShowGameBoard) {
    return <GameArtLoadingScreen />;
  }

  return (
    <GameShell
      state={activeState}
      error={model.error ?? onlineSession.error}
      privacy={localState ? privacy : false}
      seatPlayerName={seatPlayer.name}
      viewerPlayerId={viewerPlayerId}
      pendingPlayerId={pendingPlayerId}
      interactionMode={localState ? "hot-seat" : "online"}
      onlineRoomCode={onlineSession.gameView?.roomMeta.roomCode}
      onlineConnectionState={onlineSession.connectionState}
      onlineCommandBusy={!localState && onlineSession.busy}
      tool={tool}
      selection={selection}
      animationEvents={animationEvents}
      animationBusy={isAnimating}
      ruleHint={ruleHint?.message}
      operationHint={operationHint}
      onClosePrivacy={() => setPrivacy(false)}
      onDismissError={() => {
        dispatch({ type: "error", message: undefined });
        onlineSession.dismissError();
      }}
      onReportError={showRuleHint}
      onClear={clearHandler}
      onReconnectOnlineRoom={() => {
        void onlineSession.resumeSavedSession();
      }}
      onLeaveOnlineRoom={() => {
        clearRuleHint();
        onlineSession.leaveRoom();
        setTool("none");
        setSelection(undefined);
        setOperationContext(undefined);
      }}
      submit={localState ? submitLocal : submitOnline}
      setTool={setTool}
      setSelection={setSelection}
      setOperationContext={setOperationContext}
    />
  );
}

function GameArtLoadingScreen() {
  return (
    <main className="game-viewport">
      <div className="game-loading-shell" role="status" aria-live="polite">
        <div className="game-loading-panel">
          <span>正在装载战场资源</span>
          <strong>请稍候</strong>
          <i aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export default App;
