import { Suspense } from 'react';

import { GoogleFinish } from '@/features/auth/register/GoogleFinish';

// The Google callback redirects here with `?result=`.
export default function RegisterGooglePage() {
  return (
    <Suspense>
      <GoogleFinish />
    </Suspense>
  );
}
