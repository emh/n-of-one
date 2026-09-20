import { useEffect, useRef, useState } from 'preact/hooks';
import { flushSync } from 'preact/compat';

const routes = [
  'journal',
  'today',
  'week',
  'body',
  'compose',
  'review',
  'details',
  'settings',
  'entry',
];
const route = () => {
  const value = location.hash.slice(1).split('/')[0];
  return routes.includes(value) ? value : 'journal';
};

export function useNavigation() {
  const [view, setView] = useState(route);
  const viewRef = useRef(view);
  const transition = useRef();
  const positions = useRef({});
  function show(next, direction) {
    if (next === viewRef.current) return;
    positions.current[viewRef.current] = window.scrollY;
    viewRef.current = next;
    document.documentElement.dataset.direction = direction;
    const update = () => {
      // A newer navigation can arrive before this snapshot callback runs.
      if (next !== viewRef.current) return;
      flushSync(() => setView(next));
      window.scrollTo({
        top: direction === 'back' ? positions.current[next] || 0 : 0,
        behavior: 'instant',
      });
      document.querySelector('main h1')?.focus({ preventScroll: true });
    };
    transition.current?.skipTransition();
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      transition.current = document.startViewTransition(update);
    else update();
  }
  function navigate(next, { replace = false, direction = 'forward', entryId } = {}) {
    if (next === viewRef.current) return;
    const trail = history.state?.trail || [viewRef.current];
    const ancestor = trail.lastIndexOf(next, trail.length - 2);
    if (direction === 'back' && ancestor >= 0) {
      history.go(ancestor - trail.length + 1);
      return;
    }
    const inheritedId = ['review', 'compose', 'details'].includes(viewRef.current)
      ? location.hash.split('/')[1]
      : undefined;
    const targetId = ['entry', 'review', 'compose', 'details'].includes(next)
      ? entryId || inheritedId
      : undefined;
    const nextTrail = replace ? [...trail.slice(0, -1), next] : [...trail, next];
    history[replace ? 'replaceState' : 'pushState'](
      { trail: nextTrail },
      '',
      `#${next}${targetId ? '/' + targetId : ''}`,
    );
    show(next, direction);
  }
  function back(fallback = 'journal') {
    const trail = history.state?.trail;
    if (trail?.length > 1) history.back();
    else navigate(fallback, { replace: true, direction: 'back' });
  }
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        '--viewport-height',
        `${viewport?.height || window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    if (!history.state?.trail) history.replaceState({ trail: [route()] }, '');
    const restoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const pop = () => show(route(), 'back');
    addEventListener('popstate', pop);
    addEventListener('hashchange', pop);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
      document.documentElement.style.removeProperty('--viewport-height');
      history.scrollRestoration = restoration;
      removeEventListener('popstate', pop);
      removeEventListener('hashchange', pop);
    };
  }, []);
  return { view, viewRef, navigate, back };
}
