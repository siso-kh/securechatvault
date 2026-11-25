import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Tag from '../common/Tag';
import StatusDot from '../common/StatusDot';
import { formatDate } from '../../utils/formatDate';

const STATUS = {
  masked: { label: 'Masked', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'danger' },
  warned: { label: 'Warned', tone: 'muted' },
};

const describe = (item) => {
  if (item.status === 'masked') {
    const n = item.maskedCount;
    return `${n} ${n === 1 ? 'item' : 'items'} replaced before sending. The model saw placeholders only.`;
  }
  if (item.status === 'blocked') return 'Message not sent. A rule blocks this data.';
  return 'Sent as written. The rule only warns.';
};

export default function ReportRow({ item }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[item.status];

  return (
    <li className="border-t border-line first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[96px_1fr_auto] items-start gap-x-4 gap-y-1 border-0 bg-transparent px-1 py-4 text-left text-sm sm:grid-cols-[110px_1fr_90px_auto]"
      >
        <span className="text-xs text-faint">{formatDate(item.createdAt)}</span>
        <span className="truncate text-ink">{item.title}</span>
        <span className="hidden sm:block">
          <StatusDot tone={status.tone}>{status.label}</StatusDot>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {item.categories.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
          <ChevronDown
            size={14}
            className={`ml-1 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
        <span className="col-start-2 col-end-[-1] text-xs text-muted">{describe(item)}</span>
      </button>

      {open && (
        <dl className="m-0 grid grid-cols-[80px_1fr] gap-x-4 gap-y-1 pb-4 pl-[112px] text-xs text-muted max-sm:pl-1">
          <dt>Status</dt>
          <dd className="m-0 text-ink">{status.label}</dd>
          <dt>Categories</dt>
          <dd className="m-0 text-ink">{item.categories.join(', ') || 'None'}</dd>
          {item.ruleName && (
            <>
              <dt>Rule</dt>
              <dd className="m-0 text-ink">{item.ruleName}</dd>
            </>
          )}
          {item.severity && (
            <>
              <dt>Severity</dt>
              <dd className="m-0 text-ink capitalize">{item.severity}</dd>
            </>
          )}
          <dt className="col-span-2 mt-1 text-faint">The original value is never stored.</dt>
        </dl>
      )}
    </li>
  );
}