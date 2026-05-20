import type { GameState } from "../../domain/types";
import { DiceResultPanel } from "./DiceResultPanel";
import { EventLogPanel } from "./EventLogPanel";
import { ResourceInfoPanel } from "./ResourceInfoPanel";
import { TurnSummaryPanel } from "./TurnSummaryPanel";
import { ZombieInfoPanel } from "./ZombieInfoPanel";
import type { TurnUiMode } from "../selectors/turnUiMode";

export function LeftInfoRail({
  state,
  mode,
  viewerPlayerId
}: {
  state: GameState;
  mode: TurnUiMode;
  viewerPlayerId?: string;
}) {
  return (
    <aside className="left-info-rail">
      <DiceResultPanel state={state} mode={mode} />
      <ZombieInfoPanel state={state} />
      <ResourceInfoPanel state={state} viewerPlayerId={viewerPlayerId} />
      <TurnSummaryPanel state={state} mode={mode} />
      <EventLogPanel state={state} />
    </aside>
  );
}
