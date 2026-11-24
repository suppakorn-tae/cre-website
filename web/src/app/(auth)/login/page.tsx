import { Suspense } from 'react';

import { LoginForm } from '@/features/auth/login/LoginForm';

// The Google callback may redirect here with `?result=`.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
