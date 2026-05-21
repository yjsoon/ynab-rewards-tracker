/**
 * Real-time recommendations engine
 * Calculates optimal card choices without requiring pre-computation
 */

import type {
  CreditCard,
  ThemeGroup,
  AppSettings,
} from '@/lib/storage';
import type { Transaction } from '@/types/transaction';
import { SimpleRewardsCalculator } from '@/lib/rewards-engine';
import {
  createSubcategoryContext,
  normaliseFlagColor,
  resolveSubcategory,
} from '@/lib/rewards-engine/utils/subcategories';

export interface SubcategoryProgress {
  subcategoryId: string;
  subcategoryName: string;
  currentSpend: number;
  maximumSpend?: number | null;
  progress: number; // 0-100%
  isMaxed: boolean;
}

export interface CardOption {
  cardId: string;
  cardName: string;
  cardType: 'cashback' | 'miles';
  effectiveRate: number; // Normalized to dollars
  earningRate?: number; // Raw earning rate (% for cashback, miles per dollar for miles)
  currentSpend: number;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  minimumProgress: number; // 0-100%
  maximumProgress: number; // 0-100%
  headroom: number | null; // How much more can be spent
  score: number; // Combined score for ranking
  recommendation: 'use' | 'consider' | 'avoid';
  reasons: string[];
  subcategoryProgress?: SubcategoryProgress[]; // Progress for linked subcategories
}

export interface ThemeRecommendation {
  themeId: string;
  themeName: string;
  themeDescription?: string;
  bestCard: CardOption | null;
  alternatives: CardOption[];
  notRecommended: CardOption[];
  noDataReason?: string;
}

interface CardSpendingSummary {
  cardId: string;
  totalSpend: number;
  subcategorySpends: Map<string, number>;
}

export class RealTimeRecommendations {
  private milesValuation: number;

  constructor(settings?: AppSettings) {
    this.milesValuation = settings?.milesValuation ?? 0.01;
  }

  /**
   * Generate recommendations for all themes
   */
  generateRecommendations(
    themes: ThemeGroup[],
    cards: CreditCard[],
    transactions: Transaction[]
  ): ThemeRecommendation[] {
    if (!themes || themes.length === 0) {
      return [];
    }

    // Calculate current spending for each card
    const spendingSummaries = this.calculateSpending(cards, transactions);
    const cardsById = new Map(cards.map((card) => [card.id, card]));

    return themes.map(theme => this.recommendForTheme(
      theme,
      cardsById,
      spendingSummaries
    ));
  }

  /**
   * Calculate current period spending for each card
   */
  private calculateSpending(
    cards: CreditCard[],
    transactions: Transaction[]
  ): Map<string, CardSpendingSummary> {
    const summaries = new Map<string, CardSpendingSummary>();
    const cardsByAccountId = new Map<string, CreditCard>();
    const subcategoryContexts = new Map<
      string,
      ReturnType<typeof createSubcategoryContext>
    >();

    // Initialize summaries for each card
    cards.forEach((card) => {
      summaries.set(card.id, {
        cardId: card.id,
        totalSpend: 0,
        subcategorySpends: new Map(),
      });
      cardsByAccountId.set(card.ynabAccountId, card);
      subcategoryContexts.set(card.id, createSubcategoryContext(card));
    });

    // Process transactions for current period
    transactions.forEach((txn) => {
      const card = cardsByAccountId.get(txn.account_id);
      if (!card) return;
      if (txn.amount >= 0) return;

      const txnDate = new Date(txn.date);
      if (!this.isInCurrentPeriod(txnDate, card)) {
        return;
      }

      const amount = Math.abs(txn.amount / 1000);
      const summary = summaries.get(card.id);
      if (!summary) return;

      const subcategoryContext = subcategoryContexts.get(card.id);
      const matchedSubcategory = subcategoryContext
        ? resolveSubcategory(subcategoryContext, normaliseFlagColor(txn.flag_color))
        : undefined;
      if (matchedSubcategory) {
        if (matchedSubcategory?.excludeFromRewards) {
          return; // Skip excluded subcategory transactions entirely
        }
      }

      summary.totalSpend += amount;

      if (matchedSubcategory) {
        const current = summary.subcategorySpends.get(matchedSubcategory.id) || 0;
        summary.subcategorySpends.set(matchedSubcategory.id, current + amount);
      }
    });

    return summaries;
  }

