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
  ariaLabel?: string;
  disabled?: boolean;
  customNames?: Partial<Record<YnabFlagColor, string>>;
  rewardCategories?: Map<string, string>; // Card-specific subcategories: flagColor -> subcategoryName
}

export function FlagColorPicker({ value, onChange, ariaLabel, disabled, customNames, rewardCategories }: FlagColorPickerProps) {
  const allFlags = [UNFLAGGED_FLAG, ...YNAB_FLAG_COLORS];

  const normalizedValue = value || UNFLAGGED_FLAG.value;

  const getDisplayName = (flagValue: YnabFlagColor) => {
    // Priority: reward category (card-specific) > custom flag name (budget-level) > default color name
    const categoryName = rewardCategories?.get(flagValue);
    const customName = customNames?.[flagValue];
    const defaultLabel = allFlags.find(f => f.value === flagValue)?.label;

    return categoryName || customName || defaultLabel || flagValue;
  };

  return (
    <Select
      value={normalizedValue}
      onValueChange={(val) => onChange(val === UNFLAGGED_FLAG.value ? null : val as YnabFlagColor)}
      disabled={disabled}
    >
      <SelectTrigger
        className="w-full text-left justify-start"
        aria-label={ariaLabel
          ? `${ariaLabel}: ${getDisplayName(normalizedValue)}`
          : undefined}
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full border flex-shrink-0"
              style={{ backgroundColor: allFlags.find(f => f.value === normalizedValue)?.color }}
            />
            <span className="truncate">{getDisplayName(normalizedValue)}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
        {allFlags.map((flag) => (
          <SelectItem key={flag.value} value={flag.value}>
            <span className="flex min-w-0 max-w-full items-center gap-2">
              <span
                className="inline-block w-3 h-3 shrink-0 rounded-full border"
                style={{ backgroundColor: flag.color }}
              />
              <span className="min-w-0 break-all">
                {getDisplayName(flag.value)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
