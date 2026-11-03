'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useTheme } from 'next-themes';
import {
  ArrowRight, ArrowUpRight, Sun, Moon, BadgeCheck, Heart,
  Zap, QrCode, Code, Wallet, ShieldCheck, Globe, Menu, X,
} from 'lucide-react';
import CreatorsLeaderboard from '@/components/CreatorsLeaderboard';

/* ─── Fake ticker data ──────────────────────────────────────── */

const TICKER_TIPS = [
  { name: 'Alice K.', amount: 25, to: 'nuwayama' },
  { name: 'Kev_Celo', amount: 100, to: 'amara' },
  { name: 'Shreya', amount: 50, to: 'kwame' },
  { name: 'Daniel', amount: 500, to: 'nuwayama' },
  { name: 'Fatima', amount: 10, to: 'jose' },
  { name: 'Marco', amount: 75, to: 'amara' },
  { name: 'Lin', amount: 200, to: 'kwame' },
  { name: 'Tunde', amount: 30, to: 'nuwayama' },
];

const FEATURES = [
  { icon: Zap, title: 'Instant settlement', desc: 'Tips land in the creator\'s wallet in seconds — no payout queues, no waiting for "available balance".' },
  { icon: ShieldCheck, title: '0% platform fees', desc: 'Wallet-to-wallet transfers on Celo. The contract never holds funds. Creators keep everything.' },
  { icon: Globe, title: 'Powered by UBI', desc: 'G$ is GoodDollar\'s Universal Basic Income token — fans can tip with the UBI they claim daily, for free.' },
  { icon: QrCode, title: 'QR codes for streams', desc: 'Drop your QR on a livestream overlay or poster. Fans scan and tip in two taps.' },
  { icon: Code, title: 'Embeddable widget', desc: 'One iframe snippet puts a full tipping card on your blog, portfolio, or link-in-bio page.' },
  { icon: Wallet, title: 'On-chain identity', desc: 'Your username lives on the TipJarRegistry contract on Celo. No one can take it from you.' },
];

const STEPS = [
  { n: '01', title: 'Claim your handle', desc: 'Sign in with any wallet or email. Your username is registered on-chain — it\'s yours, verifiably.' },
  { n: '02', title: 'Share everywhere', desc: 'Tip link, QR code, or embedded widget. Put it on streams, bios, videos, and websites.' },
  { n: '03', title: 'Get paid in G$', desc: 'Fans tip straight from their wallet to yours. Watch your live balance grow on the dashboard.' },
];

