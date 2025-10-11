import type {
  MutableCalculation,
  MutableCard,
  MutableCategoryBreakdown,
  MutableRule,
  MutableSettings,
  MutableStorageData,
} from './internal-types';
import type { CategoryBreakdown, CreditCard, RewardRule, StorageData } from './types';

export function applyStorageMigrations(data: MutableStorageData): void {
  try {
    if (Array.isArray(data.calculations)) {
      data.calculations = data.calculations.map((calc) => {
        const mutableCalc: MutableCalculation = { ...calc } as MutableCalculation;

        if ('rewardEarnedUSD' in mutableCalc && mutableCalc.rewardEarnedDollars == null) {
          mutableCalc.rewardEarnedDollars = Number(mutableCalc.rewardEarnedUSD ?? 0);
          Reflect.deleteProperty(mutableCalc, 'rewardEarnedUSD');
        }

        const calcType = mutableCalc.rewardType as string | undefined;
        if (calcType === 'points') {
          mutableCalc.rewardType = 'miles';
        }

        if (Array.isArray(mutableCalc.categoryBreakdowns)) {
          mutableCalc.categoryBreakdowns = mutableCalc.categoryBreakdowns.map((cb) => {
            const mutableBreakdown: MutableCategoryBreakdown = { ...cb } as MutableCategoryBreakdown;
            if ('rewardUSD' in mutableBreakdown && mutableBreakdown.rewardDollars == null) {
              mutableBreakdown.rewardDollars = Number(mutableBreakdown.rewardUSD ?? 0);
              Reflect.deleteProperty(mutableBreakdown, 'rewardUSD');
            }
            return mutableBreakdown as CategoryBreakdown;
          });
        }

        return mutableCalc as StorageData['calculations'][number];
      });
    }

    if (Array.isArray(data.cards)) {
      data.cards = data.cards.map((card) => {
        const mutableCard: MutableCard = { ...card } as MutableCard;
        const cardType = mutableCard.type as string | undefined;
        if (cardType === 'points') {
          mutableCard.type = 'miles';
        }
        if ('milesBlockSize' in mutableCard) {
          const { milesBlockSize, ...cleanCard } = mutableCard;
          return cleanCard as CreditCard;
        }
        return mutableCard as CreditCard;
      });
    }

    if (Array.isArray(data.rules)) {
      data.rules = data.rules.map((rule) => {
        const mutableRule: MutableRule = { ...rule } as MutableRule;
        const rewardType = mutableRule.rewardType as string | undefined;
        if (rewardType === 'points') {
          mutableRule.rewardType = 'miles';
        }
        if ('milesBlockSize' in mutableRule) {
          const { milesBlockSize, ...cleanRule } = mutableRule;
          return cleanRule as RewardRule;
        }
        return mutableRule as RewardRule;
      });
    }

    if (data.settings) {
      const settings = data.settings as MutableSettings;
      const mv = settings.milesValuation;
      const pv = settings.pointsValuation;
      if ((mv == null || typeof mv !== 'number') && typeof pv === 'number') {
        settings.milesValuation = pv;
      }
      if ('pointsValuation' in settings) {
        Reflect.deleteProperty(settings, 'pointsValuation');
      }
    }

    if (Array.isArray(data.cards)) {
      data.cards = data.cards.map((card) => {
        const mutableCard: MutableCard = { ...card } as MutableCard;
        if (!mutableCard.earningRate) {
          const cardRules = Array.isArray(data.rules)
            ? data.rules.filter((rule) => rule.cardId === mutableCard.id && rule.active)
            : [];
          if (cardRules.length > 0) {
            const firstRule = cardRules[0];
            mutableCard.earningRate = firstRule.rewardValue || 1;
          } else {
            mutableCard.earningRate = 1;
          }
        }
        if (!('minimumSpend' in mutableCard)) {
          mutableCard.minimumSpend = null;
        }
        if (!('maximumSpend' in mutableCard)) {
          mutableCard.maximumSpend = null;
        }
        if (!('earningBlockSize' in mutableCard)) {
          mutableCard.earningBlockSize = null;
        }
        return mutableCard as CreditCard;
      });
    }

    if (!data.tagMappings) {
      data.tagMappings = [];
    }

    if (!Array.isArray(data.hiddenCards)) {
      data.hiddenCards = [];
    }

    if (!Array.isArray(data.themeGroups)) {
      const legacyGroups = (data as { categoryGroups?: unknown }).categoryGroups;
      data.themeGroups = Array.isArray(legacyGroups) ? (legacyGroups as StorageData['themeGroups']) : [];
      if (legacyGroups) {
        Reflect.deleteProperty(data as unknown as Record<string, unknown>, 'categoryGroups');
      }
    }
  } catch (migrationError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Storage migration failed', migrationError);
    }
  }
}