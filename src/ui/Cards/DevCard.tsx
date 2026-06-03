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
  coarsePointer,
  index,
  total,
  touchPullDistance = 0,
  touchDragging = false,
  touchPlayReady = false,
  forceDenied = false,
  onActivate,
  onSelect,
  onHover,
  onHoverEnd,
  onPlay,
  onCoarsePointerDown
}: {
  card: DevCardModel;
  playable: boolean;
  reason?: string;
  selected: boolean;
  count: number;
  coarsePointer: boolean;
  index: number;
  total: number;
  touchPullDistance?: number;
  touchDragging?: boolean;
  touchPlayReady?: boolean;
  forceDenied?: boolean;
  onActivate: () => void;
  onSelect: () => void;
  onHover: (event: MouseEvent<HTMLElement>) => void;
  onHoverEnd: () => void;
  onPlay: () => boolean;
  onCoarsePointerDown: (pointerId: number, clientX: number, clientY: number) => void;
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
    "--fan-z": index + 10,
    "--touch-pull-y": `${-touchPullDistance}px`
  } as CSSProperties;
  const className = [
    "dev-hand-card",
    playable ? "playable" : "locked",
    selected ? "selected" : "",
    denied || forceDenied ? "denied" : "",
    touchDragging ? "touch-dragging" : "",
    touchPlayReady ? "touch-play-ready" : ""
  ]
    .filter(Boolean)
    .join(" ");

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

  const startGesture = (clientY: number, selectOnPress: boolean) => {
    pointerStartY.current = clientY;
    swallowedClick.current = false;
    if (selectOnPress) onSelect();
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
      className={className}
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
        onActivate();
      }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          tryPlay();
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") {
          swallowedClick.current = true;
          pointerStartY.current = undefined;
          onCoarsePointerDown(event.pointerId, event.clientX, event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
        startGesture(event.clientY, event.pointerType === "mouse" || !coarsePointer);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (event.pointerType !== "mouse") {
          swallowedClick.current = true;
          pointerStartY.current = undefined;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        finishGesture(event.clientY, () => event.preventDefault(), () => event.stopPropagation());
      }}
      onMouseDown={(event) => {
        if (coarsePointer) return;
        if (pointerStartY.current === undefined) startGesture(event.clientY, !coarsePointer);
      }}
      onMouseUp={(event) => {
        if (coarsePointer) return;
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
      <span className="dev-card-owned-count" aria-label={`持有 ${count} 张${DEV_CARD_LABELS[card.type]}`}>
        <span className="dev-card-owned-count__label">持有</span>
        <strong className="dev-card-owned-count__value">×{count}</strong>
      </span>
    </article>
  );
}
