'use client';

import * as Accordion from '@radix-ui/react-accordion';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  IconChevronDown,
  IconCircleCheck,
  IconDots,
  IconDownload,
  IconInfoCircle,
  IconPencil,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, Icon, TooltipContent } from '@/components/ui';

// One styled example of each Radix primitive, built only from token utilities
// (see web/README.md, "Styling rules"). Radix handles focus, keyboard and ARIA.
const floating =
  'z-50 rounded-card border border-border bg-card text-body text-text shadow-floating';
const menuItem =
  'flex h-control-sm cursor-default select-none items-center gap-2 rounded-control px-3 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-primary';
const iconButton =
  'focus-ring inline-flex size-control-sm items-center justify-center rounded-control border border-field-border bg-card text-text-secondary hover:bg-subtle';

export function RadixExamples() {
  const t = useTranslations('ui');
  const [weight, setWeight] = useState([40]);
  const [toastOpen, setToastOpen] = useState(false);

  return (
    <Tooltip.Provider delayDuration={200}>
      <Toast.Provider swipeDirection="right" duration={5000} label={t('dev.radixToastRegion')}>
        <div className="grid max-w-xl gap-8">
          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixSlider')}</h3>
            <span id="dev-slider-label" className="text-small text-text-secondary">
              {t('dev.radixSliderLabel')}: {weight[0]}%
            </span>
            <Slider.Root
              className="relative flex h-6 w-72 max-w-full touch-none select-none items-center"
              value={weight}
              onValueChange={setWeight}
              max={100}
              step={5}
            >
              <Slider.Track className="relative h-1.5 grow rounded-pill bg-blue-100">
                <Slider.Range className="absolute h-full rounded-pill bg-primary" />
              </Slider.Track>
              <Slider.Thumb
                aria-labelledby="dev-slider-label"
                className="focus-ring block size-5 rounded-pill border-2 border-primary bg-card"
              />
            </Slider.Root>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixPopover')}</h3>
            <div>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button variant="secondary" icon={<Icon icon={IconInfoCircle} size={20} />}>
                    {t('dev.radixPopoverOpen')}
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={8}
                    align="start"
                    className={`${floating} w-72 max-w-[calc(100vw-2rem)] p-4 pe-12`}
                  >
                    <p className="m-0 font-semibold">{t('dev.radixPopoverTitle')}</p>
                    <p className="mb-0 mt-1 text-text-secondary">{t('dev.radixPopoverText')}</p>
                    <Popover.Close
                      className={`${iconButton} absolute end-2 top-2 border-0`}
                      aria-label={t('close')}
                    >
                      <Icon icon={IconX} size={18} />
                    </Popover.Close>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixMenu')}</h3>
            <div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="secondary" icon={<Icon icon={IconDots} size={20} />}>
                    {t('dev.radixMenuOpen')}
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    sideOffset={8}
                    align="start"
                    className={`${floating} min-w-48 p-1`}
                  >
                    <DropdownMenu.Item className={menuItem}>
                      <Icon icon={IconPencil} size={18} />
                      {t('dev.radixMenuEdit')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem}>
                      <Icon icon={IconDownload} size={18} />
                      {t('dev.radixMenuDownload')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-divider" />
                    <DropdownMenu.Item
                      className={`${menuItem} text-error data-[highlighted]:bg-error-bg data-[highlighted]:text-error`}
                    >
                      <Icon icon={IconTrash} size={18} />
                      {t('dev.radixMenuDelete')}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixAccordion')}</h3>
            <Accordion.Root
              type="single"
              collapsible
              defaultValue="one"
              className="overflow-hidden rounded-card border border-border bg-card"
            >
              {(['one', 'two'] as const).map((id) => (
                <Accordion.Item
                  key={id}
                  value={id}
                  className="border-b border-divider last:border-b-0"
                >
                  <Accordion.Header className="m-0 text-body">
                    <Accordion.Trigger className="focus-ring group flex min-h-control-md w-full items-center justify-between gap-2 border-0 bg-card px-4 py-2 text-start font-medium text-text hover:bg-subtle">
                      {t(`dev.radixAccordion_${id}_title`)}
                      <Icon
                        icon={IconChevronDown}
                        size={18}
                        className="shrink-0 transition-transform group-data-[state=open]:rotate-180"
                      />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-4 pb-3 text-body text-text-secondary">
                    {t(`dev.radixAccordion_${id}_text`)}
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixTooltip')}</h3>
            <div className="flex items-center gap-3">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className={iconButton}
                    aria-label={t('dev.radixTooltipHelp')}
                  >
                    <Icon icon={IconInfoCircle} size={18} />
                  </button>
                </Tooltip.Trigger>
                <TooltipContent>{t('dev.radixTooltipText')}</TooltipContent>
              </Tooltip.Root>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixVisuallyHidden')}</h3>
            <p className="m-0 text-small text-text-secondary">{t('dev.radixVisuallyHiddenText')}</p>
            <div>
              <button type="button" className={iconButton}>
                <Icon icon={IconDownload} size={18} />
                <VisuallyHidden.Root>{t('dev.radixVisuallyHiddenLabel')}</VisuallyHidden.Root>
              </button>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="text-h3 font-semibold">{t('dev.radixToast')}</h3>
            <div>
              <Button variant="secondary" onClick={() => setToastOpen(true)}>
                {t('dev.radixToastOpen')}
              </Button>
            </div>
            <Toast.Root
              open={toastOpen}
              onOpenChange={setToastOpen}
              className={`${floating} flex items-start gap-3 border-s-4 border-s-success px-4 py-3`}
            >
              <Icon icon={IconCircleCheck} size={20} className="mt-0.5 shrink-0 text-success" />
              <div className="grid flex-1 gap-0.5">
                <Toast.Title className="m-0 font-semibold">{t('dev.toastTitle')}</Toast.Title>
                <Toast.Description className="m-0 text-text-secondary">
                  {t('dev.toastText')}
                </Toast.Description>
              </div>
              <Toast.Close className={`${iconButton} border-0`} aria-label={t('close')}>
                <Icon icon={IconX} size={18} />
              </Toast.Close>
            </Toast.Root>
          </section>
        </div>
        <Toast.Viewport className="fixed bottom-0 end-0 z-50 m-0 flex w-96 max-w-full list-none flex-col gap-2 p-4 outline-none" />
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
