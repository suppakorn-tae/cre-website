'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRequestExport, type ExportRequest } from './api';
import { ExportForm } from './ExportForm';
import { ExportRow, type ExportEntry } from './ExportRow';
import styles from './export.module.css';

/** Research export: request form, what the file contains, and recent requests. */
export function ExportPage() {
  const t = useTranslations('admin-export');
  const request = useRequestExport();
  // The contract has no list endpoint, so only requests made in this visit show.
  const [entries, setEntries] = useState<ExportEntry[]>([]);

  function submit(body: ExportRequest) {
    request.mutate(body, {
      onSuccess: (id) =>
        setEntries((prev) => [
          { id, requestedAt: new Date().toISOString(), request: body },
          ...prev,
        ]),
    });
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.muted}>{t('subtitle')}</p>
      </header>

      <div className={styles.columns}>
        <ExportForm pending={request.isPending} failed={request.isError} onSubmit={submit} />
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('note.heading')}</h2>
          <ul className={styles.notes}>
            <li>{t('note.pseudonymised')}</li>
            <li>{t('note.audit')}</li>
            <li>{t('note.expiry')}</li>
          </ul>
          <h3 className={styles.legend}>{t('note.structureHeading')}</h3>
          <ul className={styles.notes}>
            <li>{t('note.user')}</li>
            <li>{t('note.project')}</li>
            <li>{t('note.version')}</li>
          </ul>
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('history.heading')}</h2>
        {entries.length === 0 ? (
          <p className={styles.muted}>{t('history.empty')}</p>
        ) : (
          <ul className={styles.rows}>
            {entries.map((entry) => (
              <ExportRow key={entry.id} entry={entry} onAgain={submit} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
