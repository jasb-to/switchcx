import React from 'react';

interface DashboardOverviewProps {
  walletBalance: number;
  pendingPayouts: number;
}

export default function DashboardOverview({ walletBalance, pendingPayouts }: DashboardOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-green-100 p-4 rounded shadow">
        <h2 className="font-semibold text-lg">Wallet Balance</h2>
        <p className="text-2xl font-bold">${walletBalance.toFixed(2)}</p>
      </div>
      <div className="bg-yellow-100 p-4 rounded shadow">
        <h2 className="font-semibold text-lg">Pending Payouts</h2>
        <p className="text-2xl font-bold">${pendingPayouts.toFixed(2)}</p>
      </div>
    </div>
  );
}
