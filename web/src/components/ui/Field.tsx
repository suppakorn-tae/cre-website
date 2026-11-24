import type { ReactNode } from 'react';

import styles from './forms.module.css';

export type FieldMessages = {
  helper?: ReactNode;
  error?: ReactNode;
};

/** Ids for the helper and error text so controls can point at them. */
export function messageIds(id: string, { helper, error }: FieldMessages) {
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return {
    helperId,
    errorId,
    describedBy: [errorId, helperId].filter(Boolean).join(' ') || undefined,
  };
}

/** Label text with the required mark or the "optional" tag. */
export function LabelText({
  children,
  required,
  optionalLabel,
}: {
  children: ReactNode;
  required?: boolean;
  /** Text for the optional tag, e.g. "ไม่บังคับ". Omit for required fields. */
  optionalLabel?: string;
}) {
  return (
    <>
      {children}
      {required && (
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      )}
      {optionalLabel && <span className={styles.optional}>{optionalLabel}</span>}
    </>
  );
}

export function FieldMessage({
  id,
  helper,
  error,
}: FieldMessages & {
  id: string;
}) {
  const { helperId, errorId } = messageIds(id, { helper, error });
  return (
    <>
      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      {helper && (
        <p id={helperId} className={styles.helper}>
          {helper}
        </p>
      )}
    </>
  );
}
