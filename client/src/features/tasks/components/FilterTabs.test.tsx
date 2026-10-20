import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { StatusFilter } from '@todo/contracts';
import { FilterTabs } from './FilterTabs';

const Example = () => {
  const [value, setValue] = useState<StatusFilter>('all');
  return (
    <FilterTabs value={value} counts={{ all: 3, active: 2, completed: 1 }} onChange={setValue} />
  );
};

describe('filter keyboard navigation', () => {
  it('supports arrows, wrapping, Home and End', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus();
    await user.keyboard('[ArrowRight]');
    expect(screen.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('[End]');
    expect(screen.getByRole('tab', { name: /Done/ })).toHaveFocus();
    await user.keyboard('[ArrowRight]');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus();
    await user.keyboard('[ArrowLeft]');
    expect(screen.getByRole('tab', { name: /Done/ })).toHaveFocus();
    await user.keyboard('[Home]');
    await user.keyboard('a');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
  });
});
