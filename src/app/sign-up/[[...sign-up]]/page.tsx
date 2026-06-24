import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Catalyst</h1>
          <p className="text-sm text-muted-foreground">
            Create your workspace account
          </p>
        </div>
        <SignUp />
      </div>
    </main>
  );
}
