'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';

const tabs = [
  { name: 'Page Views', href: '/' },
  { name: 'Actions', href: '/actions' },
  { name: 'Bidding', href: '/bidding' }
];

export default function TabNavigation() {
  const pathname = usePathname();

  return (
    <NavigationMenu className="justify-start max-w-none">
      <NavigationMenuList className="justify-start gap-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <NavigationMenuItem key={tab.name}>
              <NavigationMenuLink asChild active={isActive}>
                <Link
                  href={tab.href}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "text-xl font-semibold h-auto py-2",
                    isActive && "bg-accent"
                  )}
                >
                  {tab.name}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
