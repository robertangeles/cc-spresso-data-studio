interface TypingIndicatorProps {
  users: Array<{ userId: string; name: string }>;
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  let text: string;
  if (users.length === 1) {
    text = `${users[0].name} is typing`;
  } else if (users.length === 2) {
    text = `${users[0].name} and ${users[1].name} are typing`;
  } else {
    text = `${users[0].name} and ${users.length - 1} others are typing`;
  }

  return (
    <div className="flex items-center gap-2.5 px-4 py-1.5 animate-slide-up">
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-2/60 backdrop-blur-sm">
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_4px_rgba(255,214,10,0.4)] animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_4px_rgba(255,214,10,0.4)] animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_4px_rgba(255,214,10,0.4)] animate-bounce [animation-delay:300ms]" />
        </span>
        <span className="text-xs text-text-tertiary ml-1">{text}</span>
      </span>
    </div>
  );
}
