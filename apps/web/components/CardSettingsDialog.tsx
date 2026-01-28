'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CardSettingsEditor, type CardEditState } from '@/components/CardSettingsEditor';
import type { CreditCard } from '@/lib/storage';
import type { YnabFlagColor } from '@/lib/ynab-constants';

interface CardSettingsDialogProps {
  card: CreditCard | null;
  state: CardEditState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (field: keyof CardEditState, value: unknown) => void;
  isChanged: boolean;
  flagNames?: Partial<Record<YnabFlagColor, string>>;
}

export function CardSettingsDialog({
  card,
  state,
  open,
  onOpenChange,
  onFieldChange,
  isChanged,
  flagNames,
}: CardSettingsDialogProps) {
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{card.name}</DialogTitle>
          <DialogDescription>{card.issuer ?? 'Unknown issuer'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <CardSettingsEditor
            card={card}
            state={state}
            onFieldChange={onFieldChange}
            isChanged={isChanged}
            showCardType
            highlightUnsetMinimum
            flagNames={flagNames}
          />
        </div>
        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
