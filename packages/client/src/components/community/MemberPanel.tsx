import { PresenceIndicator } from './PresenceIndicator';

interface MemberInfo {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

interface MemberPanelProps {
  members: Array<{ userId: string; name: string; email: string; avatarUrl?: string | null }>;
  onlineUserIds: Set<string>;
  onStartDM: (userId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MemberPanel({ members, onlineUserIds, onStartDM }: MemberPanelProps) {
  const onlineMembers: MemberInfo[] = [];
  const offlineMembers: MemberInfo[] = [];

  for (const member of members) {
    if (onlineUserIds.has(member.userId)) {
      onlineMembers.push(member);
    } else {
      offlineMembers.push(member);
    }
  }

  return (
    <aside
      className="w-60 flex-shrink-0 bg-surface-1 flex flex-col overflow-hidden shadow-[-1px_0_12px_rgba(0,0,0,0.4)]"
      style={{ background: 'linear-gradient(180deg, #141416 0%, #111113 100%)' }}
    >
      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-thumb-surface-3">
        {/* Online members */}
        <div className="px-3 mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-1 mb-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
            Online
            <span className="text-accent ml-auto">{onlineMembers.length}</span>
          </h3>
          <div className="space-y-px">
            {onlineMembers.map((member, index) => (
              <button
                key={member.userId}
                type="button"
                onClick={() => onStartDM(member.userId)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-text-primary hover:bg-surface-2/30 hover:-translate-y-0.5 transition-all duration-200 ease-spring group animate-slide-up"
                style={{ animationDelay: `${index * 40}ms` }}
                title={`Message ${member.name}`}
              >
                <div className="relative flex-shrink-0">
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover shadow-[0_0_8px_rgba(52,211,153,0.2)]"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent/25 to-amber-600/25 flex items-center justify-center shadow-[0_0_8px_rgba(52,211,153,0.2)]">
                      <span className="text-[10px] font-semibold text-accent">
                        {getInitials(member.name)}
                      </span>
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceIndicator isOnline size="sm" />
                  </span>
                </div>
                <span className="truncate group-hover:text-accent transition-colors duration-200">
                  {member.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Offline members */}
        {offlineMembers.length > 0 && (
          <div className="px-3 mb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-1 mb-1.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-text-tertiary/50" />
              Offline
              <span className="ml-auto">{offlineMembers.length}</span>
            </h3>
            <div className="space-y-px">
              {offlineMembers.map((member, index) => (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => onStartDM(member.userId)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-text-secondary hover:bg-surface-2/30 hover:-translate-y-0.5 transition-all duration-200 ease-spring group opacity-60 hover:opacity-100 animate-slide-up"
                  style={{ animationDelay: `${index * 40}ms` }}
                  title={`Message ${member.name}`}
                >
                  <div className="relative flex-shrink-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover opacity-60 grayscale"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-surface-3/50 flex items-center justify-center opacity-60 grayscale">
                        <span className="text-[10px] font-semibold text-text-tertiary">
                          {getInitials(member.name)}
                        </span>
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <PresenceIndicator isOnline={false} size="sm" />
                    </span>
                  </div>
                  <span className="truncate group-hover:text-text-primary transition-colors duration-200">
                    {member.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
