export function AssetIcon({
  src,
  className = ""
}: {
  src: string;
  className?: string;
}) {
  return (
    <span className={`ui-asset-icon ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" draggable={false} />
    </span>
  );
}
