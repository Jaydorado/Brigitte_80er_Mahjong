/**
 * The closing screen: the ambient fireworks loop, and the riddle with the effects, the art and the
 * DOM faked out (no DOM in this test run): the wrong-answer flow, the save before the burst, the
 * photo's decode-and-1-s gate, reduced motion, unmount cancellation, later visits, and system Back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reveal } from '../content';
import { freshSave, markWon, type SaveV1 } from '../progress/save';
import { createShowLoop, mountClosing, settleClosingHistory } from './closing'; // vi.mock calls below are hoisted above this import

const h = vi.hoisted(() => {
  type Listener = (ev: Record<string, unknown>) => void;

  class FakeEl {
    parent: FakeEl | null = null;
    children: (FakeEl | string)[] = [];
    className = '';
    hidden = false;
    disabled = false;
    value = '';
    src = '';
    href = '';
    readonly style = { height: '', setProperty() {}, removeProperty() {} };
    readonly classList = {
      add: (name: string): void => {
        if (!this.className.split(' ').includes(name)) this.className = `${this.className} ${name}`.trim();
      },
    };
    readonly listeners = new Map<string, Set<Listener>>();
    private text = '';
    constructor(readonly tag: string) {}

    get textContent(): string {
      if (this.children.length === 0) return this.text;
      return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
    }
    set textContent(v: string) {
      for (const c of this.children) if (typeof c !== 'string') c.parent = null;
      this.children = [];
      this.text = v;
    }
    append(...nodes: (FakeEl | string)[]): void {
      for (const n of nodes) {
        if (typeof n !== 'string') {
          n.remove();
          n.parent = this;
        }
        this.children.push(n);
      }
    }
    prepend(...nodes: (FakeEl | string)[]): void {
      const rest = this.children;
      this.children = [];
      this.append(...nodes);
      this.children.push(...rest);
    }
    replaceChildren(...nodes: (FakeEl | string)[]): void {
      this.textContent = '';
      this.append(...nodes);
    }
    remove(): void {
      if (this.parent === null) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    setAttribute(): void {}
    addEventListener(type: string, fn: Listener): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(fn);
    }
    removeEventListener(type: string, fn: Listener): void {
      this.listeners.get(type)?.delete(fn);
    }
    dispatch(type: string): void {
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, target: this, preventDefault() {} });
    }
    focus(): void {}
    blur(): void {}
    select(): void {}
    animate(): { cancel(): void; finished: Promise<void> } {
      const d = Promise.withResolvers<void>();
      animations.push(d);
      return { cancel() {}, finished: d.promise };
    }
    decode(): Promise<void> {
      const d = Promise.withResolvers<void>();
      decodes.push(d);
      return d.promise;
    }
  }

  const decodes: PromiseWithResolvers<void>[] = [];
  const animations: PromiseWithResolvers<void>[] = [];
  return {
    FakeEl,
    decodes,
    animations,
    log: [] as string[],
    saves: [] as unknown[],
    fxCount: 0,
    reduced: false,
    winListeners: new Map<string, Set<Listener>>(),
  };
});
type FakeEl = InstanceType<typeof h.FakeEl>;

vi.mock('./art/cake', () => ({
  buildBunting: () => new h.FakeEl('svg'),
  buildMiniCake: () => ({ svg: new h.FakeEl('svg') }),
  pauseOnHidden: () => () => {},
}));
vi.mock('./fx', () => ({
  createFx: () => {
    const id = ++h.fxCount;
    return {
      sparkle() {},
      confetti: async () => {},
      fireworks: () => {
        h.log.push(`fireworks#${id}`);
        return new Promise<void>(() => {});
      },
      idle: async () => {},
      destroy: () => h.log.push(`destroy#${id}`),
    };
  },
}));

describe('closing riddle', () => {
  const won = [1, 2, 3, 4, 5, 6, 7, 8].reduce(markWon, freshSave());

  beforeEach(() => {
    vi.useFakeTimers();
    h.log.length = 0;
    h.saves.length = 0;
    h.decodes.length = 0;
    h.animations.length = 0;
    h.fxCount = 0;
    h.reduced = false;
    h.winListeners.clear();
    const hist = {
      state: null as unknown,
      pushState(s: unknown) {
        hist.state = s;
      },
      back() {
        hist.state = null;
        for (const fn of [...(h.winListeners.get('popstate') ?? [])]) fn({ type: 'popstate' });
      },
    };
    vi.stubGlobal('document', {
      createElement: (tag: string) => new h.FakeEl(tag),
      addEventListener() {},
      removeEventListener() {},
      visibilityState: 'visible',
      activeElement: null,
    });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('matchMedia', () => ({ matches: h.reduced }));
    vi.stubGlobal('addEventListener', (type: string, fn: (ev: Record<string, unknown>) => void) => {
      if (!h.winListeners.has(type)) h.winListeners.set(type, new Set());
      h.winListeners.get(type)!.add(fn);
    });
    vi.stubGlobal('removeEventListener', (type: string, fn: (ev: Record<string, unknown>) => void) => {
      h.winListeners.get(type)?.delete(fn);
    });
    vi.stubGlobal('history', hist);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mount(save: SaveV1, onBack: () => void = () => {}): { root: FakeEl; unmount: () => void } {
    const root = new h.FakeEl('div');
    const unmount = mountClosing(root as unknown as HTMLElement, {
      save,
      persist: (s) => {
        h.saves.push(s);
        h.log.push(s.solved === true ? 'persist solved' : 'persist');
      },
      onBack,
    });
    return { root, unmount };
  }

  const walk = (el: FakeEl): FakeEl[] => [el, ...el.children.flatMap((c) => (typeof c === 'string' ? [] : walk(c)))];
  const shown = (el: FakeEl | null): boolean => el === null || (!el.hidden && shown(el.parent));
  const visible = (root: FakeEl): FakeEl[] => walk(root).filter((e) => shown(e));
  const button = (root: FakeEl, label: string): FakeEl | undefined =>
    visible(root).find((e) => e.tag === 'button' && e.textContent === label);
  const showsText = (root: FakeEl, text: string): boolean => visible(root).some((e) => e.textContent === text);
  const photoShown = (root: FakeEl): boolean =>
    visible(root).some((e) => e.tag === 'img' && e.src.endsWith('seeschloss-ort.webp')) && showsText(root, reveal.title);

  function answer(root: FakeEl, text: string): void {
    const input = walk(root).find((e) => e.tag === 'input')!;
    input.value = text;
    let form: FakeEl | null = input;
    while (form !== null && form.tag !== 'form') form = form.parent;
    form!.dispatch('submit');
  }

  const decoded = async (): Promise<void> => {
    for (const d of h.decodes) d.resolve();
    await vi.advanceTimersByTimeAsync(0);
  };

  it('shows the wrong-answer line at once and the reveal button after the third wrong try, saving nothing', () => {
    const { root, unmount } = mount(won);
    expect(button(root, 'Antworten')).toBeDefined();
    expect(showsText(root, 'Noch nicht ganz – schau dir die Hinweise nochmal an.')).toBe(false);
    answer(root, 'Wien');
    expect(showsText(root, 'Noch nicht ganz – schau dir die Hinweise nochmal an.')).toBe(true);
    answer(root, 'Salzburg');
    expect(button(root, 'Auflösung zeigen')).toBeUndefined();
    answer(root, 'Linz');
    expect(button(root, 'Auflösung zeigen')).toBeDefined();
    expect(h.saves).toEqual([]);
    unmount();
  });

  it.each([
    ['a correct answer', (root: FakeEl) => answer(root, 'Gmunden')],
    [
      'the reveal button',
      (root: FakeEl) => {
        for (const wrong of ['Wien', 'Graz', 'Linz']) answer(root, wrong);
        button(root, 'Auflösung zeigen')!.dispatch('click');
      },
    ],
  ])('persists solved on %s before the burst, after stopping the ambient show', async (_, accept) => {
    const { root, unmount } = mount(won);
    await vi.advanceTimersByTimeAsync(400); // the ambient show is in flight
    expect(h.log).toEqual(['fireworks#1']);
    accept(root);
    expect(h.saves).toEqual([{ ...won, solved: true }]);
    const persistAt = h.log.indexOf('persist solved');
    expect(h.log.indexOf('destroy#1')).toBeGreaterThan(persistAt);
    const burst = h.log.findIndex((l) => l.startsWith('fireworks#') && l !== 'fireworks#1');
    expect(burst).toBeGreaterThan(h.log.indexOf('destroy#1'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.log.filter((l) => l === 'fireworks#1')).toHaveLength(1); // the ambient loop stays stopped
    unmount();
  });

  it('fades the photo in only once it is decoded and 1 s has passed since the burst began', async () => {
    const { root, unmount } = mount(won);
    answer(root, 'Gmunden');
    await vi.advanceTimersByTimeAsync(500);
    await decoded();
    expect(photoShown(root)).toBe(false);
    await vi.advanceTimersByTimeAsync(499);
    expect(photoShown(root)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(photoShown(root)).toBe(true);
    expect(showsText(root, reveal.message)).toBe(true);
    const links = visible(root).filter((e) => e.tag === 'a');
    expect(links.find((a) => a.textContent === 'Wikimedia Commons')?.href).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(links.some((a) => a.href.startsWith('https://creativecommons.org/'))).toBe(true);
    unmount();

    const late = mount(won);
    answer(late.root, 'Gmunden');
    await vi.advanceTimersByTimeAsync(3000);
    expect(photoShown(late.root)).toBe(false);
    await decoded();
    expect(photoShown(late.root)).toBe(true);
    late.unmount();
  });

  it('plays no burst and no fade under reduced motion: the photo is fully there as soon as it is decoded', async () => {
    h.reduced = true;
    const { root, unmount } = mount(won);
    answer(root, 'Gmunden');
    expect(h.log).toEqual(['persist solved', 'destroy#1']);
    await decoded();
    expect(photoShown(root)).toBe(true);
    expect(h.log.some((l) => l.startsWith('fireworks#'))).toBe(false);
    expect(h.animations).toEqual([]); // no opacity transition: nothing starts transparent
    const view = walk(root).find((e) => e.className === 'closing-photo')!;
    const inView = (e: FakeEl | null): boolean => e !== null && (e === view || inView(e.parent));
    const screen = root.children[0] as FakeEl;
    expect(visible(root).filter((e) => e !== root && e !== screen && !inView(e))).toEqual([]);
    unmount();
  });

  it('runs no callback after an unmount during the burst and decode', async () => {
    const onBack = vi.fn();
    const { root, unmount } = mount(won, onBack);
    answer(root, 'Gmunden');
    await vi.advanceTimersByTimeAsync(500);
    const burstFx = h.fxCount;
    unmount();
    expect(h.log).toContain(`destroy#${burstFx}`);
    const before = h.log.length;
    await decoded();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(root.children).toEqual([]);
    expect(h.log.length).toBe(before);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('offers "Das Geheimnis" instead of the answer region once solved, and it replays the reveal without saving', async () => {
    const { root, unmount } = mount({ ...won, solved: true });
    expect(walk(root).some((e) => e.tag === 'input')).toBe(false);
    expect(button(root, 'Antworten')).toBeUndefined();
    button(root, 'Das Geheimnis')!.dispatch('click');
    expect(h.log.some((l) => l.startsWith('fireworks#'))).toBe(true);
    await decoded();
    await vi.advanceTimersByTimeAsync(1000);
    expect(photoShown(root)).toBe(true);
    expect(h.saves).toEqual([]);
    unmount();
  });

  it.each([
    ['a correct answer', won, (root: FakeEl) => answer(root, 'Gmunden')],
    ['"Das Geheimnis"', { ...won, solved: true as const }, (root: FakeEl) => button(root, 'Das Geheimnis')!.dispatch('click')],
  ])('leaves nothing animating under the photo after %s', async (_, save, accept) => {
    const { root, unmount } = mount(save);
    const screen = root.children[0] as FakeEl;
    accept(root);
    await decoded();
    await vi.advanceTimersByTimeAsync(1000);
    expect(photoShown(root)).toBe(true);
    const view = walk(root).find((e) => e.className === 'closing-photo')!;
    const under = screen.children.filter((c): c is FakeEl => typeof c !== 'string' && c !== view);
    expect(under.length).toBeGreaterThan(0);
    // While the photo fades in over them, the bunting, clues and cake are frozen …
    for (const el of under) expect(el.className.split(' ')).toContain('is-paused');
    // … and once it is opaque they leave rendering, so the cake's endless loops cannot run on unseen.
    for (const a of h.animations) a.resolve();
    await vi.advanceTimersByTimeAsync(0);
    const inView = (e: FakeEl | null): boolean => e !== null && (e === view || inView(e.parent));
    expect(visible(root).filter((e) => e !== root && e !== screen && !inView(e))).toEqual([]);
    unmount();
  });

  it('goes to the map on system Back and on "Zur Torte", once each', () => {
    const onBack = vi.fn();
    const first = mount(won, onBack);
    for (const fn of [...(h.winListeners.get('popstate') ?? [])]) fn({ type: 'popstate' });
    expect(onBack).toHaveBeenCalledTimes(1);
    first.unmount();

    onBack.mockClear();
    const second = mount(won, onBack);
    button(second.root, 'Zur Torte')!.dispatch('click');
    expect(onBack).toHaveBeenCalledTimes(1);
    second.unmount();
    expect(h.winListeners.get('popstate')?.size ?? 0).toBe(0);
  });

  describe('a closing entry left behind by a reload', () => {
    const popstate = (): void => {
      for (const fn of [...(h.winListeners.get('popstate') ?? [])]) fn({ type: 'popstate' });
    };
    function stubHistory(state: unknown): { state: unknown; back: ReturnType<typeof vi.fn>; replaceState: ReturnType<typeof vi.fn> } {
      const hist = { state, back: vi.fn(), replaceState: vi.fn((s: unknown) => (hist.state = s)) };
      vi.stubGlobal('history', hist);
      return hist;
    }

    it('boots at once on an ordinary entry', () => {
      const hist = stubHistory({ mahjong80Level: 3 });
      const start = vi.fn();
      settleClosingHistory(start);
      expect(start).toHaveBeenCalledTimes(1);
      expect(hist.back).not.toHaveBeenCalled();
      expect(hist.replaceState).not.toHaveBeenCalled();
    });

    it('pops it before booting, so the map sits on the entry below and later Backs reach their own listeners', async () => {
      const hist = stubHistory({ mahjong80Closing: true });
      const start = vi.fn();
      settleClosingHistory(start);
      expect(hist.back).toHaveBeenCalledTimes(1);
      expect(start).not.toHaveBeenCalled(); // nothing mounted yet that could take the pop for a Back
      hist.state = null;
      popstate();
      expect(start).toHaveBeenCalledTimes(1);
      expect(h.winListeners.get('popstate')?.size ?? 0).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(start).toHaveBeenCalledTimes(1);
      expect(hist.replaceState).not.toHaveBeenCalled();
    });

    it('boots anyway on a plain entry when the pop never arrives', async () => {
      const hist = stubHistory({ mahjong80Closing: true });
      const start = vi.fn();
      settleClosingHistory(start);
      await vi.advanceTimersByTimeAsync(999);
      expect(start).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(start).toHaveBeenCalledTimes(1);
      expect(hist.state).toBeNull();
      popstate();
      expect(start).toHaveBeenCalledTimes(1);
      expect(h.winListeners.get('popstate')?.size ?? 0).toBe(0);
    });
  });
});

describe('closing fireworks loop', () => {
  let hidden = false;
  let finish: () => void = () => {};
  const play = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    play.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const settle = async (): Promise<void> => {
    finish();
    await Promise.resolve();
  };

  it('plays again after the gap, for as long as the page is visible', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(1);
    await settle();
    vi.advanceTimersByTime(50);
    expect(play).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('starts no show while hidden and resumes when visible again', () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    hidden = true;
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).not.toHaveBeenCalled();
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('does not schedule the next show when a show ends while hidden, and restarts it on return', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    hidden = true;
    loop.visibilityChanged();
    await settle();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(100);
    expect(play).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('never starts a second show while one is still playing', () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    hidden = true;
    loop.visibilityChanged();
    hidden = false;
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('stop ends the loop for good', async () => {
    const loop = createShowLoop(play, () => hidden, 100, 50);
    loop.start();
    vi.advanceTimersByTime(100);
    loop.stop();
    await settle();
    vi.advanceTimersByTime(10_000);
    loop.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
