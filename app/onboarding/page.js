'use client';
// STUB — Person 2 replaces this file with the real voice onboarding.
// Lets the team test the home page now: saves a demo farmer on this phone.
import { useRouter } from 'next/navigation';
import { setFarmer } from '@/lib/session';

export default function OnboardingStub() {
  const router = useRouter();
  const demo = () => {
    setFarmer({ id: null, name: 'रमेश', phone: '+919999999999', lang: 'hi', village: 'Malihabad', district: 'Lucknow', state: 'Uttar Pradesh', lat: 26.92, lon: 80.71, land_value: 4, land_unit: 'bigha', land_acres: 2.5, crops: ['wheat', 'potato'], farmer_id_sim: 'SIM-UP-00000000' });
    router.replace('/');
  };
  return (
    <main className="page" style={{ justifyContent: 'center' }}>
      <p className="h1">Onboarding (stub)</p>
      <p className="mut">Person 2 is building voice onboarding here.</p>
      <button className="btn" onClick={demo}>Use demo farmer</button>
    </main>
  );
}
