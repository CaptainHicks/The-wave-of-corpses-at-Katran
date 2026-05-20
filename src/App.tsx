import { useEffect, useReducer, useRef, useState } from "react";
import { applyCommand, serializeStateForText, RuleError } from "./domain/rules";
import type { Command, GameState } from "./domain/types";
import { materializeOnlineGameState } from "./online/clientState";
import { loadGame, saveGame } from "./persistence/storage";
import { useOnlineSession } from "./online/useOnlineSession";
import { diffGameStates } from "./ui/animation/diffGameStates";
import { useGameAnimations } from "./ui/animation/useGameAnimations";
import { gameAudio } from "./ui/audio/audioController";
import { useAudioUnlock, useInteractiveAudioFeedback, useMusicMode } from "./ui/audio/useAudio";
import { GameShell } from "./ui/GameShell";
import { StartScreen } from "./ui/StartScreen";
import type { UiSelection, UiTool } from "./ui/gameUiTypes";

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
  const onlineSession = useOnlineSession();
  const localState = model.state;
  const onlineState = onlineSession.gameView ? materializeOnlineGameState(onlineSession.gameView) : undefined;
  const activeState = localState ?? onlineState;
  const previousStateRef = useRef<GameState>();
  const previousOnlineStateRef = useRef<GameState>();
  const lastCommandRef = useRef<Command>();
  const { events: animationEvents, pushEvents, isAnimating } = useGameAnimations();
  const [tool, setTool] = useState<UiTool>("none");
  const [selection, setSelection] = useState<UiSelection>();
  const [privacy, setPrivacy] = useState(false);
  const [lastSeatPlayerId, setLastSeatPlayerId] = useState<string | undefined>();

  useAudioUnlock();
  useInteractiveAudioFeedback();
  useMusicMode(
    !activeState
      ? "menu"
      : activeState.phase === "victory"
        ? activeState.winnerId
          ? "settlement-clear"
          : "settlement-over"
        : "gameplay"
  );

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
      return;
    }
    const previous = previousOnlineStateRef.current;
    const command = onlineSession.gameView.lastCommand;
    if (previous && command) {
      const animationInputs = diffGameStates(previous, onlineState, command, onlineSession.gameView.viewerPlayerId);
      pushEvents(animationInputs);
      gameAudio.playAnimationEvents(animationInputs);
    }
    previousOnlineStateRef.current = onlineState;
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
    }
  }, [onlineSession.connectionState]);

  const submitLocal = (command: Command) => {
    previousStateRef.current = localState;
    lastCommandRef.current = command;
    dispatch({ type: "command", command });
    setSelection(undefined);
  };

  const submitOnline = (command: Command) => {
    if (!onlineSession.gameView) return;
    setSelection(undefined);
    void onlineSession.sendCommand({
      roomCode: onlineSession.gameView.roomMeta.roomCode,
      command
    });
  };

  const clearToMenu = () => {
    dispatch({ type: "clear" });
    setSavedGame(loadGame());
    setPrivacy(false);
    setLastSeatPlayerId(undefined);
  };

  const continueSavedGame = () => {
    if (!savedGame) return;
    const nextSeatPlayerId = savedGame.pending?.playerId ?? savedGame.currentPlayerId;
    onlineSession.leaveRoom();
    dispatch({ type: "import", state: savedGame });
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
          onStartRoom: () => {
            if (!onlineSession.lobbyView) return;
            void onlineSession.startRoom({ roomCode: onlineSession.lobbyView.roomMeta.roomCode });
          },
          onLeaveRoom: () => {
            onlineSession.leaveRoom();
            setTool("none");
            setSelection(undefined);
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
  const clearHandler = localState
    ? clearToMenu
    : () => {
        onlineSession.leaveRoom();
        setTool("none");
        setSelection(undefined);
      };
  const importHandler = localState ? (state: GameState) => dispatch({ type: "import", state }) : () => undefined;

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
      tool={tool}
      selection={selection}
      animationEvents={animationEvents}
      animationBusy={isAnimating}
      onClosePrivacy={() => setPrivacy(false)}
      onDismissError={() => {
        dispatch({ type: "error", message: undefined });
        onlineSession.dismissError();
      }}
      onClear={clearHandler}
      onImportState={importHandler}
      onLeaveOnlineRoom={() => {
        onlineSession.leaveRoom();
        setTool("none");
        setSelection(undefined);
      }}
      submit={localState ? submitLocal : submitOnline}
      setTool={setTool}
      setSelection={setSelection}
    />
  );
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export default App;
