'use client';

import { useState } from 'react';
import { User, Check, Loader2 } from 'lucide-react';
import { useCreator } from '@/providers/CreatorProvider';
import { useSaveProfile } from '@/hooks/useSaveProfile';

const BIO_MAX = 280;

const inputClass =
  'w-full rounded-lg border border-line bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-foreground/40 outline-none';

export default function SettingsForm() {
  const { creator, setCreator } = useCreator();
  const { saveProfile, isOnChain, regStatus, regError } = useSaveProfile();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const bioLength = (creator.bio || '').length;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCreator({ ...creator, [name]: value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await saveProfile(creator);
      if (ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2200);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl animate-fade-up flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your public profile. The username is registered on-chain.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <User size={17} className="text-muted-foreground" />
          <h3 className="font-display text-[15px] font-semibold">Profile</h3>
          {isOnChain && (
            <span className="ml-auto rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
              On-chain
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Display name
            </label>
            <input id="name" name="name" type="text" value={creator.name || ''} onChange={handleInputChange} placeholder="e.g. Nuwayama" className={inputClass} />
          </div>

          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Username
            </label>
            <div className="flex items-center overflow-hidden rounded-lg border border-line bg-background transition-colors focus-within:border-foreground/40">
              <span className="pl-3.5 font-mono text-sm text-muted-foreground/60">tip/</span>
              <input id="username" name="username" type="text" value={creator.username || ''} onChange={handleInputChange} placeholder="username" className="w-full bg-transparent px-1.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60" />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="bio" className="text-xs font-semibold text-muted-foreground">Bio</label>
              <span className={`font-mono text-[10px] ${bioLength > BIO_MAX ? 'text-danger' : 'text-muted-foreground/60'}`}>
                {bioLength}/{BIO_MAX}
              </span>
            </div>
            <textarea id="bio" name="bio" value={creator.bio || ''} onChange={handleInputChange} maxLength={BIO_MAX + 20} placeholder="What does fan support help you achieve?" className={`${inputClass} min-h-22 resize-y`} />
          </div>

          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div>
              <label htmlFor="youtube" className="mb-1.5 block text-xs font-semibold text-muted-foreground">YouTube</label>
              <input id="youtube" name="youtube" type="text" value={creator.youtube || ''} onChange={handleInputChange} placeholder="Channel URL" className={inputClass} />
            </div>
            <div>
              <label htmlFor="twitter" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Twitter / X</label>
              <input id="twitter" name="twitter" type="text" value={creator.twitter || ''} onChange={handleInputChange} placeholder="Profile URL" className={inputClass} />
            </div>
          </div>

          {creator.wallet_address && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Celo wallet</label>
              <input type="text" readOnly value={creator.wallet_address} className={`${inputClass} cursor-default font-mono text-xs text-muted-foreground`} />
            </div>
          )}

          {regError && (
            <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-xs font-medium text-danger">{regError}</p>
          )}

          <button
            type="submit"
            disabled={saving || regStatus === 'pending'}
            className={`mt-1 flex h-10 w-fit items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-all disabled:opacity-60 ${
              saveSuccess ? 'bg-success text-white' : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {regStatus === 'pending' ? (<><Loader2 size={15} className="animate-spin" />Confirm in wallet…</>)
              : saving ? (<><Loader2 size={15} className="animate-spin" />Saving…</>)
              : saveSuccess ? (<><Check size={15} />Saved</>)
              : isOnChain ? 'Save changes' : 'Register & save'}
          </button>
        </form>
      </section>
    </div>
  );
}
