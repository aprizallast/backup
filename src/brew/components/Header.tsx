import React from 'react';
import { useAppAuth } from '@/lib/auth/provider';
import { signOut as signOutBetterAuth } from '@/lib/auth/client';
import { Language, VisitorStats } from '../types.ts';
import { I18N } from '../i18n.ts';
import { copyToClipboard } from '../utils/format.ts';
import { Copy, RefreshCw, ExternalLink, Check, Moon, Sun, ShieldAlert, User, LogOut, Star } from 'lucide-react';
import brewOfficialLogo from '../assets/images/brew_agent_logo_1789743336149.jpg';
import { VisitorBadge } from './VisitorBadge.tsx';
import type { FavoriteToken } from '@/lib/thesis/thesis-store';
import {
  isDeveloperOverrideEmail,
  isDisplayNameTaken,
  prepareProfileImageForStorage,
  reserveDisplayName,
  normalizeDisplayName,
} from '@/lib/community-access';
import {
  fetchUserAppPreferences,
  hasSupabase,
  saveUserAppPreferences,
  upsertProfile,
} from '@/lib/supabase';
import { publishProfileIdentityUpdate } from '@/lib/auth/profile-identity';

interface HeaderProps {
  totalCount: number;
  factoryAddress: string;
  lang: Language;
  onSetLang: (lang: Language) => void;
  isSyncing: boolean;
  onSync: () => void;
  onShowToast: (msg: string) => void;
  visitorStats: VisitorStats;
  onOpenTokenSniffer?: () => void;
  user?: { username?: string | null; displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null; id?: string; isDevFallback?: boolean } | null;
  favoriteToken?: FavoriteToken | null;
  onClearFavoriteToken?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalCount,
  factoryAddress,
  lang,
  onSetLang,
  isSyncing,
  onSync,
  onShowToast,
  visitorStats,
  onOpenTokenSniffer,
  user,
  favoriteToken,
  onClearFavoriteToken,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = React.useState(false);
  const [usernameWarning, setUsernameWarning] = React.useState('');
  const [profileSettings, setProfileSettings] = React.useState<{ displayName: string; primaryEmail: string; profileImageUrl: string }>({
    displayName: user?.username || user?.displayName || '',
    primaryEmail: user?.primaryEmail || '',
    profileImageUrl: user?.profileImageUrl || '',
  });
  const privy = useAppAuth();
  const avatarUrl = profileSettings.profileImageUrl || user?.profileImageUrl || '';
  const displayName = profileSettings.displayName || user?.username || user?.displayName || 'Profile';
  const displayEmail = user?.primaryEmail || profileSettings.primaryEmail || 'Privy user';
  const isDevRole = isDeveloperOverrideEmail(displayEmail) || isDeveloperOverrideEmail(user?.primaryEmail);

