"use client";

import { UserButton } from "@clerk/nextjs";
import { Download } from "lucide-react";
import { DownloadDataButton } from "@/components/download-data-button";

function DownloadMyData() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">My data</h2>
      <p className="text-sm text-muted-foreground">Download your account information and all your application records as one JSON file.</p>
      <DownloadDataButton />
    </div>
  );
}

export function AccountButton({ showName = false }: { showName?: boolean }) {
  return (
    <UserButton showName={showName}>
      <UserButton.UserProfilePage label="My data" url="my-data" labelIcon={<Download className="size-4" />}>
        <DownloadMyData />
      </UserButton.UserProfilePage>
    </UserButton>
  );
}
