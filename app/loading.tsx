export const metadata = {
  title: "Loading…",
};

export default function LoadingPage() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <p className="text-[12px] text-text-secondary animate-pulse">
          Loading…
        </p>
      </div>
    </div>
  );
}