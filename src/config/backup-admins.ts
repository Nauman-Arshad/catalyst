// Trusted application-owner emails. Changes require a reviewed code deployment.
// Runtime authorization also requires a verified primary email from Clerk.
export const backupAdminEmails: readonly string[] = ["inoonmr@gmail.com"];

// Trusted Clerk user ids, for owners whose account lives in a Clerk instance
// whose emails aren't listed above (production uses a different instance).
export const backupAdminUserIds: readonly string[] = ["user_3FbQyBqk7Txc9ipqOy3mRRAntwP"];
