'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Download, Trash2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { StatementFormatterTransaction } from '@/types/statement-formatter';

interface TransactionTableProps {
  transactions: StatementFormatterTransaction[];
  onChange?: (transactions: StatementFormatterTransaction[]) => void;
  onDownload?: (transactions: StatementFormatterTransaction[]) => void;
}

export function TransactionTable({ transactions, onChange, onDownload }: TransactionTableProps) {
  const [rows, setRows] = useState<StatementFormatterTransaction[]>(transactions);

  useEffect(() => {
    setRows(transactions);
  }, [transactions]);

  const handleEdit = (index: number, field: keyof StatementFormatterTransaction, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      onChange?.(copy);
      return copy;
    });
  };

  const handleRemove = (index: number) => {
    setRows((prev) => {
      const copy = prev.filter((_, idx) => idx !== index);
      onChange?.(copy);
      return copy;
    });
  };

  const handleDownload = () => {
    const csv = Papa.unparse({
      fields: ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'],
      data: rows.map((row) => [row.date || '', row.payee || '', row.memo || '', row.outflow || '', row.inflow || '']),
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `statement_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    onDownload?.(rows);
  };

  const totalTransactions = rows.length;

  return (
    <Card className="bg-gradient-to-br from-card via-card to-primary/5 border-primary/20">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Extracted transactions</CardTitle>
            <CardDescription>Review and edit before exporting to YNAB</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="rounded-md bg-secondary/40 px-3 py-1 font-semibold">
              {totalTransactions} {totalTransactions === 1 ? 'transaction' : 'transactions'}
            </div>
            <Button onClick={handleDownload} disabled={rows.length === 0} className="cursor-pointer">
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-y">
              <tr>
                {['Date', 'Payee', 'Memo', 'Outflow', 'Inflow', ''].map((header) => (
                  <th
                    key={header || 'actions'}
                    className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider ${
                      header === 'Outflow' || header === 'Inflow' ? 'text-right' : ''
                    }`}
                    style={{ minWidth: header ? '140px' : '48px' }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, index) => (
                <tr key={`txn-${index}`} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.date}
                      onChange={(event) => handleEdit(index, 'date', event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.payee}
                      onChange={(event) => handleEdit(index, 'payee', event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.memo}
                      onChange={(event) => handleEdit(index, 'memo', event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      value={row.outflow}
                      onChange={(event) => handleEdit(index, 'outflow', event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      value={row.inflow}
                      onChange={(event) => handleEdit(index, 'inflow', event.target.value)}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => handleRemove(index)}
                      aria-label="Delete row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-6 py-12 text-center text-muted-foreground">No transactions to display yet</div>
        )}
      </CardContent>
      {rows.length > 0 && (
        <div className="border-t p-4">
          <Alert>
            <AlertDescription className="text-sm">
              Tip: click any cell to edit, delete rows you do not need, then download the CSV — every edit is included in the export.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </Card>
  );
}
