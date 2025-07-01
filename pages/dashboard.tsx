// File: pages/dashboard.tsx
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useRouter } from 'next/router';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUser(user);
      else router.push('/login');
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">SwitchCX Dashboard</h1>
        <button onClick={handleSignOut} className="text-sm text-red-500">
          Logout
        </button>
      </div>
      <div className="bg-white p-4 shadow rounded">
        <p>Welcome, {user?.email}</p>
        <p>Wallet and payout info will appear here.</p>
      </div>
    </div>
  );
}
