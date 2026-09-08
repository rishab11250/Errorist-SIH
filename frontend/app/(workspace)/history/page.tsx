'use client';

import { useEffect, useState } from 'react';

import { ScanHistoryTable, type HistoryRow } from '@/components/ScanHistoryTable';
import { getHistory } from '@/lib/api';

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getHistory(50)
      .then((items) => setRows(items as HistoryRow[]))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'unknown'));
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-h1">Inspection repository</h1>
      {error ? <div role="alert" className="text-fail">{error}</div> : null}
      {!rows && !error ? <p role="status">Loading inspections…</p> : null}
      {rows ? <ScanHistoryTable rows={rows} /> : null}
    </div>
  );
}
