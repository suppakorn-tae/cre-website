import type { Icon as TablerIcon } from '@tabler/icons-react';

/** Icon sizes in px: 16 inline, 18 inputs and menus, 20 buttons and nav, 24 empty states. */
export type IconSize = 16 | 18 | 20 | 24;

/** Stroke width of the hi-fi icon set (Tabler, outline). */
export const ICON_STROKE = 1.75;

type Props = {
  /** A Tabler icon, imported by name: `import { IconCheck } from '@tabler/icons-react'`. */
  icon: TablerIcon;
  size?: IconSize;
  /**
   * Accessible name. Leave it out when the icon only decorates text next to it
   * (hidden from assistive technology); set it when the icon is the only content.
   */
  label?: string;
  className?: string;
};

/** Wraps a Tabler icon with the sizes and stroke of the design system. */
export function Icon({ icon: Glyph, size = 20, label, className }: Props) {
  return (
    <Glyph
      size={size}
      stroke={ICON_STROKE}
      className={className}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
