import { useCallback, useState } from 'react';

export function useInView(): [React.RefCallback<HTMLElement>, boolean] {
  const [inView, setInView] = useState(false);

  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '-80px' }
    );

    observer.observe(node);
  }, []);

  return [ref, inView];
}