  React.useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  React.useEffect(() => {
    if (!user?.id || !hasSupabase) return;
    let cancelled = false;
    void fetchUserAppPreferences(user.id).then((preferences) => {
      if (cancelled || !preferences) return;
      setTheme(preferences.theme);
      document.documentElement.dataset.theme = preferences.theme;
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  React.useEffect(() => {
    if (profileEditorOpen) return;

    setProfileSettings((current) => ({
      ...current,
      displayName: user?.username || user?.displayName || '',
      primaryEmail: user?.primaryEmail || '',
      profileImageUrl: user?.profileImageUrl || '',
    }));
  }, [profileEditorOpen, user?.id, user?.username, user?.displayName, user?.primaryEmail, user?.profileImageUrl]);

  React.useEffect(() => {
    if (!profileEditorOpen) return;

    setProfileSettings({
      displayName: user?.username || user?.displayName || '',
      primaryEmail: user?.primaryEmail || '',
      profileImageUrl: user?.profileImageUrl || '',
    });
  }, [profileEditorOpen, user?.id, user?.username, user?.displayName, user?.primaryEmail, user?.profileImageUrl]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('agent-brew-theme', next);
    if (user?.id && hasSupabase) {
      void saveUserAppPreferences(user.id, { theme: next, language: lang });
    }
  };
  const dict = I18N[lang] || I18N.en;

  const handleCopyFactory = async () => {
    const ok = await copyToClipboard(factoryAddress);
    if (ok) {
      setCopied(true);
      onShowToast(dict.copyFactorySuccess || 'BrewFactory address copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const persistProfile = async (next: { displayName: string; primaryEmail: string; profileImageUrl: string }) => {
    const safeNext = {
      ...next,
      displayName: next.displayName.trim(),
      primaryEmail: next.primaryEmail.trim(),
      profileImageUrl: prepareProfileImageForStorage(next.profileImageUrl),
    };
    setProfileSettings(safeNext);

    if (!user?.id) return true;

    const synced = !hasSupabase || await upsertProfile({
      userId: user.id,
      username: normalizeDisplayName(safeNext.displayName),
      name: safeNext.displayName,
      displayName: safeNext.displayName,
      primaryEmail: user.primaryEmail || safeNext.primaryEmail,
      profileImageUrl: safeNext.profileImageUrl,
      wallet_address: user.id,
      mode: 'email',
    });

    if (synced) {
      publishProfileIdentityUpdate({
        userId: user.id,
        username: safeNext.displayName ? normalizeDisplayName(safeNext.displayName) : null,
        displayName: safeNext.displayName || null,
        primaryEmail: user.primaryEmail || null,
        profileImageUrl: safeNext.profileImageUrl || null,
      });
    }
    return synced;
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      onShowToast('Image is too large. Please upload a smaller avatar under 2 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextUrl = typeof reader.result === 'string' ? prepareProfileImageForStorage(reader.result) : '';
      if (!nextUrl) return;

      const next = {
        ...profileSettings,
        profileImageUrl: nextUrl,
      };

      void persistProfile(next).then((saved) => {
        if (!saved) onShowToast('Avatar updated here, but Supabase sync failed. Please try again.');
      });
      event.target.value = '';
    };
    reader.onerror = () => {
      onShowToast('Unable to read the selected image. Please try another file.');
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    const nextName = profileSettings.displayName.trim();
    const nextEmail = profileSettings.primaryEmail.trim();
    const nextImage = profileSettings.profileImageUrl.trim();

    if (!nextName) {
      setUsernameWarning('Username cannot be empty.');
      onShowToast('Username cannot be empty.');
      return;
    }

    if (nextName.includes('@')) {
      setUsernameWarning('Username cannot be an email address.');
      onShowToast('Username cannot be an email address.');
      return;
    }

    if (nextName.length < 3) {
      setUsernameWarning('Username must be at least 3 characters.');
      onShowToast('Username must be at least 3 characters.');
      return;
    }

    const currentName = user?.displayName ?? '';
    const normalizedNext = normalizeDisplayName(nextName);
    const normalizedCurrent = normalizeDisplayName(currentName);

    if (
      (!hasSupabase || !user?.id) &&
      ((normalizedNext !== normalizedCurrent && isDisplayNameTaken(nextName, currentName)) ||
        !reserveDisplayName(nextName, currentName))
    ) {
      setUsernameWarning('That username is already used. Please choose another one.');
      onShowToast('That username is already used. Please choose another one.');
      return;
    }

    setUsernameWarning('');
    const payload = {
      displayName: nextName,
      primaryEmail: nextEmail,
      profileImageUrl: nextImage,
    };
    const synced = await persistProfile(payload);
    if (!synced) {
      onShowToast('Profile is updated here, but Supabase sync failed. Please try again.');
      return;
    }
    setProfileEditorOpen(false);
    onShowToast('Profile updated.');
  };

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'zh', label: 'ZH' },
    { code: 'ja', label: 'JA' }
  ];

  return (
    <header className="relative z-10 flex flex-col gap-5 mb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-center gap-4 min-w-0">
        <img
          src={brewOfficialLogo}
          alt=""
          className="h-14 w-14 rounded-[18px] object-cover shrink-0"
          referrerPolicy="no-referrer"
        />
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[1.65rem] leading-none tracking-[-0.04em] font-medium text-[var(--color-ink)]">
              Agent <span className="font-semibold">BREW</span>
            </h1>
            <span className="hidden sm:inline text-[11px] tracking-[0.18em] uppercase text-[var(--color-copper)]">
              BNB · 56
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--color-muted)]">
            <span className="num text-[var(--color-ink)]">
              {totalCount.toLocaleString()}{' '}
              <span className="font-sans text-[var(--color-muted)] font-normal">
                {lang === 'zh' ? '代币' : lang === 'ja' ? 'トークン' : 'tokens'}
              </span>
            </span>
            <button
              onClick={handleCopyFactory}
              className="inline-flex items-center gap-1.5 hover:text-[var(--color-ink)]"
              title="Copy factory"
            >
              <span className="num">{factoryAddress.slice(0, 6)}…{factoryAddress.slice(-4)}</span>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-up)]" />
              {dict.dbStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <VisitorBadge stats={visitorStats} lang={lang} />
        <div className="inline-flex h-10 items-center rounded-full border border-[var(--color-line)] p-1">
          {languages.map(l => (
            <button
              key={l.code}
              onClick={() => onSetLang(l.code)}
              className={`h-8 min-w-10 rounded-full px-2.5 text-[12px] font-medium ${
                lang === l.code
                  ? 'bg-[var(--color-paper)] text-[var(--color-paper-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={toggleTheme} className="btn h-10 w-10 justify-center px-0" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {onOpenTokenSniffer && (
          <button
            onClick={onOpenTokenSniffer}
            className="btn border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
            title="TokenSniffer Security & Smell Test Checker"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono text-xs">TokenSniffer</span>
          </button>
        )}
        <button onClick={onSync} disabled={isSyncing} className="btn">
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isSyncing ? dict.syncing : dict.syncBtn}</span>
        </button>
        <a
          href="https://brew.family"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-solid"
        >
          brew.family
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <div className="relative">
          {user && !user.isDevFallback ? (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 text-left"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-paper)] text-[11px] font-semibold text-[var(--color-paper-ink)]">
                    {(displayName || 'U').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="hidden min-w-0 text-left sm:block">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[11px] font-medium text-[var(--color-ink)]">{displayName}</span>
                    {isDevRole && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[8px] font-black tracking-[0.12em] text-white shadow-[0_0_0_2px_rgba(16,185,129,0.18)]">
                        DEV
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10px] text-[var(--color-muted)]">{favoriteToken ? `Favorite ${favoriteToken.symbol}` : 'No favorite token'}</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-2xl shadow-black/30">
                  <div className="mb-2 flex items-center gap-2 border-b border-[var(--color-line)] px-2 pb-2">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-paper)] text-sm font-semibold text-[var(--color-paper-ink)]">
                        {(displayName || 'U').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--color-ink)]">{displayName}</span>
                        {isDevRole && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[8px] font-black tracking-[0.12em] text-white shadow-[0_0_0_2px_rgba(16,185,129,0.18)]">
                            DEV
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-[var(--color-muted)]">{displayEmail}</div>
                    </div>
                  </div>
                  {favoriteToken && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs text-amber-100">
                      <Star className="h-3.5 w-3.5" />
                      <span className="truncate">Favorite: {favoriteToken.symbol}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileEditorOpen((open) => !open);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
                  >
                    <User className="h-4 w-4 text-[var(--color-muted)]" />
                    Edit profile
                  </button>
                  {profileEditorOpen && (
                    <div className="mt-2 space-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-field)] p-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-muted)]">Username</label>
                        <input
                          value={profileSettings.displayName}
                          onChange={(event) => {
                            setProfileSettings(prev => ({ ...prev, displayName: event.target.value }));
                            setUsernameWarning('');
                          }}
                          className={`w-full rounded-lg border px-2 py-1.5 text-xs text-[var(--color-ink)] outline-none ${usernameWarning ? 'border-red-500/70 bg-red-950/10' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}
                        />
                        {usernameWarning && (
                          <div className="text-[10px] font-medium text-red-300">{usernameWarning}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-muted)]">Email</label>
                        <input
                          value={user?.primaryEmail || profileSettings.primaryEmail}
                          readOnly
                          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-ink)] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-muted)]">Avatar URL</label>
                        <input
                          value={profileSettings.profileImageUrl}
                          onChange={(event) => setProfileSettings(prev => ({ ...prev, profileImageUrl: event.target.value }))}
                          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-ink)] outline-none"
                          placeholder="https://..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] font-mono font-bold text-[var(--color-ink)]">
                          Upload image
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        </label>
                        <button type="button" onClick={saveProfile} className="ml-auto rounded-lg bg-[var(--color-copper)] px-2.5 py-1.5 text-[10px] font-bold text-stone-950">
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onClearFavoriteToken?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
                  >
                    <Star className="h-4 w-4 text-amber-300" />
                    Clear favorite token
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      try {
                        if (privy.authenticated) {
                          await privy.logout();
                        } else {
                          await signOutBetterAuth();
                        }
                      } catch (error) {
                        onShowToast(error instanceof Error ? error.message : 'Could not sign out. Please retry.');
                      }
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[var(--color-paper)]"
                  >
                    <LogOut className="h-4 w-4 text-[var(--color-muted)]" />
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={async () => {
                if (Boolean(import.meta.env.VITE_PRIVY_APP_ID)) {
                  await privy.login();
                } else {
                  window.location.href = '/login';
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-ink)]"
            >
              <User className="h-4 w-4" />
              {Boolean(import.meta.env.VITE_PRIVY_APP_ID) ? 'Log in' : 'Account'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
