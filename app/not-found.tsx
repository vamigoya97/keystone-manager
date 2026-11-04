"use client";

import { useRouter } from "next/navigation";

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <main className="content-layer min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-[24px] font-bold text-text-primary mb-2">
          Page not found
       1</h1>
        <p className="text-[13px] text-text-secondary mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="glass rounded-xl px-5 py-2.5 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Go back
          </button>
          <button
            onClick={() => router.push("/")}
            className="glass rounded-xl px-5 py-2.5 text-[12px] text-accent hover:text-text-primary transition-colors"
          >
            Home
          </button>
        </div>
      </div>
    </main>
  );
}