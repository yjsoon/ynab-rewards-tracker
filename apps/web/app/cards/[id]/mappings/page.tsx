"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreditCards, useTagMappings } from '@/hooks/useLocalStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, ArrowLeft } from 'lucide-react';

export default function MappingsIndexPage() {
  const params = useParams();
  const cardId = params.id as string;
  const router = useRouter();
  const { cards } = useCreditCards();
  const { mappings } = useTagMappings(cardId);

  const card = useMemo(() => cards.find(c => c.id === cardId), [cards, cardId]);
  if (!card) return null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/cards/${cardId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Card
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tag Mappings</CardTitle>
            <CardDescription>Map YNAB flags/tags to reward categories for {card.name}</CardDescription>
          </div>
          <Button asChild>
            <Link href={`/cards/${cardId}/mappings/new`}>
              <Plus className="h-4 w-4 mr-2" />
              New Mapping
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {mappings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-3">No mappings yet</p>
              <p className="text-sm">Create your first mapping to start categorising transactions.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mappings.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{m.ynabTag}</Badge>
                    <span className="text-sm text-muted-foreground">→</span>
                    <span className="font-medium">{m.rewardCategory}</span>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/cards/${cardId}/mappings/${m.id}/edit`}>Edit</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

