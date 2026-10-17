'use client';
import { useRouter } from 'next/navigation';
import Icon from './Icon';

// Deep-green app header. Pass back to show a back button; onSpeak to show a "listen to this page" button.
export default function Header({ title, sub, back = false, onSpeak, right }) {
  const router = useRouter();
  return (
    <header className="hd">
      {back ? (
        <button className="hb" onClick={() => router.back()} aria-label="Back"><Icon name="back" /></button>
      ) : (
        <span className="logo" aria-hidden="true"><Icon name="leaf" /></span>
      )}
      <div className="tt"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {right}
      {onSpeak && <button className="hb" onClick={onSpeak} aria-label="Listen"><Icon name="spk" /></button>}
    </header>
  );
}
