'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ScanResults } from '@/components/repository/ScanResults';
import { Button } from '@/components/ui/button';
import { getProduct, getProductScans } from '@/lib/api';
import type { ProductHistoryResponse, ProductSummary } from '@/lib/types';

export default function ProductHistoryPage() {
  const params = useParams<{ id: string }>();
  const productId = decodeURIComponent(params.id);
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [history, setHistory] = useState<ProductHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getProduct(productId), getProductScans(productId)])
      .then(([summary, scans]) => {
        if (!active) return;
        setProduct(summary);
        setHistory(scans);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Product history could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [productId]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-[#EBE5DB] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-terracotta">Product history</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-kinetic-charcoal">{product?.common_name || product?.manufacturer || `Product ${productId}`}</h1>
          <p className="mt-1 text-sm text-kinetic-textMuted">Aggregate inspection history for this product identity.</p>
        </div>
        <Button asChild variant="outline" className="font-mono text-xs">
          <Link href="/history">Back to repository</Link>
        </Button>
      </header>

      {error ? <div role="alert" className="rounded-kinetic border border-kinetic-fail/30 bg-kinetic-failLight p-4 text-xs font-mono text-kinetic-fail">{error}</div> : null}
      {!history && !error ? <p role="status" className="text-xs font-mono text-kinetic-textMuted">Loading product history…</p> : null}

      {product ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Product ID', product.id],
            ['Manufacturer', product.manufacturer],
            ['Quantity', [product.quantity, product.unit].filter(Boolean).join(' ')],
            ['Category', product.category],
            ['Scans', product.scan_count],
          ].map(([label, value]) => (
            <div key={label} className="rounded-kinetic border border-[#EBE5DB] bg-white p-4 shadow-sm">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-kinetic-textMuted">{label}</dt>
              <dd className="mt-1 truncate font-display text-sm font-semibold capitalize text-kinetic-charcoal">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {history ? <ScanResults rows={history.items} returnQuery="" /> : null}
    </div>
  );
}
