import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
}

export default function Card({ children }: CardProps) {
  return (
    <div className="bg-white shadow-md rounded p-6">
      {children}
    </div>
  );
}