  /**
   * Check if transaction is in current billing period
   * Uses the same period calculation as CardSpendingSummary for consistency
   */
  private isInCurrentPeriod(
    txnDate: Date,
    card: CreditCard
  ): boolean {
    const period = SimpleRewardsCalculator.calculatePeriod(card);
    const periodStart = new Date(period.start);
    const periodEnd = new Date(period.end + 'T23:59:59.999Z');

    return txnDate >= periodStart && txnDate <= periodEnd;
  }

  /**
   * Generate recommendation for a specific theme
   */
  private recommendForTheme(
    theme: ThemeGroup,
    cardsById: Map<string, CreditCard>,
    spendingSummaries: Map<string, CardSpendingSummary>
  ): ThemeRecommendation {
    const cardOptions: CardOption[] = [];

    // Process each card that's linked to this theme
    const linkedCardIds = new Set<string>();

    // Cards with specific subcategories linked
    theme.subcategories.forEach(ref => {
      if (ref?.cardId) linkedCardIds.add(ref.cardId);
    });

    // Whole cards linked
    (theme.cards || []).forEach(ref => {
      if (ref?.cardId) linkedCardIds.add(ref.cardId);
    });

    linkedCardIds.forEach(cardId => {
      const card = cardsById.get(cardId);
      if (!card) return;

      const option = this.evaluateCard(
        card,
        theme,
        spendingSummaries.get(cardId)
      );

      if (option) {
        cardOptions.push(option);
      }
    });

    // Sort by score, but prioritize minimum spend needs with higher rates
    cardOptions.sort((a, b) => {
      const aMinNeed = a.minimumSpend && a.minimumProgress < 100;
      const bMinNeed = b.minimumSpend && b.minimumProgress < 100;

      // Both need minimum - sort by rate
      if (aMinNeed && bMinNeed) {
        return b.effectiveRate - a.effectiveRate;
      }

      // One needs minimum - it goes first
      if (aMinNeed && !bMinNeed) return -1;
      if (!aMinNeed && bMinNeed) return 1;

      // Neither needs minimum - sort by score
      return b.score - a.score;
    });

    // Split into recommended and not recommended
    const recommendedCards = cardOptions.filter(c => c.recommendation !== 'avoid');
    const notRecommendedCards = cardOptions.filter(c => c.recommendation === 'avoid');

    return {
      themeId: theme.id,
      themeName: theme.name,
      themeDescription: theme.description,
      bestCard: recommendedCards[0] || null,
      alternatives: recommendedCards.slice(1),
      notRecommended: notRecommendedCards,
      noDataReason: cardOptions.length === 0
        ? 'No active cards linked to this theme'
        : undefined,
    };
  }

