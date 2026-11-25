import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import styles from './forms.module.css';
import { Icon } from './Icon';

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

/** Error text under a field: alert icon (16) and the message. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.errorText} role="alert">
      <Icon icon={IconAlertCircle} size={16} className={styles.messageIcon} />
      <span>{children}</span>
    </p>
  );
}

/** Success text under a field, e.g. "passwords match": check icon (16) and the message. */
export function FieldOk({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.okText}>
      <Icon icon={IconCircleCheck} size={16} className={styles.messageIcon} />
      <span>{children}</span>
    </p>
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
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {helper && (
        <p id={helperId} className={styles.helper}>
          {helper}
        </p>
      )}
    </>
  );
}
