'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TabNavigation() {
  const pathname = usePathname();

  const tabs = [
    { name: 'Page Views', href: '/', current: pathname === '/' },
    { name: 'Actions', href: '/actions', current: pathname === '/actions' }
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
              ${tab.current
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
              transition-colors duration-200
            `}
            aria-current={tab.current ? 'page' : undefined}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
