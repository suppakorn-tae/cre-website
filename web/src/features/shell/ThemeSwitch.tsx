'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui';
import { isThemeChoice, THEME_CHOICES, useTheme, type ThemeChoice } from '@/lib/theme';

const CHOICE_ICONS = { system: IconDeviceDesktop, light: IconSun, dark: IconMoon } as const;

const radioItem =
  'flex h-control-md cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body text-text outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-primary data-[state=checked]:font-semibold';

/**
 * The theme choice as a radio group, for the inside of a Radix dropdown menu:
 * the label "ธีม" with system, light and dark. Arrow keys move, Space or Enter
 * picks, and a screen reader hears the checked option. The menu stays open after
 * a pick, so the change is seen at once.
 */
export function ThemeMenuGroup() {
  const t = useTranslations('shell.theme');
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu.Group>
      <DropdownMenu.Label className="m-0 px-3 py-1 text-caption text-text-muted">
        {t('label')}
      </DropdownMenu.Label>
      <DropdownMenu.RadioGroup
        value={theme}
        onValueChange={(v) => {
          if (isThemeChoice(v)) setTheme(v);
        }}
      >
        {THEME_CHOICES.map((choice: ThemeChoice) => (
          <DropdownMenu.RadioItem
            key={choice}
            value={choice}
            className={radioItem}
            onSelect={(e) => e.preventDefault()}
          >
            <Icon icon={CHOICE_ICONS[choice]} size={18} />
            <span className="flex-1">{t(choice)}</span>
            <DropdownMenu.ItemIndicator>
              <Icon icon={IconCheck} size={16} />
            </DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
  );
}
