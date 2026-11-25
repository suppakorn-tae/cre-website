import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';

import styles from './export.module.css';

/** Entries of the research ZIP, in display order, with their nesting depth. */
export const ZIP_TREE = [
  { key: 'zip', depth: 0 },
  { key: 'user', depth: 1 },
  { key: 'userFile', depth: 2 },
  { key: 'project', depth: 2 },
  { key: 'projectFile', depth: 3 },
  { key: 'version', depth: 3 },
] as const;

/** The ZIP structure as an indented file tree with a note per entry. */
export function ZipTree() {
  const t = useTranslations('admin-export.note.tree');
  return (
    <ul className={styles.tree}>
      {ZIP_TREE.map(({ key, depth }) => (
        <li
          key={key}
          className={styles.treeItem}
          data-depth={depth}
          style={{ '--depth': depth } as CSSProperties}
        >
          <span className={styles.treeName}>{t(`${key}.name`)}</span>
          <span className={styles.treeNote}>{t(`${key}.note`)}</span>
        </li>
      ))}
    </ul>
  );
}
