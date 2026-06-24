import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f5f3ff] px-6 text-center">
      <div className="flex items-center gap-2 text-2xl font-bold text-purple-600">
        <span className="text-3xl">⬡</span> Catalyst
      </div>
      <p className="mt-8 text-6xl font-bold text-purple-600">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </main>
  );
}
