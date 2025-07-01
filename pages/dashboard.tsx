import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Card from '../components/Card';
import DashboardOverview from '../components/DashboardOverview';

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setUser(user);
      else router.push('/login');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <Navbar userEmail={user?.email || null} onLogout={handleSignOut} />
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <Card>
          <DashboardOverview walletBalance={1245.67} pendingPayouts={300.25} />
        </Card>
        {/* TODO: Add more sections like transactions, user management, etc. */}
      </main>
    </>
  );
}
