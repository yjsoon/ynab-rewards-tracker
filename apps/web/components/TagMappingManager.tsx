'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Sparkles } from 'lucide-react';
import { YNAB_FLAG_COLORS, COMMON_REWARD_CATEGORIES } from '@/lib/ynab-constants';
import type { TagMapping } from '@/lib/storage';

interface Props {
  mappings: TagMapping[];
  onSave: (mapping: TagMapping) => void;
  onDelete: (id: string) => void;
  suggestedCategories?: string[];
  compact?: boolean;
}

export function TagMappingManager({ mappings, onSave, onDelete, suggestedCategories = [], compact = false }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const allCategories = [...new Set([...COMMON_REWARD_CATEGORIES, ...suggestedCategories])];

  function handleAdd() {
    if (!selectedFlag || (!selectedCategory && !customCategory)) return;

    const newMapping: TagMapping = {
      id: Math.random().toString(36).slice(2),
      cardId: '', // Will be set by parent
      ynabTag: selectedFlag,
      rewardCategory: useCustom ? customCategory : selectedCategory,
    };

    onSave(newMapping);
    resetForm();
  }

  function resetForm() {
    setIsAdding(false);
    setSelectedFlag('');
    setSelectedCategory('');
    setCustomCategory('');
    setUseCustom(false);
  }

  const flagColorMap = Object.fromEntries(YNAB_FLAG_COLORS.map(f => [f.value, f]));

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {mappings.map(m => {
            const flag = flagColorMap[m.ynabTag];
            return (
              <div key={m.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 rounded-full">
                {flag && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: flag.color }}
                    title={flag.label}
                  />
                )}
                <span className="text-sm">{m.rewardCategory}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => onDelete(m.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
          {!isAdding && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdding(true)}
              className="h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Mapping
            </Button>
          )}
        </div>

        {isAdding && (
          <div className="flex gap-2 p-3 border rounded-lg bg-background">
            <Select value={selectedFlag} onValueChange={setSelectedFlag}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Flag" />
              </SelectTrigger>
              <SelectContent>
                {YNAB_FLAG_COLORS.map(flag => (
                  <SelectItem key={flag.value} value={flag.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: flag.color }}
                      />
                      {flag.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!useCustom ? (
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom" onSelect={() => setUseCustom(true)}>
                    <Sparkles className="h-3 w-3 mr-2 inline" />
                    Custom...
                  </SelectItem>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Custom category"
                className="flex-1 px-3 py-2 text-sm border rounded-md"
                autoFocus
              />
            )}

            <Button size="sm" onClick={handleAdd}>Add</Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag Mappings</CardTitle>
        <CardDescription>
          Map YNAB flag colours to reward categories
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mappings.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-3">No mappings configured</p>
            <p className="text-sm mb-4">Flag your transactions in YNAB, then map them to reward categories here.</p>
          </div>
        )}

        <div className="space-y-2">
          {mappings.map(m => {
            const flag = flagColorMap[m.ynabTag];
            return (
              <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {flag && (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: flag.color }}
                      />
                      <span className="text-sm font-medium">{flag.label}</span>
                    </div>
                  )}
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary">{m.rewardCategory}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(m.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {isAdding ? (
          <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">YNAB Flag</label>
                <Select value={selectedFlag} onValueChange={setSelectedFlag}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select flag colour" />
                  </SelectTrigger>
                  <SelectContent>
                    {YNAB_FLAG_COLORS.map(flag => (
                      <SelectItem key={flag.value} value={flag.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: flag.color }}
                          />
                          {flag.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Reward Category</label>
                {!useCustom ? (
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom" onSelect={() => setUseCustom(true)}>
                        <Sparkles className="h-3 w-3 mr-2 inline" />
                        Custom category...
                      </SelectItem>
                      {allCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="Enter custom category"
                      className="flex-1 px-3 py-2 text-sm border rounded-md"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setUseCustom(false); setCustomCategory(''); }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!selectedFlag || (!selectedCategory && !customCategory)}>
                Add Mapping
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setIsAdding(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Mapping
          </Button>
        )}
      </CardContent>
    </Card>
  );
}