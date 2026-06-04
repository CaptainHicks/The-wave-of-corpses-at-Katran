import type { Dispatch, SetStateAction } from "react";
import type { Command, GameState } from "../../domain/types";
import type { GameAnimationEvent } from "../animation/animationTypes";
import type { UiOperationContext, UiSelection, UiTool } from "../gameUiTypes";
import { DevCardHand } from "./DevCardHand";

export function BottomHand({
  state,
  viewerPlayerId = state.pending?.playerId ?? state.currentPlayerId,
  animationEvents = [],
  submit,
  setTool,
  setSelection,
  setOperationContext
}: {
  state: GameState;
  viewerPlayerId?: string;
  animationEvents: GameAnimationEvent[];
  submit: (command: Command) => void;
  setTool: (tool: UiTool) => void;
  setSelection: Dispatch<SetStateAction<UiSelection | undefined>>;
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
}) {
  const player = state.players.find((item) => item.id === viewerPlayerId) ?? state.players[0];

  return (
    <section className="bottom-hand" aria-label={`${player.name} 的发展卡区`}>
      <DevCardHand
        state={state}
        player={player}
        submit={submit}
        setTool={setTool}
        setSelection={setSelection}
        setOperationContext={setOperationContext}
      />
    </section>
  );
}
