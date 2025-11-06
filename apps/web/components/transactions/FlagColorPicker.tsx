"use client";

import { YNAB_FLAG_COLORS, UNFLAGGED_FLAG, type YnabFlagColor } from "@/lib/ynab-constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FlagColorPickerProps {
  value: YnabFlagColor | null | undefined;
  onChange: (color: YnabFlagColor | null) => void;
  disabled?: boolean;
  customNames?: Partial<Record<YnabFlagColor, string>>;
  rewardCategories?: Map<string, string>; // Card-specific tag mappings: flagColor -> rewardCategory
}

export function FlagColorPicker({ value, onChange, disabled, customNames, rewardCategories }: FlagColorPickerProps) {
  const allFlags = [UNFLAGGED_FLAG, ...YNAB_FLAG_COLORS];

  const normalizedValue = value || UNFLAGGED_FLAG.value;

  const getDisplayName = (flagValue: YnabFlagColor) => {
    // Priority: reward category (card-specific) > custom flag name (budget-level) > default color name
    const categoryName = rewardCategories?.get(flagValue);
    const customName = customNames?.[flagValue];
    const defaultLabel = allFlags.find(f => f.value === flagValue)?.label;

    // Debug logging
    if (rewardCategories && rewardCategories.size > 0) {
      console.log(`FlagColorPicker - flagValue: ${flagValue}, categoryName: ${categoryName}, customName: ${customName}, defaultLabel: ${defaultLabel}`);
      console.log('rewardCategories keys:', Array.from(rewardCategories.keys()));
    }

    return categoryName || customName || defaultLabel || flagValue;
  };

  return (
    <Select
      value={normalizedValue}
      onValueChange={(val) => onChange(val === UNFLAGGED_FLAG.value ? null : val as YnabFlagColor)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full border"
              style={{ backgroundColor: allFlags.find(f => f.value === normalizedValue)?.color }}
            />
            <span>{getDisplayName(normalizedValue)}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allFlags.map((flag) => (
          <SelectItem key={flag.value} value={flag.value}>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border"
                style={{ backgroundColor: flag.color }}
              />
              <span>{getDisplayName(flag.value)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
