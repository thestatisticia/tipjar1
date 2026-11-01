'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Eye, Info, LogOut, ArrowUpRight, Share2, Settings, Trophy } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useCreator } from '@/providers/CreatorProvider';

export default function Sidebar() {
  const { logout } = usePrivy();
  const pathname = usePathname();
  const router = useRouter();
  const { creator: creatorInfo } = useCreator();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const menuItems = [
    { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
    { href: '/share',        label: 'Share',        icon: Share2 },
    { href: '/preview',      label: 'Tip Page',     icon: Eye },
    { href: '/leaderboard',  label: 'Leaderboard',  icon: Trophy },
    { href: '/settings',     label: 'Settings',     icon: Settings },
    { href: '/how-it-works', label: 'How it Works', icon: Info },
  ];

  return (
    <aside className="fixed top-0 left-0 bottom-0 z-40 flex w-60 flex-col border-r border-line bg-card max-md:top-auto max-md:bottom-0 max-md:h-16 max-md:w-full max-md:flex-row max-md:items-center max-md:border-r-0 max-md:border-t max-md:px-2">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5 max-md:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-mono text-sm font-bold text-accent-foreground">
          G$
        </span>
        <span className="font-display text-[15px] font-700 font-bold tracking-tight">Tip Jar</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 max-md:flex-row max-md:items-center max-md:justify-around max-md:px-0">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors max-md:flex-col max-md:gap-1 max-md:px-4 max-md:py-1.5 max-md:text-[11px] ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-2 border-t border-line p-3 max-md:hidden">
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
