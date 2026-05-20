import type { Resources } from "../../domain/types";
import { ResourcePicker } from "../Cards/ResourcePicker";

export function ResourcePickerModal({
  title,
  subtitle,
  amount,
  available,
  onSubmit
}: {
  title: string;
  subtitle: string;
  amount: number;
  available?: Resources;
  onSubmit: (resources: Partial<Resources>) => void;
}) {
  return (
    <div className="themed-modal resource-picker-modal">
      <header>
        <span>资源响应</span>
        <strong>{title}</strong>
      </header>
      <p className="muted-line">{subtitle}</p>
      <ResourcePicker amount={amount} label={`需要选择 ${amount} 张`} available={available} onSubmit={onSubmit} />
    </div>
  );
}
