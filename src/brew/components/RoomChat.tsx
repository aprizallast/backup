import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText, Send, Users, ImagePlus, LockKeyhole } from 'lucide-react';
import { hasSupabase, insertMessage, fetchMessagesForRoom, fetchProfilesByUserIds, type RoomChatMode } from '@/lib/supabase';
import { UserButton } from '@/lib/auth/gates';
import { useAppAuth } from '@/lib/auth/provider';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { resolveProfileIdentity } from '@/lib/auth/profile-identity';
import {
  AGENTBREW_MINIMUM_HOLDING,
  AGENTBREW_TOKEN_CONTRACT,
  getAgentBrewHolding,
  hasRequiredAgentBrewHolding,
  isDeveloperOverrideEmail,
  setAgentBrewHolding,
} from '@/lib/community-access';

interface ChatMessage {
  id: string;
  roomId: string;
  sender: string;
  walletAddress: string;
  avatarUrl?: string;
  mode: RoomChatMode;
  text: string;
  createdAt: number;
  kind: 'user' | 'system';
}

interface RoomItem {
  id: string;
  name: string;
  description: string;
  members: number;
  imageUrl?: string;
  isCustom?: boolean;
  creatorId?: string;
  frozen?: boolean;
}

const STORAGE_KEY = 'agent_brew_chat_rooms_v1';
const CUSTOM_ROOMS_KEY = 'agent_brew_custom_rooms_v1';

const rooms: RoomItem[] = [
  { id: 'general', name: 'General', description: 'Macro market chatter', members: 126 },
  { id: 'token-watch', name: 'Token Watch', description: 'Fresh launch & breakout talk', members: 84 },
  { id: 'dev-room', name: 'Dev Room', description: 'Creator and dev signal thread', members: 42 },
  { id: 'alerts', name: 'Alerts', description: 'Risk & scam watchlist', members: 31 },
];

const seedMessages: Record<string, ChatMessage[]> = {
  general: [
    { id: 'seed-1', roomId: 'general', sender: 'BREW Bot', walletAddress: '0xBot', mode: 'wallet', text: 'Market pulse is fresh. Keep an eye on liquidity spikes and contract-level risk.', createdAt: Date.now() - 1000 * 60 * 7, kind: 'system' },
    { id: 'seed-2', roomId: 'general', sender: '0xAlpha', walletAddress: '0xA1...88f2', mode: 'wallet', text: 'Watching BNB launchpad flow—some fresh listings are showing healthy buy-side pressure.', createdAt: Date.now() - 1000 * 60 * 4, kind: 'user' },
  ],
  'token-watch': [
    { id: 'seed-3', roomId: 'token-watch', sender: '0xNova', walletAddress: '0xN2...4bb7', mode: 'wallet', text: 'Strong volume on the latest BNB token watchlist. Need more confirmation before calling it a breakout.', createdAt: Date.now() - 1000 * 60 * 10, kind: 'user' },
  ],
  'dev-room': [
    { id: 'seed-4', roomId: 'dev-room', sender: 'BREW Bot', walletAddress: '0xBot', mode: 'wallet', text: 'Single-dev launch patterns are still the cleanest setup if liquidity and holder behavior remain stable.', createdAt: Date.now() - 1000 * 60 * 12, kind: 'system' },
  ],
  alerts: [
    { id: 'seed-5', roomId: 'alerts', sender: '0xGuard', walletAddress: '0xG1...d9aa', mode: 'wallet', text: 'Watch for unusually high sell pressure and abrupt liquidity drop-offs.', createdAt: Date.now() - 1000 * 60 * 14, kind: 'user' },
  ],
};

function readRoomMessages(): Record<string, ChatMessage[]> {
  try {
    if (typeof localStorage === 'undefined') return seedMessages;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedMessages;
    const parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
    if (!parsed || typeof parsed !== 'object') return seedMessages;
    return { ...seedMessages, ...parsed };
  } catch {
    return seedMessages;
  }
}

function readCustomRooms(): RoomItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_ROOMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RoomItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

