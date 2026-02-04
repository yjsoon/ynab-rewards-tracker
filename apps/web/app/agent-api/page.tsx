import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AgentApiPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Agent API</h1>
        <p className="text-muted-foreground">
          A single endpoint for cards and current-period reward status, designed for agents and
          automations. The API pulls your encrypted cloud sync backup, decrypts it in memory, and
          recomputes rewards with your YNAB PAT. Nothing is stored server-side.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Quick start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              1. In Settings, enable Cloud Sync and keep the 12-word code.
            </p>
            <p>
              2. Create or copy a YNAB Personal Access Token.
            </p>
            <p>
              3. Call <span className="font-mono text-foreground">/api/agent/rewards</span> with both values.
            </p>
            <p className="text-xs">
              Tip: amounts are returned in dollars, not milliunits. Add transactions to get card
              recommendations for specific purchases.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Security model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Cloud Sync stores only encrypted data. This API decrypts the payload in memory and
              discards it after the response is sent.
            </p>
            <p>
              Your PAT and sync code are never stored. Each call is self-contained and stateless.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <span className="font-mono text-foreground">POST /api/agent/rewards</span>
            </p>
            <p>
              Send JSON in the body. Headers are optional if you prefer to keep secrets out of the
              payload.
            </p>
          </div>

          <div className="space-y-3">
            <pre className="rounded-lg bg-muted px-4 py-3 text-sm overflow-x-auto">
              <code>{`curl -X POST https://your-domain.example/api/agent/rewards \\
  -H "Content-Type: application/json" \\
  -d '{
    "pat": "<YNAB_PAT>",
    "syncCode": "twelve word cloud sync phrase",
    "includeBreakdowns": false
  }'`}</code>
            </pre>
            <pre className="rounded-lg bg-muted px-4 py-3 text-sm overflow-x-auto">
              <code>{`curl -X POST https://your-domain.example/api/agent/rewards \\
  -H "Content-Type: application/json" \\
  -d '{
    "pat": "<YNAB_PAT>",
    "syncCode": "twelve word cloud sync phrase",
    "include": ["cards", "signals", "advice"],
    "cardsView": "limits",
    "transactions": [
      { "id": "txn-1", "amount": 82.5, "themeGroupName": "Groceries" },
      { "id": "txn-2", "amount": 120, "flagColor": "blue" }
    ]
  }'`}</code>
            </pre>
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Optional headers</p>
            <p>
              <span className="font-mono text-foreground">Authorization: Bearer &lt;YNAB_PAT&gt;</span>
            </p>
            <p>
              <span className="font-mono text-foreground">X-Cloud-Sync-Code: &lt;sync code&gt;</span>
            </p>
            <p>
              <span className="font-mono text-foreground">X-YNAB-PAT: &lt;YNAB_PAT&gt;</span>
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            <div>
              <p className="font-medium">pat</p>
              <p className="text-muted-foreground">Required. Your YNAB Personal Access Token.</p>
            </div>
            <div>
              <p className="font-medium">syncCode</p>
              <p className="text-muted-foreground">
                Required. The 12-word Cloud Sync code that decrypts your backup.
              </p>
            </div>
            <div>
              <p className="font-medium">budgetId</p>
              <p className="text-muted-foreground">
                Optional. Overrides the budget stored in your Cloud Sync backup.
              </p>
            </div>
            <div>
              <p className="font-medium">includeBreakdowns</p>
              <p className="text-muted-foreground">
                Optional. Include category and subcategory breakdowns on each rule.
              </p>
            </div>
            <div>
              <p className="font-medium">cardIds</p>
              <p className="text-muted-foreground">
                Optional. Restrict the response to specific card IDs.
              </p>
            </div>
            <div>
              <p className="font-medium">include</p>
              <p className="text-muted-foreground">
                Optional. Limit sections in the response. Supported values:
                <span className="font-mono text-foreground">cards</span>,{' '}
                <span className="font-mono text-foreground">signals</span>,{' '}
                <span className="font-mono text-foreground">categories</span>,{' '}
                <span className="font-mono text-foreground">advice</span>,{' '}
                <span className="font-mono text-foreground">alerts</span>. Defaults to all.
              </p>
            </div>
            <div>
              <p className="font-medium">cardsView</p>
              <p className="text-muted-foreground">
                Optional. Use <span className="font-mono text-foreground">limits</span> for a slim
                card payload (only limits and status) or <span className="font-mono text-foreground">full</span> for detailed spend
                and rule breakdowns. Defaults to <span className="font-mono text-foreground">full</span>.
              </p>
            </div>
            <div>
              <p className="font-medium">transactions</p>
              <p className="text-muted-foreground">
                Optional. Provide an array of transactions to get a ranked card recommendation per
                transaction. Use either <span className="font-mono text-foreground">themeGroupId</span>/
                <span className="font-mono text-foreground">themeGroupName</span> or{' '}
                <span className="font-mono text-foreground">flagColor</span> for each entry.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              The response includes a top-level summary plus per-card reward status. Each card
              contains a status summary and a per-rule breakdown.
            </p>
            <p>
              Category recommendations are generated from your theme groups, and transaction advice
              is returned only when you send <span className="font-mono text-foreground">transactions</span>.
            </p>
            <p>
              Use <span className="font-mono text-foreground">include</span> and{' '}
              <span className="font-mono text-foreground">cardsView</span> to reduce response size
              for agent queries.
            </p>
          </div>

          <pre className="rounded-lg bg-muted px-4 py-3 text-sm overflow-x-auto">
            <code>{`{
  "meta": {
    "generatedAt": "2026-02-03T10:12:00.000Z",
    "budgetId": "...",
    "budgetName": "Household",
    "calculationSource": "fresh",
    "cloudSyncUpdatedAt": "2026-02-03T09:59:12.000Z",
    "cardsCount": 4,
    "rulesCount": 7
  },
  "settings": {
    "currency": "USD",
    "milesValuation": 0.01
  },
  "signals": {
    "minimumSpendNeeded": [
      { "cardId": "card-2", "cardName": "Travel Miles", "remaining": 120.5, "scope": "card" }
    ],
    "maximumSpendHeadroom": [
      { "cardId": "card-1", "cardName": "Everyday Cashback", "remaining": 250, "cap": 1500, "progress": 83.3 }
    ],
    "maximumSpendReached": []
  },
  "cards": [
    {
      "id": "card-1",
      "name": "Everyday Cashback",
      "issuer": "Example Bank",
      "type": "cashback",
      "status": {
        "available": true,
        "period": "2026-02",
        "spend": {
          "total": 812.34,
          "eligible": 812.34,
          "eligibleBeforeBlocks": 812.34,
          "rewardEarned": 24.37,
          "rewardEarnedDollars": 24.37,
          "rewardType": "cashback"
        },
        "limits": {
          "minimum": { "target": null, "remaining": null, "progress": null, "met": null },
          "maximum": { "cap": 1500, "remaining": 687.66, "progress": 54.2, "exceeded": false },
          "shouldStopUsing": false
        },
        "rules": [
          {
            "ruleId": "rule-1",
            "ruleName": "Base rate",
            "period": "2026-02",
            "rewardType": "cashback",
            "totalSpend": 812.34,
            "eligibleSpend": 812.34,
            "minimumTarget": null,
            "minimumRemaining": null,
            "maximumCap": null,
            "maximumRemaining": null
          }
        ]
      },
      "recommendation": {
        "cardId": "card-1",
        "cardName": "Everyday Cashback",
        "reason": "Good reward rate (3.0%)",
        "priority": "medium",
        "action": "use"
      }
    }
  ],
  "transactionAdvice": [
    {
      "id": "txn-1",
      "amount": 82.5,
      "method": "theme_group",
      "group": { "id": "group-1", "name": "Groceries" },
      "recommended": {
        "cardId": "card-1",
        "cardName": "Everyday Cashback",
        "status": "use",
        "rewardRate": 0.03,
        "reasons": ["Reward rate 3.00%", "687.66 dollars headroom to max"]
      },
      "ranked": []
    }
  ],
  "categories": [],
  "alerts": []
}`}</code>
          </pre>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>
              Status reasons when no calculations are available: <span className="font-mono text-foreground">missing_ynab_account</span>,
              <span className="font-mono text-foreground">no_active_rules</span>, or <span className="font-mono text-foreground">no_calculations</span>.
            </p>
            <p>
              Common errors: 401 for an invalid PAT or sync code, 404 if no cloud backup exists, and 429 when YNAB rate limits.
            </p>
            <p>
              Transaction advice errors: <span className="font-mono text-foreground">invalid_amount</span>, <span className="font-mono text-foreground">theme_group_not_found</span>, or <span className="font-mono text-foreground">missing_theme_group_or_flag_color</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
