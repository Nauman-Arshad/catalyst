import { currentUser } from "@clerk/nextjs/server";
import { GoogleBackupButton } from "@/components/google-backup-button";
import { DownloadBackupButton } from "@/components/download-backup-button";
import { isDataExportAdmin } from "@/lib/export-admin";

const messages: Record<string, string> = {
  saved: "Your complete application backup has been saved to Google Drive.",
  failed: "The backup could not be completed. Please try again. No database records were changed.",
  invalid: "Your backup session expired or could not be verified. Please start again.",
  cancelled: "Google Drive backup was cancelled.",
  "email-mismatch": "Select the Google account matching your verified primary application email. Nothing was uploaded.",
};

export default async function BackupsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await currentUser();
  const userId = user?.id;
  const email = user?.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  const { status } = await searchParams;
  return <section className="max-w-2xl space-y-5">
    <h1 className="text-2xl font-semibold text-gray-900">Backups</h1>
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600">Save all application records and ownership history as a JSON snapshot. IDs, relationships, timestamps, and ownership stay unchanged.</p>
      <p className="text-sm text-gray-600">This administrator-only backup contains every user’s application records. Download it directly, then upload the file to Google Drive yourself. No Google connection is needed for downloads.</p>
      {status && messages[status] && <p role="status" className={status === "saved" ? "text-sm text-green-700" : "text-sm text-red-700"}>{messages[status]}</p>}
      {isDataExportAdmin(userId, email) ? <div className="space-y-6">
        <DownloadBackupButton />
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">Optional: upload directly using a configured Google connection and your matching verified email.</p>
          {isDataExportAdmin(userId) ? <GoogleBackupButton /> : <p className="text-sm text-gray-600">Direct Google uploads require additional Google configuration. The complete download works without it.</p>}
        </div>
      </div> : <div className="space-y-2 text-sm text-gray-600">
        <p>Ask the application administrator to enable backup access for your account.</p>
        <p>Your signed-in account ID: <code>{userId}</code></p>
      </div>}
    </div>
  </section>;
}
