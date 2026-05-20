import type { BoardState } from "../../domain/types";
import type { GameAnimationEvent } from "../animation/animationTypes";
import { ZombiePulseAnimation } from "../animation/ZombiePulseAnimation";

const BOARD_EVENT_KINDS = new Set<GameAnimationEvent["kind"]>(["zombieMove", "zombieTrackAdvance"]);

export function BoardAnimationLayer({
  board,
  events
}: {
  board: BoardState;
  events: GameAnimationEvent[];
}) {
  const boardEvents = events.filter((event) => BOARD_EVENT_KINDS.has(event.kind));
  if (boardEvents.length === 0) return null;

  return (
    <g className="board-animation-layer" aria-hidden="true">
      {boardEvents.map((event) => {
        const point = event.targetId ? targetPoint(board, event.targetId) : undefined;
        if (!point) return null;
        if (event.kind === "zombieMove" || event.kind === "zombieTrackAdvance") {
          return <ZombiePulseAnimation key={event.id} event={event} point={point} />;
        }
        return <circle key={event.id} cx={point.x} cy={point.y} r="18" className={`board-motion-pulse ${event.kind}`} />;
      })}
    </g>
  );
}

function targetPoint(board: BoardState, id: string): { x: number; y: number } | undefined {
  if (board.tiles[id]) return { x: board.tiles[id].x, y: board.tiles[id].y };
  if (board.vertices[id]) return { x: board.vertices[id].x, y: board.vertices[id].y };
  if (board.edges[id]) {
    const edge = board.edges[id];
    const a = board.vertices[edge.vertexIds[0]];
    const b = board.vertices[edge.vertexIds[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return undefined;
}
