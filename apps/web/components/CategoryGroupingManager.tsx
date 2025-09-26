'use client';

import { useMemo, useState } from 'react';
import type { CardSubcategory, CreditCard, SpendingCategoryGroup } from '@/lib/storage';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';
import {
  ListPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  CreditCard as CreditCardIcon,
} from 'lucide-react';

interface CategoryGroupingManagerProps {
  cards: CreditCard[];
  categoryGroups: SpendingCategoryGroup[];
  onSaveGroup: (group: SpendingCategoryGroup) => void;
  onDeleteGroup: (groupId: string) => void;
}

interface SubcategoryOption {
  key: string;
  cardId: string;
  subcategoryId: string;
  cardName: string;
  subcategoryName: string;
  cardType: CreditCard['type'];
  subcategory: CardSubcategory;
}

const buildKey = (cardId: string, subcategoryId: string) => `${cardId}::${subcategoryId}`;

function normaliseText(value: string) {
  return value.toLocaleLowerCase();
}

export function CategoryGroupingManager({
  cards,
  categoryGroups,
  onSaveGroup,
  onDeleteGroup,
}: CategoryGroupingManagerProps) {
  const [groupFormState, setGroupFormState] = useState<
    | {
        mode: 'create' | 'edit';
        group: SpendingCategoryGroup | null;
        name: string;
        description: string;
      }
    | null
  >(null);
  const [assignmentState, setAssignmentState] = useState<
    | {
        group: SpendingCategoryGroup;
        selectedSubcategories: Set<string>;
        selectedCards: Set<string>;
        search: string;
      }
    | null
  >(null);
  const [groupPendingDeletion, setGroupPendingDeletion] = useState<SpendingCategoryGroup | null>(null);

  const subcategoryOptions = useMemo<SubcategoryOption[]>(() => {
    const entries: SubcategoryOption[] = [];

    cards.forEach((card) => {
      if (!card.subcategoriesEnabled || !Array.isArray(card.subcategories)) {
        return;
      }

      card.subcategories.forEach((subcategory) => {
        if (!subcategory || subcategory.active === false || subcategory.excludeFromRewards) {
          return;
        }
        entries.push({
          key: buildKey(card.id, subcategory.id),
          cardId: card.id,
          subcategoryId: subcategory.id,
          cardName: card.name,
          subcategoryName: subcategory.name,
          cardType: card.type,
          subcategory,
        });
      });
    });

    return entries.sort((a, b) => {
      const cardCompare = a.cardName.localeCompare(b.cardName);
      if (cardCompare !== 0) {
        return cardCompare;
      }
      return a.subcategoryName.localeCompare(b.subcategoryName);
    });
  }, [cards]);

  const cardOptions = useMemo(() =>
    cards.map((card) => ({
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      hasSubcategories: Boolean(card.subcategoriesEnabled && card.subcategories && card.subcategories.length > 0),
    })),
  [cards]);

  const subcategoryAssignments = useMemo(() => {
    const map = new Map<string, SpendingCategoryGroup[]>();
    categoryGroups.forEach((group) => {
      group.subcategories.forEach((ref) => {
        // Defensive check for runtime safety, though types should ensure these exist
        if (ref?.cardId && ref?.subcategoryId) {
          const key = buildKey(ref.cardId, ref.subcategoryId);
          const existing = map.get(key);
          if (existing) {
            existing.push(group);
          } else {
            map.set(key, [group]);
          }
        }
      });
    });
    return map;
  }, [categoryGroups]);

  const assignedCardLookup = useMemo(() => {
    const map = new Map<string, SpendingCategoryGroup>();
    categoryGroups.forEach((group) => {
      (group.cards ?? []).forEach((ref) => {
        if (ref?.cardId) {
          map.set(ref.cardId, group);
        }
      });
    });
    return map;
  }, [categoryGroups]);

  const openCreateDialog = () => {
    setGroupFormState({ mode: 'create', group: null, name: '', description: '' });
  };

  const openEditDialog = (group: SpendingCategoryGroup) => {
    setGroupFormState({
      mode: 'edit',
      group,
      name: group.name,
      description: group.description ?? '',
    });
  };

  const handleGroupFormSubmit = () => {
    if (!groupFormState) {
      return;
    }

    const name = groupFormState.name.trim();
    const description = groupFormState.description.trim();

    if (!name) {
      return;
    }

    if (groupFormState.mode === 'create') {
      const nowIso = new Date().toISOString();
      onSaveGroup({
        id: '',
        name,
        description: description || undefined,
        colour: undefined,
        priority: categoryGroups.length,
        subcategories: [],
        cards: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else if (groupFormState.group) {
      const existing = groupFormState.group;
      onSaveGroup({
        ...existing,
        name,
        description: description || undefined,
        updatedAt: new Date().toISOString(),
      });
    }

    setGroupFormState(null);
  };

  const openAssignmentDialog = (group: SpendingCategoryGroup) => {
    const selectedSubcategories = new Set<string>();
    group.subcategories.forEach((ref) => {
      selectedSubcategories.add(buildKey(ref.cardId, ref.subcategoryId));
    });
    const selectedCards = new Set<string>();
    (group.cards ?? []).forEach((ref) => {
      if (ref?.cardId) {
        selectedCards.add(ref.cardId);
      }
    });
    setAssignmentState({ group, selectedSubcategories, selectedCards, search: '' });
  };

  const toggleSubcategoryAssignment = (key: string) => {
    setAssignmentState((prev) => {
      if (!prev) {
        return prev;
      }
      const nextSelected = new Set(prev.selectedSubcategories);
      if (nextSelected.has(key)) {
        nextSelected.delete(key);
      } else {
        nextSelected.add(key);
      }
      return { ...prev, selectedSubcategories: nextSelected };
    });
  };

  const toggleCardAssignment = (cardId: string) => {
    setAssignmentState((prev) => {
      if (!prev) {
        return prev;
      }
      const nextSelected = new Set(prev.selectedCards);
      if (nextSelected.has(cardId)) {
        nextSelected.delete(cardId);
      } else {
        nextSelected.add(cardId);
      }
      return { ...prev, selectedCards: nextSelected };
    });
  };

  const handleAssignmentSave = () => {
    if (!assignmentState) {
      return;
    }
    const { group, selectedSubcategories, selectedCards } = assignmentState;
    const subcategories = Array.from(selectedSubcategories).map((key) => {
      const [cardId, subcategoryId] = key.split('::');
      return { cardId, subcategoryId };
    });
    const cards = Array.from(selectedCards).map((cardId) => ({ cardId }));
    onSaveGroup({
      ...group,
      subcategories,
      cards,
      updatedAt: new Date().toISOString(),
    });
    setAssignmentState(null);
  };

  const filteredSubcategoryOptions = useMemo(() => {
    if (!assignmentState) {
      return subcategoryOptions;
    }
    const query = assignmentState.search.trim();
    if (!query) {
      return subcategoryOptions;
    }
    const normalised = normaliseText(query);
    return subcategoryOptions.filter((option) => {
      const cardMatch = normaliseText(option.cardName).includes(normalised);
      const subMatch = normaliseText(option.subcategoryName).includes(normalised);
      return cardMatch || subMatch;
    });
  }, [assignmentState, subcategoryOptions]);

  const filteredCardOptions = useMemo(() => {
    if (!assignmentState) {
      return cardOptions;
    }
    const query = assignmentState.search.trim();
    if (!query) {
      return cardOptions;
    }
    const normalised = normaliseText(query);
    return cardOptions.filter((option) => normaliseText(option.cardName).includes(normalised));
  }, [assignmentState, cardOptions]);

  const handleAssignmentSearchChange = (value: string) => {
    setAssignmentState((prev) => (prev ? { ...prev, search: value } : prev));
  };

  const handleDeleteGroup = () => {
    if (!groupPendingDeletion) {
      return;
    }
    onDeleteGroup(groupPendingDeletion.id);
    setGroupPendingDeletion(null);
  };

  const closeAssignmentDialog = () => setAssignmentState(null);
  const closeGroupForm = () => setGroupFormState(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Spending themes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bundle card reward segments or whole cards into broader themes so recommendations stay meaningful.
          </p>
        </div>
        <div className="flex w-full justify-end sm:w-auto">
          <Button size="sm" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create theme
          </Button>
        </div>
      </div>

      {categoryGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No themes yet. Click <span className="font-medium">Create theme</span> to start grouping subcategories or link entire cards.
        </div>
      ) : (
        <div className="space-y-4">
          {categoryGroups.map((group) => {
            const assignedSubcategoryKeys = group.subcategories.map((ref) =>
              buildKey(ref.cardId, ref.subcategoryId)
            );
            const assignedSubcategories = assignedSubcategoryKeys
              .map((key) => subcategoryOptions.find((option) => option.key === key))
              .filter((value): value is SubcategoryOption => Boolean(value));

            const assignedCards = (group.cards ?? [])
              .map((ref) => {
                const detail = cardOptions.find((option) => option.cardId === ref.cardId);
                return detail ?? null;
              })
              .filter((value): value is typeof cardOptions[number] => Boolean(value));

            return (
              <Card key={group.id} className="border-muted shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="space-y-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      {group.description && <CardDescription>{group.description}</CardDescription>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {`${assignedSubcategories.length} subcategor${assignedSubcategories.length === 1 ? 'y' : 'ies'}`}
                      </Badge>
                      <Badge variant="outline">
                        {assignedCards.length} linked card{assignedCards.length === 1 ? '' : 's'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => openEditDialog(group)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => openAssignmentDialog(group)}
                      >
                        <ListPlus className="h-4 w-4" />
                        Manage links
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setGroupPendingDeletion(group)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Card subcategories</h4>
                    {assignedSubcategories.length > 0 ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {assignedSubcategories.map((option) => (
                          <div key={option.key} className="rounded-md border bg-card p-3 text-sm">
                            <div className="font-medium text-foreground">{option.subcategoryName}</div>
                            <div className="text-xs text-muted-foreground">
                              {option.cardName} • {option.cardType === 'cashback' ? 'Cashback' : 'Miles'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No subcategories linked yet. Use <span className="font-medium">Manage links</span> to add them.
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground">Whole card links</h4>
                    {assignedCards.length > 0 ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {assignedCards.map((card) => (
                          <div
                            key={card.cardId}
                            className="flex items-center gap-3 rounded-md border bg-card p-3 text-sm"
                          >
                            <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-foreground">{card.cardName}</div>
                              <div className="text-xs text-muted-foreground">
                                {card.cardType === 'cashback' ? 'Cashback' : 'Miles'} card
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No whole-card links. Add cards here when you want the entire card considered for this theme.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={groupFormState !== null} onOpenChange={(open) => !open && closeGroupForm()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {groupFormState?.mode === 'edit' ? 'Edit theme details' : 'Create spending theme'}
            </DialogTitle>
            <DialogDescription>
              Choose a clear name so you remember which purchases sit under this theme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={groupFormState?.name ?? ''}
                onChange={(event) =>
                  setGroupFormState((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev
                  )
                }
                placeholder="e.g. Transport"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <textarea
                id="category-description"
                value={groupFormState?.description ?? ''}
                onChange={(event) =>
                  setGroupFormState((prev) =>
                    prev ? { ...prev, description: event.target.value } : prev
                  )
                }
                rows={3}
                className={cn(
                  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'resize-none'
                )}
                placeholder="Optional helper text"
              />
              <p className="text-xs text-muted-foreground">
                Keep it concise – it appears alongside recommendations.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeGroupForm}>
              Cancel
            </Button>
            <Button onClick={handleGroupFormSubmit} disabled={!groupFormState?.name.trim()}>
              {groupFormState?.mode === 'edit' ? 'Save changes' : 'Create theme'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentState !== null} onOpenChange={(open) => !open && closeAssignmentDialog()}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>
              {assignmentState?.group.name ?? 'Manage links'}
            </DialogTitle>
            <DialogDescription>
              Link card subcategories or entire cards to this theme so the recommendations stay accurate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search cards or subcategories"
                value={assignmentState?.search ?? ''}
                onChange={(event) => handleAssignmentSearchChange(event.target.value)}
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Card subcategories</h4>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                {filteredSubcategoryOptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No matching subcategories. Try a different search term.
                  </p>
                ) : (
                  filteredSubcategoryOptions.map((option) => {
                    const assignments = subcategoryAssignments.get(option.key) ?? [];
                    const isSelected = assignmentState?.selectedSubcategories.has(option.key);
                    const otherAssignments = assignments.filter(
                      (group) => group.id !== assignmentState?.group.id
                    );
                    const alsoInText =
                      otherAssignments.length > 0
                        ? `Also in: ${otherAssignments.map((group) => group.name).join(', ')}`
                        : undefined;

                    return (
                      <label
                        key={option.key}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition hover:border-primary',
                          isSelected && 'border-primary bg-primary/10',
                          alsoInText && !isSelected && 'border-primary/40'
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{option.subcategoryName}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.cardName} • {option.cardType === 'cashback' ? 'Cashback' : 'Miles'}
                          </span>
                          {alsoInText && (
                            <span className="text-xs text-muted-foreground">{alsoInText}</span>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                          checked={Boolean(isSelected)}
                          onChange={() => toggleSubcategoryAssignment(option.key)}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Whole cards</h4>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                {filteredCardOptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No cards match this search.
                  </p>
                ) : (
                  filteredCardOptions.map((card) => {
                    const assignedGroup = assignedCardLookup.get(card.cardId);
                    const isSelected = assignmentState?.selectedCards.has(card.cardId);
                    const isDisabled = Boolean(
                      assignedGroup && assignedGroup.id !== assignmentState?.group.id
                    );
                    return (
                      <label
                        key={card.cardId}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition hover:border-primary',
                          isSelected && 'border-primary bg-primary/10',
                          isDisabled && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{card.cardName}</span>
                          <span className="text-xs text-muted-foreground">
                            {card.cardType === 'cashback' ? 'Cashback' : 'Miles'} card
                            {card.hasSubcategories ? ' • subcategories enabled' : ' • no subcategories configured'}
                          </span>
                          {isDisabled && assignedGroup && (
                            <span className="text-xs text-destructive">
                              Already linked to {assignedGroup.name}
                            </span>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                          checked={Boolean(isSelected)}
                          onChange={() => toggleCardAssignment(card.cardId)}
                          disabled={isDisabled}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAssignmentDialog}>
              Cancel
            </Button>
            <Button onClick={handleAssignmentSave}>
              Save selection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={groupPendingDeletion !== null}
        title="Delete theme"
        message="Delete this theme? Linked cards and subcategories will simply become unassigned."
        onConfirm={handleDeleteGroup}
        onCancel={() => setGroupPendingDeletion(null)}
        confirmText="Delete"
      />
    </div>
  );
}
