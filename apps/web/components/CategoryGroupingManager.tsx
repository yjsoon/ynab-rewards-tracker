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
        selected: Set<string>;
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

  const assignedLookup = useMemo(() => {
    const map = new Map<string, SpendingCategoryGroup>();
    categoryGroups.forEach((group) => {
      group.subcategories.forEach((ref) => {
        map.set(buildKey(ref.cardId, ref.subcategoryId), group);
      });
    });
    return map;
  }, [categoryGroups]);

  const ungroupedSubcategories = useMemo(() => {
    return subcategoryOptions.filter((option) => !assignedLookup.has(option.key));
  }, [assignedLookup, subcategoryOptions]);

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
    const selected = new Set<string>();
    group.subcategories.forEach((ref) => {
      selected.add(buildKey(ref.cardId, ref.subcategoryId));
    });
    setAssignmentState({ group, selected, search: '' });
  };

  const toggleAssignment = (key: string) => {
    setAssignmentState((prev) => {
      if (!prev) {
        return prev;
      }
      const nextSelected = new Set(prev.selected);
      if (nextSelected.has(key)) {
        nextSelected.delete(key);
      } else {
        nextSelected.add(key);
      }
      return { ...prev, selected: nextSelected };
    });
  };

  const handleAssignmentSave = () => {
    if (!assignmentState) {
      return;
    }
    const { group, selected } = assignmentState;
    const subcategories = Array.from(selected).map((key) => {
      const [cardId, subcategoryId] = key.split('::');
      return { cardId, subcategoryId };
    });
    onSaveGroup({
      ...group,
      subcategories,
      updatedAt: new Date().toISOString(),
    });
    setAssignmentState(null);
  };

  const filteredOptions = useMemo(() => {
    if (!assignmentState) {
      return [];
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
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Spending categories</CardTitle>
          <CardDescription>
            Group your bespoke subcategories into broader spending themes to make card recommendations ho say.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-muted/40">
            {categoryGroups.length} group{categoryGroups.length === 1 ? '' : 's'}
          </Badge>
          <Badge variant={ungroupedSubcategories.length > 0 ? 'destructive' : 'secondary'}>
            {ungroupedSubcategories.length} ungrouped
          </Badge>
          <Button size="sm" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            Create category
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {subcategoryOptions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Enable card subcategories to start organising your spending themes, bro.
          </div>
        ) : categoryGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No categories yet. Start by clicking <span className="font-medium">Create category</span> to lump related subcategories together, steady pom pi pi.
          </div>
        ) : (
          <div className="space-y-4">
            {categoryGroups.map((group) => {
              const assigned = group.subcategories.map((ref) => buildKey(ref.cardId, ref.subcategoryId));
              const assignedOptions = assigned
                .map((key) => subcategoryOptions.find((option) => option.key === key))
                .filter((value): value is SubcategoryOption => Boolean(value));

              return (
                <Card key={group.id} className="border-muted">
                  <CardHeader className="space-y-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {group.name}
                        </CardTitle>
                        {group.description && (
                          <CardDescription>{group.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {assignedOptions.length} tagged
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
                          Manage subcategories
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
                  <CardContent>
                    {assignedOptions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {assignedOptions.map((option) => (
                          <div
                            key={option.key}
                            className="rounded-md border bg-card p-3 text-sm"
                          >
                            <div className="font-medium text-foreground">
                              {option.subcategoryName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {option.cardName} • {option.cardType === 'cashback' ? 'Cashback' : 'Miles'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No linked subcategories yet. Click <span className="font-medium">Manage subcategories</span> to add some, confirm steady steady.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={groupFormState !== null} onOpenChange={(open) => !open && closeGroupForm()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {groupFormState?.mode === 'edit' ? 'Edit category details' : 'Create spending category'}
            </DialogTitle>
            <DialogDescription>
              Give the category a clear name so you remember which spending ho say.
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
                Keep it short and shiok – helps when comparing cards later.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeGroupForm}>
              Cancel
            </Button>
            <Button onClick={handleGroupFormSubmit} disabled={!groupFormState?.name.trim()}>
              {groupFormState?.mode === 'edit' ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentState !== null} onOpenChange={(open) => !open && closeAssignmentDialog()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {assignmentState?.group.name ?? 'Manage subcategories'}
            </DialogTitle>
            <DialogDescription>
              Choose the subcategories that should roll up under this spending theme. Once added, the recommendations will jialat jialat optimise for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by card or subcategory"
                value={assignmentState?.search ?? ''}
                onChange={(event) => handleAssignmentSearchChange(event.target.value)}
              />
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
              {filteredOptions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No matching subcategories. Try a different search term.
                </p>
              ) : (
                filteredOptions.map((option) => {
                  const assignedGroup = assignedLookup.get(option.key);
                  const isSelected = assignmentState?.selected.has(option.key);
                  const isDisabled = Boolean(
                    assignedGroup && assignedGroup.id !== assignmentState?.group.id
                  );

                  return (
                    <label
                      key={option.key}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition hover:border-primary',
                        isSelected && 'border-primary bg-primary/10',
                        isDisabled && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{option.subcategoryName}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.cardName} • {option.cardType === 'cashback' ? 'Cashback' : 'Miles'}
                        </span>
                        {isDisabled && assignedGroup && (
                          <span className="text-xs text-destructive">
                            Already grouped under {assignedGroup.name}
                          </span>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                        checked={Boolean(isSelected)}
                        onChange={() => toggleAssignment(option.key)}
                        disabled={isDisabled}
                      />
                    </label>
                  );
                })
              )}
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
        title="Delete category"
        message="Confirm delete? The group will be removed but your underlying subcategories stay intact."
        onConfirm={handleDeleteGroup}
        onCancel={() => setGroupPendingDeletion(null)}
        confirmText="Delete"
      />
    </Card>
  );
}
