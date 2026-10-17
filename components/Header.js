'use client';
import { useRouter } from 'next/navigation';
import Icon from './Icon';

// App header with the Kisan Pulse logo. Pass back to show a back button; onSpeak to show a "listen to this page" button.
export default function Header({ title, sub, back = false, onSpeak, right }) {
  const router = useRouter();
  return (
    <header className="hd">
      {back ? (
        <button className="hb" onClick={() => router.back()} aria-label="Back"><Icon name="back" /></button>
      ) : (
        <img className="hd-logo" src="/logo.png" alt="Kisan Pulse" width="40" height="48" />
      )}
      <div className="tt"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {right}
      {onSpeak && <button className="hb" onClick={onSpeak} aria-label="Listen"><Icon name="spk" /></button>}
    </header>
  );
}
