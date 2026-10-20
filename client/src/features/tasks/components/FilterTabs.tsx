import type { StatusFilter } from '@todo/contracts';
import { cx } from '@/shared/lib/classes';

interface FilterTabsProps {
  value: StatusFilter;
  counts?: Record<StatusFilter, number>;
  onChange: (status: StatusFilter) => void;
}

const TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Done' },
];

export const FilterTabs = ({ value, counts, onChange }: FilterTabsProps) => (
  <div className="tabs" role="tablist" aria-label="Filter tasks">
    {TABS.map((tab) => (
      <button
        key={tab.value}
        type="button"
        role="tab"
        aria-selected={value === tab.value}
        tabIndex={value === tab.value ? 0 : -1}
        onKeyDown={(event) => {
          const index = TABS.findIndex((item) => item.value === value);
          const next =
            event.key === 'ArrowRight'
              ? (index + 1) % TABS.length
              : event.key === 'ArrowLeft'
                ? (index + TABS.length - 1) % TABS.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? TABS.length - 1
                    : null;
          if (next === null) return;
          event.preventDefault();
          onChange(TABS[next]!.value);
          const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
          buttons?.[next]?.focus();
        }}
        className={cx('tabs__tab', value === tab.value && 'is-active')}
        onClick={() => onChange(tab.value)}
      >
        {tab.label}
        <span className="tabs__count" aria-label={counts ? undefined : 'Count unavailable'}>
          {counts?.[tab.value] ?? '—'}
        </span>
      </button>
    ))}
  </div>
);
