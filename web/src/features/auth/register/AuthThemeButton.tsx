'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconContrast } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui';
import { ThemeMenuGroup } from '@/features/shell/ThemeSwitch';

import styles from './register.module.css';

/** The theme choice for the auth pages, which have no account menu: a corner icon button. */
export function AuthThemeButton() {
  const t = useTranslations('auth.theme');
  return (
    <div className={styles.themeCorner}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={styles.themeButton} aria-label={t('button')}>
            <Icon icon={IconContrast} size={20} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-52 rounded-card border border-border bg-card p-2 shadow-floating"
        >
          <ThemeMenuGroup />
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
}
