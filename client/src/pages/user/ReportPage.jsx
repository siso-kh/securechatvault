import { useEffect, useMemo, useState } from 'react';
import Tabs from '../../components/common/Tabs';
import ReportRow from '../../components/report/ReportRow';
import { getMyReport } from '../../services/stats';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'masked', label: 'Masked' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'warned', label: 'Warned' },
];

export default function ReportPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getMyReport().then(setData).catch(() => setError('Could not load your report.'));
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.items : data.items.filter((i) => i.status === filter);
  }, [data, filter]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl">Report</h1>

      {data && (
        <p className="mt-1 text-xs text-muted">
          {data.totals.messagesSent} messages sent, {data.totals.protectedCount} protected by redaction.
        </p>
      )}

      <div className="mt-5">
        <Tabs tabs={TABS} value={filter} onChange={setFilter} />
      </div>

      {error && <p role="alert" className="mt-4 text-xs text-danger">{error}</p>}

      <div className="mt-6 rounded-lg border border-line bg-bg/90 px-5 py-2">
        {!data && !error && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
        {data && items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            {filter === 'all'
              ? 'Nothing detected yet. Detections appear here after you send a message.'
              : 'No messages in this category.'}
          </p>
        )}
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <ReportRow key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </div>
  );
}