'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { t } from '@/lib/i18n';

const TABS = [
  ['/', 'home', 'home'],
  ['/services', 'grid', 'services'],
  ['/mandi', 'rupee', 'mandi'],
  ['/schemes', 'doc', 'schemes'],
  ['/profile', 'user', 'profile'],
];

export default function BottomNav({ lang = 'hi' }) {
  const path = usePathname();
  const L = t(lang).nav;
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map(([href, icon, key]) => (
        <Link key={href} href={href} className="nb" aria-current={path === href ? 'page' : undefined}>
          <Icon name={icon} />
          {L[key]}
        </Link>
      ))}
    </nav>
  );
}
