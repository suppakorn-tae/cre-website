export type AccountMenuLink = {
  key: 'myAccount' | 'admin';
  href: string;
  /** The page the user is on: the item shows as selected. */
  current: boolean;
};

/** Links of the user menu. The admin link is for admins only (logout is added by the menu). */
export function accountMenuLinks(user: { isAdmin: boolean }, pathname: string): AccountMenuLink[] {
  const links: AccountMenuLink[] = [
    { key: 'myAccount', href: '/account', current: pathname === '/account' },
  ];
  if (user.isAdmin) {
    links.push({ key: 'admin', href: '/admin/users', current: pathname.startsWith('/admin') });
  }
  return links;
}

/** Message key of the role line under the e-mail. */
export function roleKey(user: { isAdmin: boolean }): 'roleAdmin' | 'roleUser' {
  return user.isAdmin ? 'roleAdmin' : 'roleUser';
}
