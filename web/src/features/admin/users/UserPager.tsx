import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { Icon, pageWindow } from '@/components/ui';

import styles from './users.module.css';

type Props = {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  labels: {
    nav: string;
    previous: string;
    next: string;
    page: (n: number) => string;
  };
};

/**
 * Pager of the user list as the hi-fi draws it: previous and next carry a
 * chevron. The shared Pagination has no icons, and it is not ours to change.
 */
export function UserPager({ page, pageCount, onChange, labels }: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={labels.nav}>
      <ul className={styles.pager}>
        <li>
          <button
            type="button"
            className={`${styles.pageBtn} ${styles.pageStep}`}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <Icon icon={IconChevronLeft} size={16} />
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
            className={`${styles.pageBtn} ${styles.pageStep}`}
            disabled={page >= pageCount}
            onClick={() => onChange(page + 1)}
          >
            {labels.next}
            <Icon icon={IconChevronRight} size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
