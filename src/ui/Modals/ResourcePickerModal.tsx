import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Resources } from "../../domain/types";
import { ResourcePicker } from "../Cards/ResourcePicker";
import type { UiOperationContext } from "../gameUiTypes";

export function ResourcePickerModal({
  title,
  subtitle,
  amount,
  available,
  operationMode,
  setOperationContext,
  onSubmit
}: {
  title: string;
  subtitle: string;
  amount: number;
  available?: Resources;
  operationMode?: "choose" | "discard";
  setOperationContext?: Dispatch<SetStateAction<UiOperationContext | undefined>>;
  onSubmit: (resources: Partial<Resources>) => void;
}) {
  const handleSelectionChange = useCallback(
    (selected: number) => {
      if (!operationMode || !setOperationContext) return;
      setOperationContext({ kind: "resourcePicker", mode: operationMode, selected, amount });
    },
    [amount, operationMode, setOperationContext]
  );

  return (
    <div className="themed-modal resource-picker-modal">
      <header>
        <span>资源响应</span>
        <strong>{title}</strong>
      </header>
      <p className="muted-line">{subtitle}</p>
      <ResourcePicker
        amount={amount}
        label={`需要选择 ${amount} 张`}
        available={available}
        onSelectionChange={handleSelectionChange}
        onSubmit={onSubmit}
      />
    </div>
  );
}