/* ─── Page ──────────────────────────────────────────────────── */

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const [launching, setLaunching] = useState(false);

  useEffect(() => setMounted(true), []);

  // After the in-page Privy modal completes, move to the dashboard
  useEffect(() => {
    if (launching && ready && authenticated) router.push('/dashboard');
  }, [launching, ready, authenticated, router]);

  // Pop the Privy modal in place; only navigate once signed in
  const launchApp = useCallback(() => {
    if (authenticated) {
      router.push('/dashboard');
    } else {
      setLaunching(true);
      login();
    }
  }, [authenticated, router, login]);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Background decoration */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-130 w-200 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--accent), transparent)' }}
      />

      {/* ─── Navbar ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-background/75 backdrop-blur-md">
        <nav className="mx-auto flex h-16 w-full max-w-[min(1680px,94vw)] items-center justify-between px-6 2xl:px-10 max-lg:max-w-6xl max-lg:px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-mono text-sm font-bold text-accent-foreground">
              G$
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight">Tip Jar</span>
          </Link>

          <div className="flex items-center gap-1 max-md:hidden">
            {[
              ['Features', '#features'],
              ['How it works', '#how-it-works'],
              ['Leaderboard', '#leaderboard'],
              ['Contract', '#contract'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-muted-foreground transition-colors hover:text-foreground"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}
            <button
              onClick={launchApp}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 max-md:hidden"
            >
              Launch app
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-line bg-card max-md:flex"
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t border-line bg-background px-5 py-3 md:hidden">
            {[
              ['Features', '#features'],
              ['How it works', '#how-it-works'],
              ['Leaderboard', '#leaderboard'],
              ['Contract', '#contract'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground"
              >
                {label}
              </a>
            ))}
            <button
              onClick={() => { setMenuOpen(false); launchApp(); }}
              className="mt-2 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-bold text-primary-foreground"
            >
              Launch app
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </header>

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="mx-auto grid w-full max-w-[min(1680px,94vw)] grid-cols-[minmax(0,1fr)_minmax(460px,1fr)] items-center gap-16 px-6 pt-36 pb-20 2xl:gap-24 2xl:px-10 max-lg:grid-cols-1 max-lg:max-w-6xl max-lg:gap-12 max-lg:px-5 max-lg:pt-30 max-lg:pb-12">
        <div className="animate-fade-up 2xl:pr-10">
          <h1 className="max-w-[15ch] font-display text-[clamp(2.7rem,4.8vw,5.8rem)] leading-[1.02] font-bold tracking-tight max-md:text-4xl">
            Get tipped in{' '}
            <span className="relative inline-block">
              <span className="relative z-10">G$</span>
              <span className="absolute inset-x-0 bottom-1.5 z-0 h-4 rounded-sm bg-accent max-md:h-3" />
            </span>
            .<br />
            Directly. Instantly.
          </h1>

          <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-muted-foreground max-md:text-[17px]">
            The tipping platform for creators on Celo. Fans send GoodDollar straight
            to your wallet — no middlemen, no fees, no payout delays.
          </p>

          <div className="mt-8 flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <button
              onClick={launchApp}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-[15px] font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg"
            >
              Start earning
              <ArrowRight size={16} />
            </button>
            <a
              href="#how-it-works"
              className="flex h-12 items-center justify-center rounded-xl border border-line bg-card px-7 text-[15px] font-semibold transition-colors hover:border-foreground/30"
            >
              See how it works
            </a>
          </div>

          {/* Mini stats */}
          <div className="mt-10 flex gap-8 max-sm:gap-6">
            {[
              ['0%', 'platform fees'],
              ['~5s', 'to settle'],
              ['100%', 'on-chain'],
            ].map(([big, small]) => (
              <div key={small}>
                <p className="font-display text-2xl font-bold">{big}</p>
                <p className="text-xs text-muted-foreground">{small}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual — mock tip card with floating toasts */}
        <div className="relative flex justify-end max-lg:hidden">
          {/* Mock card */}
          <div className="w-full max-w-[560px] animate-float-slow rounded-2xl border border-line bg-card p-6 shadow-xl 2xl:max-w-[620px] 2xl:p-7">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-xl font-bold text-accent-foreground">
                N
              </div>
              <div className="mt-2.5 flex items-center gap-1">
                <p className="font-display text-lg font-bold">Nuwayama</p>
                <BadgeCheck size={15} className="text-success" />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">@nuwayama</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Sharing authentic Ugandan recipes from Kampala 🍲
              </p>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-1.5">
              {[10, 50, 100, 500].map((amt, i) => (
                <span
                  key={amt}
                  className={`rounded-lg border py-2 text-center font-mono text-xs font-semibold ${
                    i === 1
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-line text-muted-foreground'
                  }`}
                >
                  {amt}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              Send 50 G$
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Floating toasts */}
          <div className="absolute -left-8 top-8 animate-float rounded-xl border border-line bg-card px-4 py-2.5 shadow-lg 2xl:-left-14" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-2.5">
              <Heart size={14} className="text-danger" />
              <div>
                <p className="text-xs font-bold">Alice tipped 25 G$</p>
                <p className="text-[10px] text-muted-foreground">&quot;The Rolex recipe was 🔥&quot;</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-3 top-44 animate-float rounded-xl border border-line bg-card px-4 py-2.5 shadow-lg 2xl:-right-7" style={{ animationDelay: '1.8s' }}>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">
                +100 G$
              </span>
              <p className="text-xs font-bold">from Kev_Celo</p>
            </div>
          </div>
          <div className="absolute -bottom-5 left-12 animate-float rounded-xl border border-line bg-card px-4 py-2.5 shadow-lg 2xl:left-18" style={{ animationDelay: '3s' }}>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              <p className="font-mono text-[10px] font-semibold text-muted-foreground">
                tx confirmed on Celo · 4.2s
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tips marquee ───────────────────────────────────── */}
      <div className="border-y border-line bg-card/50 py-3.5">
        <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
          {[...TICKER_TIPS, ...TICKER_TIPS].map((tip, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-4 py-1.5 text-xs"
            >
              <Heart size={11} className="text-danger" />
              <span className="font-semibold">{tip.name}</span>
              <span className="text-muted-foreground">tipped</span>
              <span className="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-foreground">
                {tip.amount} G$
              </span>
              <span className="text-muted-foreground">to @{tip.to}</span>
            </span>
          ))}
        </div>
      </div>

      <CreatorsLeaderboard />

      {/* ─── How it works ───────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 max-md:py-16">
        <div className="text-center">
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            How it works
          </span>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight max-md:text-3xl">
            Three steps to your first tip
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-5 max-md:grid-cols-1">
          {STEPS.map((step, i) => (
            <div key={step.n} className="group relative rounded-2xl border border-line bg-card p-7 transition-shadow hover:shadow-lg">
              <span className="font-mono text-xs font-bold text-muted-foreground/40">{step.n}</span>
              <h3 className="mt-3 font-display text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              {i < 2 && (
                <ArrowRight
                  size={18}
                  className="absolute top-1/2 -right-3 z-10 hidden -translate-y-1/2 text-muted-foreground/40 md:block"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────── */}
      <section id="features" className="border-t border-line bg-card/40 scroll-mt-24">
        <div className="mx-auto max-w-6xl px-5 py-24 max-md:py-16">
          <div className="text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Features
            </span>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight max-md:text-3xl">
              Everything a creator needs
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-2xl border border-line bg-card p-6 transition-shadow hover:shadow-lg">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 font-display text-[15px] font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Contract transparency ──────────────────────────── */}
      <section id="contract" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 max-md:py-16">
        <div className="grid grid-cols-2 items-center gap-12 rounded-3xl border border-line bg-card p-10 max-md:grid-cols-1 max-md:p-6">
          <div>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Fully transparent
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
              Don&apos;t trust us. <br />Verify the contract.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every tip is a public transaction on Celo. The TipJarRegistry contract routes
              G$ wallet-to-wallet and never holds funds — read the code yourself.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              ['TipJarRegistry', '0x9c69aa76f0D565eC514563E36bf9371ba7E74F05'],
              ['GoodDollar (G$)', '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'],
            ].map(([label, addr]) => (
              <a
                key={addr}
                href={`https://celoscan.io/address/${addr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-background px-4 py-3.5 transition-colors hover:border-foreground/30"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold">{label}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{addr}</p>
                </div>
                <ArrowUpRight size={15} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-24 text-center max-md:py-16">
          <h2 className="font-display text-5xl font-bold tracking-tight max-md:text-3xl">
            Your fans are ready.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] text-muted-foreground">
            Claim your on-chain username and share your tip link in under a minute.
          </p>
          <button
            onClick={launchApp}
            className="mt-8 inline-flex h-13 items-center gap-2 rounded-xl bg-primary px-8 text-base font-bold text-primary-foreground transition-all hover:opacity-90 hover:shadow-xl"
          >
            Launch the app
            <ArrowRight size={17} />
          </button>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-line bg-card/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 max-sm:flex-col max-sm:gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent font-mono text-[10px] font-bold text-accent-foreground">
              G$
            </span>
            <span className="text-sm font-semibold">Tip Jar</span>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Powered by GoodDollar on Celo · 100% on-chain
          </p>
        </div>
      </footer>
    </div>
  );
}
