import { Fragment } from "react";

import { cn, formatCurrencyParts, type CurrencyFormatOptions } from "@/lib/utils";

export type CurrencyAmountProps = CurrencyFormatOptions & {
  value: number;
  className?: string;
  symbolClassName?: string;
  showPlus?: boolean;
};

export function CurrencyAmount({
  value,
  className,
  symbolClassName,
  showPlus = false,
  ...formatOptions
}: CurrencyAmountProps) {
  const parts = formatCurrencyParts(value, formatOptions);
  const symbolClasses = cn("text-current opacity-70", symbolClassName);

  return (
    <span className={cn("tabular-nums font-mono", className)}>
      {showPlus && value > 0 ? (
        <span className={symbolClasses} aria-hidden="true">
          +
        </span>
      ) : null}
      {parts.map((part, index) =>
        part.type === "currency" ? (
          <span key={`currency-${part.value}-${index}`} className={symbolClasses}>
            {part.value}
          </span>
        ) : (
          <Fragment key={`${part.type}-${part.value}-${index}`}>{part.value}</Fragment>
        )
      )}
    </span>
  );
}
