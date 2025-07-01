import React from 'react';

interface NavbarProps {
  userEmail: string | null;
  onLogout: () => void;
}

export default function Navbar({ userEmail, onLogout }: NavbarProps) {
  return (
    <nav className="flex justify-between items-center bg-gray-900 p-4 text-white">
      <h1 className="text-xl font-bold">SwitchCX</h1>
      <div className="flex items-center space-x-4">
        {userEmail && <span>{userEmail}</span>}
        <button
          onClick={onLogout}
          className="bg-red-600 hover:bg-red-700 rounded px-3 py-1 text-sm"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
