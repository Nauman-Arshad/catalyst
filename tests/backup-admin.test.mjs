import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const config = readFileSync(new URL('../src/config/backup-admins.ts', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/lib/export-admin.ts', import.meta.url), 'utf8')
  .replace('import "server-only";', '').replace('import { backupAdminEmails, backupAdminUserIds } from "@/config/backup-admins";', config.replaceAll('export ', ''));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { isDataExportAdmin } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('production owner requires a signed-in ID and verified primary Clerk email without environment configuration', () => {
  const prior = process.env.DATA_EXPORT_ADMIN_USER_IDS;
  delete process.env.DATA_EXPORT_ADMIN_USER_IDS;
  try {
    const owner = { emailAddress: 'inoonmr@gmail.com', verification: { status: 'verified' } };
    assert.equal(isDataExportAdmin('production-session-user', owner), true);
    assert.equal(isDataExportAdmin(null, owner), false);
    assert.equal(isDataExportAdmin('other-user'), false);
    assert.equal(isDataExportAdmin('other-user', { ...owner, emailAddress: 'other@example.com' }), false);
    assert.equal(isDataExportAdmin('other-user', { ...owner, verification: { status: 'unverified' } }), false);
    assert.equal(isDataExportAdmin('other-user', { emailAddress: owner.emailAddress }), false);
    assert.equal(isDataExportAdmin('user_3FbQyBqk7Txc9ipqOy3mRRAntwP'), true);
  } finally {
    if (prior === undefined) delete process.env.DATA_EXPORT_ADMIN_USER_IDS;
    else process.env.DATA_EXPORT_ADMIN_USER_IDS = prior;
  }
});
