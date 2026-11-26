import type { Icon as TablerIcon } from '@tabler/icons-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { Icon } from '@/components/ui';
import { FieldMessage, LabelText, messageIds } from '@/components/ui/Field';

export const controlClass =
  'box-border min-h-field w-full rounded-control border border-field-border bg-white px-3 py-2 font-sans text-body text-text placeholder:text-placeholder hover:border-text-muted focus-ring focus-visible:border-primary aria-[invalid=true]:border-error';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** Icon inside the field, before the text. */
  icon?: TablerIcon;
  /** Short text inside the field, after the value, e.g. "%". */
  suffix?: ReactNode;
  /** Class of the wrapper (width, grid placement). */
  className?: string;
};

/**
 * A text field with an icon or a unit inside it, as in the hi-fi. It lives in
 * the projects feature until `components/ui` has the same option.
 */
export function IconField({
  label,
  helper,
  error,
  icon,
  suffix,
  id,
  className,
  required,
  ...rest
}: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const { describedBy } = messageIds(inputId, { helper, error });
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={inputId} className="text-body font-medium text-text">
        <LabelText required={required}>{label}</LabelText>
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-text-muted">
            <Icon icon={icon} size={18} />
          </span>
        )}
        <input
          id={inputId}
          className={`${controlClass} ${icon ? 'ps-10' : ''} ${suffix ? 'pe-10' : ''}`}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-body text-text-muted">
            {suffix}
          </span>
        )}
      </div>
      <FieldMessage id={inputId} helper={helper} error={error} />
    </div>
  );
}