  /**
   * Evaluate a card for a theme
   */
  private evaluateCard(
    card: CreditCard,
    theme: ThemeGroup,
    spending?: CardSpendingSummary
  ): CardOption | null {
    const currentSpend = spending?.totalSpend || 0;
    const reasons: string[] = [];
    const subcategoryProgress: SubcategoryProgress[] = [];

    // Check if this card is linked via specific subcategories to this theme
    const linkedSubs = theme.subcategories.filter(ref => ref?.cardId === card.id);
    const maxedSubcategoryIds = new Set<string>();
    let eligibleLinkedSubcategoryCount = 0;

    // If linked via subcategory, check if those specific subcategories are maxed
    if (linkedSubs.length > 0 && card.subcategoriesEnabled && card.subcategories) {
      for (const ref of linkedSubs) {
        const sub = card.subcategories.find(s => s.id === ref.subcategoryId);
        if (sub && sub.active && !sub.excludeFromRewards) {
          eligibleLinkedSubcategoryCount++;
          const subSpend = spending?.subcategorySpends.get(sub.id) || 0;
          const isMaxed = sub.maximumSpend ? subSpend >= sub.maximumSpend : false;
          const progress = sub.maximumSpend ? Math.min(100, (subSpend / sub.maximumSpend) * 100) : 0;

          // Add subcategory progress info
          subcategoryProgress.push({
            subcategoryId: sub.id,
            subcategoryName: sub.name,
            currentSpend: subSpend,
            maximumSpend: sub.maximumSpend,
            progress,
            isMaxed
          });

          if (isMaxed) {
            maxedSubcategoryIds.add(sub.id);
            reasons.push(`${sub.name} subcategory limit reached`);
          }
        }
      }
    }

    // Calculate effective rate for this theme
    let effectiveRate = 0;

    // Check if whole card is linked
    const wholeCardLinked = (theme.cards || []).some(ref => ref?.cardId === card.id);

    if (wholeCardLinked) {
      // For whole card, just use base rate - we'll check subcategory limits later
      if (card.type === 'cashback') {
        effectiveRate = (card.earningRate ?? 1) / 100;
      } else {
        const milesPerDollar = card.earningRate ?? 1;
        effectiveRate = milesPerDollar * this.milesValuation;
      }
    } else if (linkedSubs.length > 0 && card.subcategoriesEnabled && card.subcategories) {
      // Calculate weighted average rate for linked subcategories (already checked if maxed above)
      let totalRate = 0;
      let count = 0;

      linkedSubs.forEach(ref => {
        const sub = card.subcategories?.find(s => s.id === ref.subcategoryId);
        if (sub && sub.active && !sub.excludeFromRewards && !maxedSubcategoryIds.has(sub.id)) {
          const subRate = card.type === 'cashback'
            ? sub.rewardValue / 100
            : sub.rewardValue * this.milesValuation;
          totalRate += subRate;
          count++;
        }
      });

      if (count > 0) {
        effectiveRate = totalRate / count;
      }
    }

    // If no subcategories but the card is linked, use base rate as fallback
    // BUT not if every linked subcategory is maxed!
    const subcategoryMaxed = eligibleLinkedSubcategoryCount > 0
      && maxedSubcategoryIds.size >= eligibleLinkedSubcategoryCount;
    if (!subcategoryMaxed && effectiveRate === 0 && (wholeCardLinked || theme.subcategories.some(ref => ref?.cardId === card.id))) {
      if (card.type === 'cashback') {
        effectiveRate = (card.earningRate ?? 1) / 100;
      } else {
        const milesPerDollar = card.earningRate ?? 1;
        effectiveRate = milesPerDollar * this.milesValuation;
      }
    }

    // Calculate progress towards limits
    const minimumProgress = card.minimumSpend
      ? Math.min(100, (currentSpend / card.minimumSpend) * 100)
      : 100;

    const maximumProgress = card.maximumSpend
      ? Math.min(100, (currentSpend / card.maximumSpend) * 100)
      : 0;

    const headroom = card.maximumSpend
      ? Math.max(0, card.maximumSpend - currentSpend)
      : null;

    // Calculate score with heavy emphasis on minimum spend
    const baseScore = effectiveRate * 1000; // Base score from rate (assuming max 10% rate)
    let score = baseScore;

    // PRIORITY 1: Cards that haven't met minimum spend get massive boost
    const needsMinimum = card.minimumSpend && minimumProgress < 100;
    if (needsMinimum) {
      // Add up to 300 points based on how far from minimum (more urgent = higher score)
      score += (100 - minimumProgress) * 3;
      reasons.push(`${(100 - minimumProgress).toFixed(0)}% to minimum spend`);
    } else if (card.minimumSpend && minimumProgress >= 100) {
      // Minimum met - just note it
      reasons.push('Minimum spend met');
    }

    // PRIORITY 2: Penalize for approaching maximum (but less if minimum not met)
    if (card.maximumSpend) {
      if (maximumProgress >= 100) {
        score = 0; // Avoid completely
        reasons.push('Maximum spend reached');
      } else if (maximumProgress > 80) {
        // If minimum not met, reduce penalty for approaching max
        const penaltyFactor = needsMinimum ? 0.3 : 0.7;
        score *= (1 - (maximumProgress - 80) / 20 * penaltyFactor);
        reasons.push(`${maximumProgress.toFixed(0)}% of maximum used`);
      }
    }

    // Add reward rate to reasons if it's good
    if (effectiveRate > 0.02) {
      reasons.push(`${(effectiveRate * 100).toFixed(1)}% reward rate`);
    }

    // Already checked earlier, no need to recheck

    // Determine recommendation
    let recommendation: 'use' | 'consider' | 'avoid';
    if (score === 0 || (card.maximumSpend && currentSpend >= card.maximumSpend) || subcategoryMaxed) {
      recommendation = 'avoid';
    } else if (card.minimumSpend && minimumProgress < 100) {
      // Always recommend cards that need minimum spend
      recommendation = 'use';
    } else if (score > 30) {
      recommendation = 'use';
    } else {
      recommendation = 'consider';
    }

    return {
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      effectiveRate,
      earningRate: card.earningRate,
      currentSpend,
      minimumSpend: card.minimumSpend,
      maximumSpend: card.maximumSpend,
      minimumProgress,
      maximumProgress,
      headroom,
      score,
      recommendation,
      reasons,
      subcategoryProgress: subcategoryProgress.length > 0 ? subcategoryProgress : undefined,
    };
  }
}
