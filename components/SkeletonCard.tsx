export default function SkeletonCard() {
  return (
    <div className="skeleton-pulse flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-[var(--panel)] rounded-xl p-4 border border-[var(--border)]"
        >
          <div className="flex items-center justify-between gap-4">
            {/* 홈팀 */}
            <div className="flex items-center gap-2 flex-1">
              <div className="w-10 h-10 rounded-full bg-[var(--panel2)]" />
              <div className="h-4 w-24 rounded bg-[var(--panel2)]" />
            </div>
            {/* 중앙 */}
            <div className="flex flex-col items-center gap-1 w-16">
              <div className="h-4 w-10 rounded bg-[var(--panel2)]" />
              <div className="h-3 w-12 rounded bg-[var(--panel2)]" />
            </div>
            {/* 원정팀 */}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="h-4 w-24 rounded bg-[var(--panel2)]" />
              <div className="w-10 h-10 rounded-full bg-[var(--panel2)]" />
            </div>
          </div>
          <div className="mt-3 h-3 w-32 rounded bg-[var(--panel2)] mx-auto" />
        </div>
      ))}
    </div>
  );
}
