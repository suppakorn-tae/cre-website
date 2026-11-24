import { Suspense } from 'react';

import { AccountPage } from '@/features/account/AccountPage';

export default function Page() {
  // The page reads `?result=` from the Google callback.
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
