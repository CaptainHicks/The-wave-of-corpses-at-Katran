import type { Command, GameState } from "../../domain/types";
import type { TurnUiMode } from "../selectors/turnUiMode";

const TURN_BUTTON_ART = {
  dice: "/assets/hud/dice.v1.webp",
  hourglass: "/assets/hud/hourglass.v1.webp"
};

export function MainTurnButton({
  state,
  mode,
  animationBusy,
  commandBusy = false,
  interactionLocked = false,
  lockedSubtitle = "其他玩家正在行动",
  submit
}: {
  state: GameState;
  mode: TurnUiMode;
  animationBusy: boolean;
  commandBusy?: boolean;
  interactionLocked?: boolean;
  lockedSubtitle?: string;
  submit: (command: Command) => void;
}) {
  if (interactionLocked) {
    return (
      <button className="main-turn-button illustrated-turn-button illustrated-turn-button-muted" disabled>
        <TurnButtonContent
          iconUrl={TURN_BUTTON_ART.hourglass}
          title="等待其他玩家"
          subtitle={lockedSubtitle}
        />
      </button>
    );
  }

  if (commandBusy) {
    return (
      <button className="main-turn-button illustrated-turn-button illustrated-turn-button-muted" disabled aria-busy="true">
        <TurnButtonContent
          iconUrl={TURN_BUTTON_ART.hourglass}
          title="同步中"
          subtitle="正在提交联机操作"
        />
      </button>
    );
  }

  if (mode === "mustRoll") {
    return (
      <button
        className="primary main-turn-button illustrated-turn-button illustrated-turn-button-roll"
        disabled={animationBusy}
        aria-busy={animationBusy}
        onClick={() => submit({ type: "rollDice" })}
      >
        <TurnButtonContent iconUrl={TURN_BUTTON_ART.dice} title="掷骰子" subtitle="掷出两个骰子，获取资源" />
      </button>
    );
  }

  if (mode === "pending") {
    return (
      <button className="main-turn-button illustrated-turn-button illustrated-turn-button-muted" disabled>
        <TurnButtonContent
          iconUrl={TURN_BUTTON_ART.hourglass}
          title="等待处理"
          subtitle="请先完成待处理选择"
        />
      </button>
    );
  }

  if (mode === "victory") {
    return (
      <button className="main-turn-button illustrated-turn-button illustrated-turn-button-muted" disabled>
        <TurnButtonContent iconUrl={TURN_BUTTON_ART.hourglass} title="战局结束" subtitle="胜利已经结算" />
      </button>
    );
  }

  if (state.phase !== "action") {
    return (
      <button className="main-turn-button illustrated-turn-button illustrated-turn-button-muted" disabled>
        <TurnButtonContent iconUrl={TURN_BUTTON_ART.hourglass} title="等待棋盘" subtitle="完成当前棋盘步骤" />
      </button>
    );
  }

  return (
    <button
      className="primary main-turn-button illustrated-turn-button illustrated-turn-button-end"
      disabled={animationBusy}
      aria-busy={animationBusy}
      onClick={() => submit({ type: "endTurn" })}
    >
      <TurnButtonContent
        iconUrl={TURN_BUTTON_ART.hourglass}
        title="结束回合"
        subtitle="进入下一位玩家的回合"
      />
    </button>
  );
}

function TurnButtonContent({
  iconUrl,
  title,
  subtitle
}: {
  iconUrl: string;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <span className="turn-button-art-frame" aria-hidden="true">
        <img className="turn-button-art" src={iconUrl} alt="" draggable={false} />
      </span>
      <span className="turn-button-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </>
  );
}
