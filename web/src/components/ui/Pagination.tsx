import styles from './display.module.css';

/** Page numbers to show: first, last, and two around the current, with gaps as null. */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...keep].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

type Props = {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  labels: {
    nav: string;
    previous: string;
    next: string;
    /** Spoken name of a page button, e.g. (n) => `หน้า ${n}`. */
    page: (n: number) => string;
  };
};

export function Pagination({ page, pageCount, onChange, labels }: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={labels.nav}>
      <ul className={styles.pager}>
        <li>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            {labels.previous}
          </button>
        </li>
        {pageWindow(page, pageCount).map((p, i) => (
          <li key={p ?? `gap-${i}`}>
            {p === null ? (
              <span className={styles.ellipsis} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                type="button"
                className={styles.pageBtn}
                aria-current={p === page ? 'page' : undefined}
                aria-label={labels.page(p)}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            )}
          </li>
        ))}
        <li>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= pageCount}
            onClick={() => onChange(page + 1)}
          >
            {labels.next}
          </button>
        </li>
      </ul>
    </nav>
  );
}
