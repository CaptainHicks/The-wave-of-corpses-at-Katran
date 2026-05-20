import { ScrollText } from "lucide-react";
import type { GameState } from "../../domain/types";

export function EventLogPanel({ state }: { state: GameState }) {
  return (
    <section className="panel compact event-log-panel">
      <h2>
        <ScrollText size={18} />
        事件日志
      </h2>
      <div className="log-panel">
        {state.log.map((event) => (
          <p key={event.id}>
            <span>#{event.turn}</span>
            {event.message}
          </p>
        ))}
      </div>
    </section>
  );
}
