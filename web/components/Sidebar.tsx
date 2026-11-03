'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Eye, Info, LogOut, ArrowUpRight, Share2, Settings, Trophy,
  ListTodo, Megaphone, RotateCw, Shield, MoreHorizontal, X, Wallet, Bell,
} from 'lucide-react';
import { useAccount, useDisconnect } from 'wagmi';
import { useCreator } from '@/providers/CreatorProvider';
import { useNotificationCount } from '@/hooks/useNotificationCount';
import GoodHubLogo from '@/components/GoodHubLogo';

const navigationGroups = [
  {
    label: 'Overview',
    links: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard#wallet', label: 'Wallet', icon: Wallet },
    ],
  },
  {
    label: 'Earn',
    links: [
      { href: '/tasks#explore-tasks', label: 'Explore tasks', mobileLabel: 'Tasks', icon: ListTodo },
      { href: '/tasks#my-tasks', label: 'My tasks', icon: ListTodo },
      { href: '/spin', label: 'Daily rewards', mobileLabel: 'Rewards', icon: RotateCw },
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/campaigns#my-campaigns', label: 'My campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'Community',
    links: [
      { href: '/leaderboard', label: 'Discover creators', mobileLabel: 'Creators', icon: Trophy },
      { href: '/share', label: 'My public page', mobileLabel: 'My page', icon: Share2 },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/notifications', label: 'Notifications', mobileLabel: 'Alerts', icon: Bell },
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/how-it-works', label: 'Help & support', mobileLabel: 'Help', icon: Info },
    ],
  },
];

export default function Sidebar() {
  const { disconnectAsync } = useDisconnect();
  const { address } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const { creator: creatorInfo } = useCreator();
  const unreadNotifications = useNotificationCount(address);
  const [moreOpen, setMoreOpen] = useState(false);

  const adminAccessQuery = useQuery<{ authorized: boolean }>({
    queryKey: ['admin-access', address],
    enabled: Boolean(address),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/admin/access?wallet=${encodeURIComponent(address!)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check admin access.');
      return result;
    },
  });
  const isAdmin = adminAccessQuery.data?.authorized === true;

  const handleLogout = async () => {
    await disconnectAsync();
    router.push('/');
  };

  const links = navigationGroups.flatMap((group) => group.links);
  const adminLink = { href: '/admin', label: 'Admin approvals', mobileLabel: 'Admin', icon: Shield };
  const mobilePrimaryLinks = [
    links.find((item) => item.href === '/dashboard'),
    links.find((item) => item.href === '/tasks'),
    links.find((item) => item.href === '/campaigns'),
    links.find((item) => item.href === '/spin'),
  ].filter((item): item is (typeof links)[number] => Boolean(item));
  const mobileMoreLinks = [
    ...links.filter((item) => !mobilePrimaryLinks.some((primary) => primary.href === item.href)),
    ...(isAdmin ? [adminLink] : []),
  ];

  const renderLink = (item: (typeof links)[number] | typeof adminLink, mobile = false) => {
    const Icon = item.icon;
    const isActive = !item.href.includes('#') &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`));
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMoreOpen(false)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        } ${mobile ? 'hidden min-w-16 shrink-0 flex-col gap-1 px-3 py-1.5 text-[10px] max-md:flex' : ''}`}
      >
        <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
        <span className="min-w-0 flex-1 truncate">{mobile ? (item.mobileLabel || item.label) : item.label}</span>
        {item.href === '/notifications' && unreadNotifications > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
            {unreadNotifications > 99 ? '99+' : unreadNotifications}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed top-0 left-0 bottom-0 z-40 flex w-60 flex-col border-r border-line bg-card max-md:top-auto max-md:bottom-0 max-md:h-16 max-md:w-full max-md:flex-row max-md:items-center max-md:border-r-0 max-md:border-t max-md:px-2">
      <div className="flex items-center px-5 pt-6 pb-5 max-md:hidden">
        <GoodHubLogo />
      </div>

      <nav aria-label="Main navigation" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-3 max-md:flex-row max-md:items-center max-md:justify-around max-md:gap-0 max-md:overflow-visible max-md:px-0 max-md:pb-0">
        {navigationGroups.map((group) => (
          <div key={group.label} className="max-md:hidden">
            <p className="px-3 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {group.links.map((item) => renderLink(item))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div className="mt-auto border-t border-line pt-3 max-md:hidden">
            <p className="px-3 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Administration</p>
            {renderLink(adminLink)}
          </div>
        )}
        {mobilePrimaryLinks.map((item) => renderLink(item, true))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label={moreOpen ? 'Close more navigation links' : 'More navigation links'}
          className={`hidden min-w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium max-md:flex ${moreOpen ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {moreOpen ? <X size={17} /> : <MoreHorizontal size={17} />}
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="absolute right-2 bottom-[calc(100%+0.5rem)] z-50 hidden w-56 rounded-xl border border-line bg-card p-2 shadow-lg max-md:block">
          <div className="flex flex-col gap-1">
            {mobileMoreLinks.map((item) => renderLink(item))}
          </div>
          <div className="mt-2 border-t border-line pt-2">
            {creatorInfo.username && (
              <a
                href={`/tip/${creatorInfo.username}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <Eye size={17} />
                View public page
                <ArrowUpRight size={12} className="ml-auto opacity-50" />
              </a>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-3 max-md:hidden">
        {creatorInfo.username && (
          <a
            href={`/tip/${creatorInfo.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <Eye size={13} />
            <span>View public page</span>
            <ArrowUpRight size={12} className="ml-auto opacity-50" />
          </a>
        )}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold">
            {creatorInfo.name ? creatorInfo.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {creatorInfo.name || 'Set your name'}
            </p>
            <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">
              @{creatorInfo.username || 'username'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
