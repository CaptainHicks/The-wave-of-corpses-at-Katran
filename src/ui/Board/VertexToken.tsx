import type { CSSProperties } from "react";
import type { BuildingType, Militia, PlayerState, VertexState } from "../../domain/types";
import { boardMarkerAssets, getBuildingPieceAsset } from "../art/assetManifest";
import { buildingPieceColorStyle, buildingPieceFilterId } from "./pieceColorStyles";
import { useImmediateBoardActivation } from "./useImmediateBoardActivation";

const BUILDING_PIECE_BOX = {
  camp: {
    plain: { width: 36, height: 40 },
    watchtower: { width: 38, height: 54 }
  },
  fortress: {
    plain: { width: 48, height: 38 },
    watchtower: { width: 50, height: 54 }
  }
};

export function VertexToken({
  vertex,
  legal,
  buildingOwner,
  previewBuildingOwner,
  previewBuildingType,
  expandedHitArea,
  coarsePointer,
  militia,
  players,
  onClick
}: {
  vertex: VertexState;
  legal: boolean;
  buildingOwner?: PlayerState;
  previewBuildingOwner?: PlayerState;
  previewBuildingType?: BuildingType;
  expandedHitArea?: boolean;
  coarsePointer?: boolean;
  militia: Militia[];
  players: PlayerState[];
  onClick: () => void;
}) {
  const ownedMilitia = buildingOwner ? militia.filter((item) => item.ownerId === buildingOwner.id) : [];
  const militiaCount = Math.min(2, ownedMilitia.length);
  const visibleMilitiaMarkers = ownedMilitia.slice(0, 2);
  const hasOwnerWatchtower = Boolean(buildingOwner && vertex.watchtowerOwnerId === buildingOwner.id);
  const buildingAsset =
    vertex.building && buildingOwner
      ? getBuildingPieceAsset({
          playerId: buildingOwner.id,
          factionId: buildingOwner.factionId,
          color: buildingOwner.color,
          buildingType: vertex.building.type,
          hasWatchtower: hasOwnerWatchtower,
          militiaCount
        })
      : undefined;
  const previewBuildingAsset =
    !vertex.building && legal && previewBuildingOwner && previewBuildingType
      ? getBuildingPieceAsset({
          playerId: previewBuildingOwner.id,
          factionId: previewBuildingOwner.factionId,
          color: previewBuildingOwner.color,
          buildingType: previewBuildingType,
          hasWatchtower: false,
          militiaCount: 0
        })
      : undefined;
  const pieceBox =
    vertex.building && BUILDING_PIECE_BOX[vertex.building.type][hasOwnerWatchtower ? "watchtower" : "plain"];
  const previewPieceBox = previewBuildingType ? BUILDING_PIECE_BOX[previewBuildingType].plain : undefined;
  const hasPreviewBuilding = Boolean(previewBuildingAsset && previewPieceBox);
  const hasExpandedHitArea = Boolean(expandedHitArea && !vertex.building && !hasPreviewBuilding);
  const hasLegalBuildingTarget = Boolean(vertex.building && buildingAsset && pieceBox && legal);
  const buildingPieceStyle = buildingOwner
    ? buildingPieceColorStyle(buildingOwner.color)
    : undefined;
  const previewBuildingPieceStyle = previewBuildingOwner
    ? buildingPieceColorStyle(previewBuildingOwner.color)
    : undefined;
  const targetHitRadius = coarsePointer ? 20 : 18;
  const touchCueRadius = 13;
  const emptyHitRadius = coarsePointer ? 6 : 5;
  const militiaMarkerSize = pieceBox ? Math.max(9, Math.min(12, pieceBox.height * 0.28)) : 0;
  const militiaMarkerTop = pieceBox ? vertex.y + pieceBox.height * 0.12 : vertex.y;
  const militiaMarkerRight =
    pieceBox && vertex.building
      ? vertex.x + pieceBox.width * (vertex.building.type === "fortress" ? 0.42 : 0.64)
      : vertex.x;
  const activationHandlers = useImmediateBoardActivation(onClick);

  return (
    <g
      className={`vertex ${vertex.building ? "has-building" : ""} ${
        hasPreviewBuilding ? "has-building-preview" : ""
      } ${hasExpandedHitArea ? "has-expanded-hit-area" : ""} ${coarsePointer ? "has-coarse-hit-area" : ""} ${legal ? "legal" : ""}`}
      data-vertex-id={vertex.id}
      {...activationHandlers}
    >
      <circle
        className={`vertex-hit-area ${hasPreviewBuilding || hasExpandedHitArea ? "preview-hit-area" : ""}`}
        cx={vertex.x}
        cy={vertex.y}
        r={vertex.building || hasPreviewBuilding || hasExpandedHitArea ? targetHitRadius : emptyHitRadius}
      />
      {hasExpandedHitArea && (
        <circle className="vertex-touch-cue" cx={vertex.x} cy={vertex.y} r={touchCueRadius} />
      )}
      {previewBuildingAsset && previewPieceBox && (
        <image
          href={previewBuildingAsset}
          x={vertex.x - previewPieceBox.width / 2}
          y={vertex.y - previewPieceBox.height * 0.62}
          width={previewPieceBox.width}
          height={previewPieceBox.height}
          preserveAspectRatio="xMidYMid meet"
          className={`building-piece building-piece-${previewBuildingType} building-piece-preview`}
          style={previewBuildingPieceStyle}
          filter="url(#selection-white-preview)"
          aria-hidden="true"
        />
      )}
      {vertex.building && buildingAsset && buildingOwner && pieceBox && (
        <>
          {hasLegalBuildingTarget && (
            <image
              href={buildingAsset}
              x={vertex.x - pieceBox.width / 2}
              y={vertex.y - pieceBox.height * 0.62}
              width={pieceBox.width}
              height={pieceBox.height}
              preserveAspectRatio="xMidYMid meet"
              className="building-piece-legal-outline"
              style={buildingPieceStyle}
              filter="url(#selection-white-outline)"
              aria-hidden="true"
            />
          )}
          <image
            href={buildingAsset}
            x={vertex.x - pieceBox.width / 2}
            y={vertex.y - pieceBox.height * 0.62}
            width={pieceBox.width}
            height={pieceBox.height}
            preserveAspectRatio="xMidYMid meet"
            className={`building-piece building-piece-${vertex.building.type} ${
              legal ? "legal-building-target" : ""
            }`}
            style={buildingPieceStyle}
            filter={`url(#${buildingPieceFilterId(buildingOwner.id, vertex.building.type)})`}
            aria-hidden="true"
          />
        </>
      )}
      {vertex.building && !buildingAsset && (
        <>
          <circle
            cx={vertex.x}
            cy={vertex.y}
            r={vertex.building.type === "fortress" ? 14 : 10}
            className={`building building-${vertex.building.type}`}
            style={{ fill: buildingOwner?.color }}
          />
          <text x={vertex.x} y={vertex.y + 4} className="building-label">
            {vertex.building.type === "fortress" ? "堡" : "营"}
          </text>
        </>
      )}
      {vertex.watchtowerOwnerId && !buildingAsset && (
        <text x={vertex.x + 11} y={vertex.y - 9} className="watchtower-token">
          哨
        </text>
      )}
      {vertex.building &&
        pieceBox &&
        visibleMilitiaMarkers.map((item, index) => {
          const isActivated = item.status !== "inactive";
          const xOffset = visibleMilitiaMarkers.length === 1 ? 0 : index === 0 ? -militiaMarkerSize * 0.62 : 0;
          return (
            <image
              key={`militia-marker-${item.id}`}
              href={boardMarkerAssets.militiaCountMarkers[isActivated ? "active" : "inactive"]}
              x={militiaMarkerRight + xOffset - militiaMarkerSize}
              y={militiaMarkerTop}
              width={militiaMarkerSize}
              height={militiaMarkerSize}
              preserveAspectRatio="xMidYMid meet"
              className={`militia-count-token ${isActivated ? "is-active" : "is-inactive"}`}
              aria-hidden="true"
            />
          );
        })}
      {(!buildingAsset ? militia : militia.filter((item) => item.ownerId !== buildingOwner?.id)).map((item, index) => {
        const owner = players.find((player) => player.id === item.ownerId);
        const militiaStyle = owner
          ? buildingPieceColorStyle(owner.color, { color: owner.color } as CSSProperties)
          : undefined;
        const offsets = [
          { x: -13, y: 13 },
          { x: 13, y: 13 }
        ];
        const offset = offsets[index] ?? offsets[1];
        return (
          <g
            key={item.id}
            className={`militia-marker militia-${item.status}`}
            transform={`translate(${vertex.x + offset.x} ${vertex.y + offset.y})`}
            style={militiaStyle}
          >
            <circle r="7" style={{ stroke: owner?.color }} />
            <text y="3">{item.status === "active" ? "活" : item.status === "readying" ? "待" : "伏"}</text>
          </g>
        );
      })}
    </g>
  );
}
