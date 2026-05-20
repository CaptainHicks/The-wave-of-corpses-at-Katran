import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { DEV_CARD_LABELS } from "../../domain/constants";
import type { DevCard as DevCardModel } from "../../domain/types";
import { devCardAssets } from "../art/assetManifest";

const SWIPE_THRESHOLD = 36;

export function DevCard({
  card,
  playable,
  reason,
  selected,
  count,
  index,
  total,
  onSelect,
  onHover,
  onHoverEnd,
  onPlay
}: {
  card: DevCardModel;
  playable: boolean;
  reason?: string;
  selected: boolean;
  count: number;
  index: number;
  total: number;
  onSelect: () => void;
  onHover: (event: MouseEvent<HTMLElement>) => void;
  onHoverEnd: () => void;
  onPlay: () => boolean;
}) {
  const pointerStartY = useRef<number>();
  const swallowedClick = useRef(false);
  const deniedTimeout = useRef<number>();
  const [denied, setDenied] = useState(false);
  const asset = devCardAssets[card.type];
  const center = (total - 1) / 2;
  const offset = index - center;
  const spacing = total <= 1 ? 0 : Math.min(124, Math.max(80, 700 / (total - 1)));
  const style = {
    "--card-fallback": asset.fallbackColor,
    "--fan-x": `${offset * spacing}px`,
    "--fan-y": `${Math.abs(offset) * 13}px`,
    "--fan-rotation": `${offset * 6.5}deg`,
    "--fan-z": index + 10
  } as CSSProperties;

  useEffect(() => {
    return () => {
      if (deniedTimeout.current !== undefined) window.clearTimeout(deniedTimeout.current);
    };
  }, []);

  const showDenied = () => {
    if (deniedTimeout.current !== undefined) window.clearTimeout(deniedTimeout.current);
    setDenied(false);
    window.requestAnimationFrame(() => setDenied(true));
    deniedTimeout.current = window.setTimeout(() => setDenied(false), 420);
  };

  const tryPlay = () => {
    onSelect();
    if (!onPlay()) showDenied();
  };

  const startGesture = (clientY: number) => {
    pointerStartY.current = clientY;
    swallowedClick.current = false;
    onSelect();
  };

  const finishGesture = (clientY: number, preventDefault: () => void, stopPropagation?: () => void) => {
    const startY = pointerStartY.current;
    pointerStartY.current = undefined;
    if (startY === undefined) return;
    if (startY - clientY >= SWIPE_THRESHOLD) {
      swallowedClick.current = true;
      preventDefault();
      stopPropagation?.();
      tryPlay();
    }
  };

  return (
    <article
      className={`dev-hand-card ${playable ? "playable" : "locked"} ${selected ? "selected" : ""} ${
        denied ? "denied" : ""
      }`}
      style={style}
      role="button"
      tabIndex={0}
      aria-disabled={!playable}
      aria-label={`${DEV_CARD_LABELS[card.type]}${reason ? `，${reason}` : ""}`}
      title={reason ?? DEV_CARD_LABELS[card.type]}
      data-dev-card-id={card.id}
      onClick={() => {
        if (swallowedClick.current) {
          swallowedClick.current = false;
          return;
        }
        onSelect();
      }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          tryPlay();
        }
      }}
      onPointerDown={(event) => {
        startGesture(event.clientY);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishGesture(event.clientY, () => event.preventDefault(), () => event.stopPropagation());
      }}
      onMouseDown={(event) => {
        if (pointerStartY.current === undefined) startGesture(event.clientY);
      }}
      onMouseUp={(event) => {
        finishGesture(event.clientY, () => event.preventDefault(), () => event.stopPropagation());
      }}
      onPointerCancel={() => {
        pointerStartY.current = undefined;
      }}
    >
      <span className="card-face-art" aria-hidden="true">
        {asset.imageUrl ? (
          <img src={asset.imageUrl} alt="" draggable={false} />
        ) : (
          <span className="card-face-fallback">{asset.fallbackLabel}</span>
        )}
      </span>
      <strong className="card-count">{count}</strong>
    </article>
  );
}
