'use client';

import { Heart, ListTodo, Megaphone } from 'lucide-react';

const STEPS = [
  {
    n: '01',
    title: 'Connect your wallet',
    desc: 'Use MetaMask on Celo to explore GOODHUB. Wallet verification is not required for general app access.',
  },
  {
    n: '02',
    title: 'Choose how to participate',
    desc: 'Find community tasks, join campaigns, explore creators, or set up your own public creator page.',
  },
  {
    n: '03',
    title: 'Contribute and track activity',
    desc: 'Follow each activity’s requirements, submit work when needed, and track your tips and approved rewards from your dashboard.',
  },
];

const HIGHLIGHTS = [
  {
    icon: ListTodo,
    title: 'Community tasks',
    desc: 'Explore funded tasks, contribute, and submit proof for review.',
  },
  {
    icon: Megaphone,
    title: 'Campaigns',
    desc: 'Apply to campaigns and share completed work with organizers.',
  },
  {
    icon: Heart,
    title: 'Creator support',
    desc: 'Support creators directly with G$ on Celo.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex max-w-4xl animate-fade-up flex-col gap-8">
      <div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          How it works
        </span>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight max-md:text-2xl">
          From connecting to contributing
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One place to participate in community activities and support creators with G$ on Celo.
        </p>
      </div>

      <div className="grid gap-4">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-line bg-card p-5 max-md:grid-cols-1"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent">
                {s.n}
              </span>
              {i < STEPS.length - 1 && <span className="mt-8 hidden h-10 w-px bg-line md:block" />}
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h3 className="font-display text-base font-semibold">A hub for community participation</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl border border-line bg-background p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon size={16} />
                </div>
                <p className="mt-3 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
