import { redirect } from 'next/navigation';

import { AFTER_LOGIN_PATH } from '@/features/auth/login/paths';

/**
 * The site root has no page of its own. Send everyone to the dashboard; the
 * `(app)` session guard redirects signed-out visitors on to the login page.
 */
export default function Home(): never {
  redirect(AFTER_LOGIN_PATH);
}
