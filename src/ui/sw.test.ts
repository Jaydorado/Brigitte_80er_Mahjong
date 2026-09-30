import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => () => Promise.resolve() }));

import { createUpdatePolicy } from './sw';

describe('update policy', () => {
  it('applies a waiting update at once when the map or welcome is showing', () => {
    const apply = vi.fn();
    const p = createUpdatePolicy(() => true, apply);
    p.needRefresh();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('never applies during a level, but does on the first safe navigation', () => {
    let safe = false;
    const apply = vi.fn();
    const p = createUpdatePolicy(() => safe, apply);
    p.needRefresh();
    p.navigated();
    expect(apply).not.toHaveBeenCalled();
    safe = true;
    p.navigated();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('applies only once even if more navigations follow', () => {
    const apply = vi.fn();
    const p = createUpdatePolicy(() => true, apply);
    p.needRefresh();
    p.navigated();
    p.navigated();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does nothing on navigation while no update is waiting', () => {
    const apply = vi.fn();
    const p = createUpdatePolicy(() => true, apply);
    p.navigated();
    expect(apply).not.toHaveBeenCalled();
  });
});
