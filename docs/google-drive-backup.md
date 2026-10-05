# Google Drive application backups

## Download without Google OAuth

Open **Dashboard → Download Complete Backup** or **Backups → Download Complete Backup**. An authenticated administrator can download all application records and ownership history as JSON without Google credentials. Upload this file manually to your chosen Google Drive account. The owner email in `src/config/backup-admins.ts` is authorized only when Clerk confirms it is the session user's verified primary email. Additional administrators can be configured through server-side `DATA_EXPORT_ADMIN_USER_IDS`. The download uses the existing database connection configured for that environment and requires no new Vercel environment variables for the code-configured owner. It never changes ownership or database records. Deploy through the existing GitHub integration before it is available on the production website.

Open **Backups** in the sidebar. The signed-in administrator connects Google and authorizes a single backup. All 12 application tables and `_user_reassign_backup_20260926` are copied into a new JSON file in the matching Google account's Drive. Ordinary users cannot make whole-application backups.

## Configuration

In Google Cloud Console, enable Google Drive API and configure the OAuth consent screen. Create an OAuth **Web application** client. Add the signed-in account as a test user if the consent screen is in testing mode.

Register these exact authorized redirect URIs as applicable:

- Local: `http://localhost:3000/api/backup/google/callback`
- Production: `https://YOUR-DEPLOYED-HOST/api/backup/google/callback`

Set these server-only environment variables in `.env.local` locally and in the deployment's environment settings for production:

```dotenv
GOOGLE_BACKUP_CLIENT_ID=<Google OAuth client ID>
GOOGLE_BACKUP_CLIENT_SECRET=<Google OAuth client secret>
GOOGLE_BACKUP_REDIRECT_URI=http://localhost:3000/api/backup/google/callback
DATA_EXPORT_ADMIN_USER_IDS=<trusted administrator Clerk user IDs, comma-separated>
```

Never commit credentials or use `NEXT_PUBLIC_` for these variables. Production must use the actual administrator ID from its Clerk instance. Restart the development server or redeploy after configuration.

The destination Google email must exactly match the Clerk account's verified primary email (case insensitive). Email is checked against Google userinfo on the server, not a frontend parameter. OAuth access tokens are used for this operation only and never stored; reconnect for subsequent backups. The scopes are `openid email drive.file`, allowing files created by this application without full Drive access.

## Data safety and limits

The database is accessed in a read-only repeatable-read transaction, with batches of 500 rows and explicit allowlisted columns. All current child tables have `user_id`; audited composite foreign keys preserve relationships. Backups preserve original owners; the recipient's Clerk identity is recorded separately as the backup requester. Secrets and authentication tables are excluded. Existing ownership history is included unchanged. This is an application-data snapshot, not a PostgreSQL schema or auth/storage dump.

The prepared file is restricted to the server, streamed to a Google resumable-upload session, and cleaned up on completion/failure. The current size limit is 128 MiB; larger exports fail explicitly. There is no scheduler or automatic restore. Google network failures require retrying the backup; incomplete uploads are never reported as successful. Existing Drive files are never overwritten, and files are not shared by this application.

Google setup reference: https://developers.google.com/identity/protocols/oauth2/web-server
Drive upload reference: https://developers.google.com/workspace/drive/api/guides/manage-uploads
