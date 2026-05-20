import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { RESOURCE_LABELS, RESOURCES, createResources } from "../../domain/constants";
import { resourceTotal } from "../../domain/rules";
import type { Resources } from "../../domain/types";

export function ResourcePicker({
  amount,
  label,
  available,
  onSubmit
}: {
  amount: number;
  label: string;
  available?: Resources;
  onSubmit: (resources: Partial<Resources>) => void;
}) {
  const [resources, setResources] = useState<Resources>(createResources());
  const total = resourceTotal(resources);
  return (
    <div className="resource-picker">
      <p>{label}</p>
      <div className="resource-buttons">
        {RESOURCES.map((resource) => (
          <button
            key={resource}
            disabled={
              total >= amount ||
              (available !== undefined && resources[resource] >= available[resource])
            }
            onClick={() => {
              if (total >= amount) return;
              if (available !== undefined && resources[resource] >= available[resource]) return;
              setResources((next) => ({ ...next, [resource]: next[resource] + 1 }));
            }}
          >
            <Plus size={14} />
            {RESOURCE_LABELS[resource]} {resources[resource]}
            {available ? ` / ${available[resource]}` : ""}
          </button>
        ))}
      </div>
      <div className="inline-actions">
        <button onClick={() => setResources(createResources())}>清空</button>
        <button className="primary" disabled={total !== amount} onClick={() => onSubmit(resources)}>
          <Check size={16} />
          确认
        </button>
      </div>
    </div>
  );
}
