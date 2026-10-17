'use client';
// STUB — Person 4 replaces this file.
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import useFarmer from '@/components/useFarmer';
import { logout } from '@/lib/session';

export default function Page() {
  const { lang } = useFarmer();
  return (
    <>
      <Header title="schemes" sub="coming soon" />
      <main className="page"><div className="card"><p className="p">This page is being built.</p>
      </div></main>
      <BottomNav lang={lang} />
    </>
  );
}
