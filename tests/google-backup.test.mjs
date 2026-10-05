import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import postgres from 'postgres';

const source = readFileSync(new URL('../src/lib/google-backup.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const backup = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const config = { clientId: 'test-client', clientSecret: 'test-secret', redirectUri: 'https://example.com/api/backup/google/callback', origin: 'https://example.com' };

test('OAuth state binds to the signed-in administrator and rejects tampering and expiry', () => {
  const state = { userId: 'admin-a', nonce: 'nonce-a', verifier: 'verifier', expires: Date.now() + 60000 };
  const cookie = backup.signBackupState(state, config.clientSecret);
  assert.deepEqual(backup.verifyBackupState(cookie, 'nonce-a', 'admin-a', config.clientSecret), state);
  assert.equal(backup.verifyBackupState(cookie, 'nonce-a', 'admin-b', config.clientSecret), null);
  assert.equal(backup.verifyBackupState(cookie, 'nonce-b', 'admin-a', config.clientSecret), null);
  assert.equal(backup.verifyBackupState(cookie + 'x', 'nonce-a', 'admin-a', config.clientSecret), null);
  assert.equal(backup.verifyBackupState(backup.signBackupState({ ...state, expires: Date.now() - 1 }, config.clientSecret), 'nonce-a', 'admin-a', config.clientSecret), null);
});

test('Google authorization uses limited file scope, PKCE, and no client secret', () => {
  const result = backup.createGoogleAuthorization('admin-a', 'owner@example.com', config);
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.get('access_type'), 'online');
  assert.ok(backup.verifyBackupState(result.cookie, url.searchParams.get('state'), 'admin-a', config.clientSecret));
});

test('only the matching verified Google email is accepted', () => {
  assert.equal(backup.matchingBackupEmail({ email: 'Owner@Example.com', email_verified: true }, 'owner@example.com'), true);
  assert.equal(backup.matchingBackupEmail({ email: 'other@example.com', email_verified: true }, 'owner@example.com'), false);
  assert.equal(backup.matchingBackupEmail({ email: 'owner@example.com', email_verified: false }, 'owner@example.com'), false);
  assert.equal(backup.matchingBackupEmail({ email: 'owner@example.com', email_verified: 'true' }, 'owner@example.com'), false);
});

test('snapshot upload rejects non-Google and redirected destinations', () => {
  assert.equal(backup.validUploadUrl('https://www.googleapis.com/upload/drive/v3/files?upload_id=test'), true);
  for (const url of ['https://evil.example/upload/drive/v3/files', 'http://www.googleapis.com/upload/drive/v3/files', 'https://www.googleapis.com.evil.example/upload/drive/v3/files', 'https://user@www.googleapis.com/upload/drive/v3/files']) assert.equal(backup.validUploadUrl(url), false);
});

test('live full backup matches every production application row and ownership history without writes', {
  skip: process.env.RUN_LIVE_EXPORT_TESTS !== '1',
}, async () => {
  const exportSource = readFileSync(new URL('../src/lib/data-export.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(exportSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { createDataExportHandler, exportTables } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
  const sql = postgres(process.env.SUPABASE_CONNECTION_STRING, { ssl: 'require', prepare: false, max: 1, connect_timeout: 15 });
  const admin = 'user_3KHVyPmBXrhEHQh68x4yhFipZqQ';
  const tables = { ...exportTables, _user_reassign_backup_20260926: ['tbl', 'key', 'old_user_id'] };
  async function baseline() {
    return sql.begin('isolation level repeatable read read only', async tx => {
      const data = {};
      for (const [table, columns] of Object.entries(tables)) {
        const key = table === '_user_reassign_backup_20260926' ? 'key' : table === 'company_ledger_days' ? 'ledger_date' : table === 'company_ledger_order_paid' ? 'order_id' : 'id';
        data[table] = await tx`select ${tx([...columns])} from public.${tx(table)} order by ${tx(key)}`;
      }
      return JSON.parse(JSON.stringify(data));
    });
  }
  try {
    const before = await baseline();
    const response = await createDataExportHandler({ sql, scope: 'all', authorizeFullExport: id => id === admin,
      authenticate: async () => ({ id: admin, email: null, name: null }),
    })(new Request('https://example.com/backup'));
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.deepEqual(snapshot.data, before);
    assert.deepEqual(await baseline(), before, 'Production records must be unchanged after backup');
    assert.equal(Object.entries(snapshot.data).filter(([table]) => table !== '_user_reassign_backup_20260926').reduce((sum, [, rows]) => sum + rows.length, 0), 146);
    assert.equal(snapshot.data._user_reassign_backup_20260926.length, 146);
  } finally { await sql.end({ timeout: 2 }); }
});
