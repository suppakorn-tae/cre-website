import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';

import { Logo } from '@/components/ui/Logo';
import '@/styles/tokens.css';

import { REGISTER_PATH } from '../auth/register/google';
import styles from './legal.module.css';

export type LegalDocumentKey = 'retention' | 'terms';

type Section = { heading: string; paragraphs?: string[]; items?: string[] };

/** Fills `{controller}` and `{email}` in a catalogue string. */
function fill(text: string, values: { controller: string; email: string }): ReactNode {
  return text.split(/(\{controller\}|\{email\})/).map((part, i) => {
    if (part === '{controller}') return values.controller;
    if (part === '{email}')
      return (
        <a key={i} className={styles.link} href={`mailto:${values.email}`}>
          {values.email}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** A public reading page: logo header, back link, version line and numbered sections. */
export function LegalDocument({ doc }: { doc: LegalDocumentKey }) {
  const t = useTranslations('legal');
  const values = { controller: t('contact.controller'), email: t('contact.email') };
  const intro = t.raw(`${doc}.intro`) as string[];
  const sections = t.raw(`${doc}.sections`) as Section[];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <Logo variant="header" />
        </Link>
      </header>
      <main className={styles.main}>
        <Link href={REGISTER_PATH} className={styles.back}>
          {t('nav.back')}
        </Link>
        <article>
          <h1 className={styles.title}>{t(`${doc}.title`)}</h1>
          <p className={styles.version}>{t(`${doc}.version`)}</p>
          {intro.map((text) => (
            <p key={text} className={styles.paragraph}>
              {fill(text, values)}
            </p>
          ))}
          {sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.paragraphs?.map((text) => (
                <p key={text} className={styles.paragraph}>
                  {fill(text, values)}
                </p>
              ))}
              {section.items && (
                <ul className={styles.list}>
                  {section.items.map((text) => (
                    <li key={text}>{fill(text, values)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
