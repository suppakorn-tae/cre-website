import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('shell.brand');
  return <main>{t('name')}</main>;
}