export function RoomChat() {
  const { user, isPending: isCheckingUser } = useCurrentUserState();
  const privy = useAppAuth();
  const profile = user
    ? {
        name: user.username || user.displayName || 'Community Member',
        walletAddress: user.id,
        mode: 'email' as const,
        imageUrl: user.profileImageUrl || undefined,
      }
    : null;
  const [selectedRoomId, setSelectedRoomId] = useState('general');
  const [draft, setDraft] = useState('');
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorForm, setCreatorForm] = useState({ title: '', description: '', imageUrl: '' });
  const [creatorError, setCreatorError] = useState('');
  const [roomMessages, setRoomMessages] = useState<Record<string, ChatMessage[]>>(() => readRoomMessages());
  const [customRooms, setCustomRooms] = useState<RoomItem[]>(() => readCustomRooms());
  const [isSyncing, setIsSyncing] = useState(false);
  const [holdBalance, setHoldBalance] = useState<number>(() => getAgentBrewHolding());
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const allRooms = useMemo(() => [...rooms, ...customRooms], [customRooms]);
  const hasAccess = hasRequiredAgentBrewHolding(holdBalance);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roomMessages));
  }, [roomMessages]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_ROOMS_KEY, JSON.stringify(customRooms));
  }, [customRooms]);

  useEffect(() => {
    setAgentBrewHolding(holdBalance);
  }, [holdBalance]);

  const selectedRoom = useMemo(
    () => allRooms.find((room) => room.id === selectedRoomId) ?? allRooms[0] ?? rooms[0],
    [allRooms, selectedRoomId],
  );

  const messages = roomMessages[selectedRoomId] ?? [];

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedRoomId, messages.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoomMessages() {
      if (!hasSupabase) return;
      setIsSyncing(true);
      try {
        const rows = await fetchMessagesForRoom(selectedRoomId);
        if (cancelled || rows.length === 0) return;
        const profiles = await fetchProfilesByUserIds(rows.map((row) => row.wallet_address));
        if (cancelled) return;
        const mapped = rows.map((row) => {
          const linkedProfile = profiles[row.wallet_address];
          const identity = resolveProfileIdentity(
            { displayName: row.sender, primaryEmail: linkedProfile?.primary_email },
            linkedProfile,
          );
          return {
            id: row.id,
            roomId: row.room_id,
            sender: identity.displayName,
            walletAddress: row.wallet_address,
            avatarUrl: identity.profileImageUrl || row.profile_image_url || undefined,
            mode: row.mode,
            text: row.text,
            createdAt: new Date(row.created_at).getTime(),
            kind: row.kind,
          };
        });
        setRoomMessages((prev) => ({ ...prev, [selectedRoomId]: mapped }));
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    }

    loadRoomMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedRoomId, user?.id, user?.displayName, user?.profileImageUrl]);

  const isDeveloperUser = isDeveloperOverrideEmail(user?.primaryEmail);
  const roomFrozen = Boolean(selectedRoom?.frozen) || (Boolean(selectedRoom?.isCustom) && !hasAccess && !isDeveloperUser);
  const createRoomDisabled = !profile || (!hasAccess && !isDeveloperUser);

  const handlePrivySignIn = async () => {
    if (Boolean(import.meta.env.VITE_PRIVY_APP_ID)) {
      await privy.login();
      return;
    }
    window.location.assign('/login');
  };

  const handleSend = async () => {
    if (!profile || roomFrozen) return;

    const text = draft.trim();
    if (!text) return;

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      roomId: selectedRoomId,
      sender: profile.name,
      walletAddress: profile.walletAddress,
      avatarUrl: user?.profileImageUrl ?? undefined,
      mode: profile.mode,
      text,
      createdAt: Date.now(),
      kind: 'user',
    };

    setRoomMessages((prev) => ({
      ...prev,
      [selectedRoomId]: [...(prev[selectedRoomId] ?? []), message],
    }));
    setDraft('');

    if (hasSupabase) {
      await insertMessage({
        room_id: selectedRoomId,
        sender: profile.name,
        wallet_address: profile.walletAddress,
        profile_image_url: user?.profileImageUrl || undefined,
        mode: profile.mode,
        text,
        kind: 'user',
      });
    }
  };

  const handleCreateRoom = () => {
    if (!profile) return;
    const title = creatorForm.title.trim();
    const description = creatorForm.description.trim();
    const imageUrl = creatorForm.imageUrl.trim();

    if (!title || !description) {
      setCreatorError('Room title and description are required.');
      return;
    }

    if (!hasAccess && !isDeveloperUser) {
      setCreatorError('Room creation is still developing for regular users. Please contact the developer to enable this feature.');
      return;
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `room-${Date.now()}`;
    const roomId = `${slug}-${Date.now()}`;

    const newRoom: RoomItem = {
      id: roomId,
      name: title,
      description,
      members: 1,
      imageUrl: imageUrl || '',
      isCustom: true,
      creatorId: profile.walletAddress,
      frozen: false,
    };

    setCustomRooms((prev) => [newRoom, ...prev]);
    setSelectedRoomId(roomId);
    setCreatorForm({ title: '', description: '', imageUrl: '' });
    setCreatorError('');
    setCreatorOpen(false);
  };

  return (
    <div className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_50px_rgba(15,23,42,0.28)] sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-copper)]">
            <MessageSquareText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-[-0.04em] text-[var(--color-ink)]">Community Rooms</h2>
            <p className="text-[11px] text-[var(--color-muted)]">Token signals, dev chatter, and room updates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCheckingUser ? (
            <span className="text-xs text-[var(--color-muted)]">Checking account...</span>
          ) : profile ? (
            <UserButton />
          ) : (
            <button type="button" onClick={() => void handlePrivySignIn()} className="btn btn-solid h-9">Create account / Sign in</button>
          )}
        </div>
      </div>

      {!isCheckingUser && !profile && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-sm">
          <span className="text-[var(--color-muted)]">Sign in to send messages.</span>
          <button type="button" onClick={() => void handlePrivySignIn()} className="text-[var(--color-copper)] hover:underline">Use Privy sign in</button>
        </div>
      )}

      {profile && (
        <div className="mb-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-[var(--color-paper-ink)]">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--color-paper-ink)]/80">
              $AGENTBREW gate
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-muted)]">
              <span>{holdBalance.toLocaleString()} / {AGENTBREW_MINIMUM_HOLDING.toLocaleString()}</span>
              <span className={hasAccess || isDeveloperUser ? 'text-emerald-400' : 'text-amber-300'}>
                {isDeveloperUser ? 'Dev override' : hasAccess ? 'Access OK' : 'Need 24M'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <span>Demo balance</span>
              <input
                type="number"
                min={0}
                value={holdBalance}
                onChange={(event) => setHoldBalance(Number(event.target.value) || 0)}
                className="w-24 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-ink)] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              disabled={createRoomDisabled}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-copper)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5 text-[var(--color-copper)]" />
              Create room
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-muted)]">
            {isDeveloperUser
              ? 'Developer override enabled for room creation and custom room management.'
              : `Custom room creation unlocks for holders of at least 24M $AGENTBREW at ${AGENTBREW_TOKEN_CONTRACT}. If the balance falls below the threshold, custom rooms freeze automatically.`}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-[var(--color-paper-ink)]">
          {allRooms.map((room) => {
            const active = room.id === selectedRoomId;
            return (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                  active
                    ? 'border-[var(--color-copper)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]'
                    : 'border-[var(--color-line)] bg-transparent text-[var(--color-paper-ink)] hover:border-[var(--color-copper)]/60'
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] text-[10px] font-bold text-[var(--color-copper)]">
                  {room.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[var(--color-paper-ink)]">#{room.name}</span>
                    {room.isCustom && (
                      <span className={`rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.14em] ${
                        room.frozen
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      }`}>
                        {room.frozen ? 'Frozen' : 'Owner'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-muted)]">
                    <span>{room.members} members</span>
                    {room.isCustom && room.frozen && <span className="text-amber-300">Frozen</span>}
                    {room.isCustom && !room.frozen && <span className="text-emerald-400">Live</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-[var(--color-paper-ink)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-paper-ink)]/70">Current room</p>
              <h3 className="text-lg font-bold tracking-[-0.02em] text-[var(--color-paper-ink)]">#{selectedRoom.name}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
                roomFrozen
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}>
                {roomFrozen ? 'Frozen' : 'Live'}
              </span>
              <span className="flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-muted)]">
                <Users className="h-3.5 w-3.5" />
                {selectedRoom.members}
              </span>
            </div>
          </div>

          {roomFrozen && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <LockKeyhole className="h-3.5 w-3.5" />
              This room is frozen because the holder no longer meets the 24M $AGENTBREW requirement.
            </div>
          )}

          <div className="space-y-3 overflow-y-auto pb-3 pr-1 max-h-[440px]">
            {isSyncing && hasSupabase && (
              <div className="rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
                Syncing room messages...
              </div>
            )}
            {messages.map((message) => {
              const isOwn = profile && message.sender === profile.name;
              const initials = getInitials(message.sender);
              return (
                <div key={message.id} className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  {!isOwn && (
                    <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-ink)]">
                      {message.avatarUrl ? (
                        <img src={message.avatarUrl} alt={message.sender} className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl border px-3 py-2 ${
                      isOwn
                        ? 'border-emerald-500/60 bg-[#123a33] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                        : message.kind === 'system'
                          ? 'border-cyan-500/50 bg-[#123b40] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                          : 'border-[var(--color-line)] bg-[#171b1d] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-300">
                      <span className="font-semibold text-white">{message.sender}</span>
                      {message.mode === 'wallet' && message.walletAddress && <span className="text-slate-300">{message.walletAddress}</span>}
                    </div>
                    <p className="text-sm leading-relaxed text-white">{message.text}</p>
                  </div>
                  {isOwn && (
                    <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-200">
                      {profile?.imageUrl ? (
                        <img src={profile.imageUrl} alt={profile.name ?? 'You'} className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messageEndRef} />
          </div>

          <div className="sticky bottom-0 mt-3 border-t border-[var(--color-line)] bg-[var(--color-paper)] pt-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSend();
                }}
                placeholder={
                  roomFrozen
                    ? 'This room is frozen until the 24M gate is restored.'
                    : profile
                      ? 'Share a token signal or dev insight...'
                      : 'Join the room to post a message'
                }
                disabled={!profile || isCheckingUser || roomFrozen}
                className="flex-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!profile || isCheckingUser || !draft.trim() || roomFrozen}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-copper)] px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {creatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--color-muted)]">Create room</p>
                <h3 className="text-xl font-bold text-[var(--color-ink)]">Custom room</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreatorOpen(false);
                  setCreatorError('');
                }}
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-muted)]"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--color-muted)]">Room title</span>
                <input
                  value={creatorForm.title}
                  onChange={(event) => setCreatorForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="e.g. Alpha Signals"
                  className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-sm text-[var(--color-paper-ink)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--color-muted)]">Image URL</span>
                <input
                  value={creatorForm.imageUrl}
                  onChange={(event) => setCreatorForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-sm text-[var(--color-paper-ink)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="text-[var(--color-muted)]">Description</span>
                <textarea
                  value={creatorForm.description}
                  onChange={(event) => setCreatorForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Tell the community what this room is for..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-sm text-[var(--color-paper-ink)] outline-none placeholder:text-[var(--color-muted)]"
                />
              </label>

              {!hasAccess && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  Need 24M $AGENTBREW to create a custom room.
                </div>
              )}

              {creatorError && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">{creatorError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCreatorOpen(false);
                    setCreatorError('');
                  }}
                  className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-paper-ink)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={!hasAccess}
                  className="rounded-xl bg-[var(--color-copper)] px-3 py-2 text-sm font-bold text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
