import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');

test('صفحة إدارة الموظفين متاحة بالعربية ولا تُظهر البيانات قبل التحقق', () => {
  const html = read('staff.html');
  assert.match(html, /lang="ar" dir="rtl"/);
  for (const id of ['staffWorkspace','staffForm','staffUid','staffName','staffRole','staffCenters','staffList','staffLogout']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /id="staffWorkspace" hidden/);
  assert.match(html, /src="staff\.mjs"/);
  assert.match(read('admin.html'), /href="staff\.html"/);
});

test('رفض دخول غير المدير والتحقق من جلسة Supabase', () => {
  const js = read('staff.mjs');
  assert.match(js, /supabase\.auth\.getUser\(\)/);
  assert.match(js, /\.from\('staff_profiles'\)/);
  assert.match(js, /profile\.role !== 'admin'/);
  assert.match(js, /!profile\?\.is_active/);
  assert.match(js, /el\('staffWorkspace'\)\.hidden = true|\$\('staffWorkspace'\)\.hidden = true/);
});

test('دور الموظف محدد ولا يمكن ترقية مدير من الصفحة', () => {
  const js = read('staff.mjs');
  const html = read('staff.html');
  for (const role of ['vocational_instructor','pedagogical_instructor','activity_facilitator','attendance_officer']) {
    assert.match(js, new RegExp(role));
    assert.match(html, new RegExp('value="' + role + '"'));
  }
  assert.doesNotMatch(html, /<option value="admin">/);
  assert.match(js, /Object\.hasOwn\(ROLES, role\)/);
  assert.match(js, /person\.role !== 'admin'/);
  assert.doesNotMatch(js, /auth\.signUp\(|auth\.admin\.createUser\(|sb_secret_|service_role/);
});

test('ملف الموظف يبدأ معطلا قبل تعيين المراكز وتفعيله', () => {
  const js = read('staff.mjs');
  assert.match(js, /is_active: false/);
  assert.match(js, /\.from\('center_memberships'\)\.insert\(assignments\)/);
  assert.match(js, /\.update\(\{ is_active: true \}\)/);
  assert.match(js, /selected\.length === 0/);
  assert.match(js, /UUID\.test\(userId\)/);
  assert.match(js, /\.eq\('user_id', person\.user_id\)\.neq\('role', 'admin'\)/);
});

test('الموظف يرى مراكز مخصصة عبر سياسات قاعدة البيانات', () => {
  const sql = read('supabase/schema.sql');
  assert.match(sql, /create policy memberships_insert[\s\S]*?app_private\.is_admin\(\)/);
  assert.match(sql, /create policy memberships_delete[\s\S]*?app_private\.is_admin\(\)/);
  assert.match(sql, /p\.role = 'vocational_instructor'/);
  assert.match(sql, /p\.role = 'pedagogical_instructor'/);
  assert.match(sql, /p\.role = 'activity_facilitator'/);
});

test('البيانات المعروضة نص فقط بدون HTML قابل للحقن', () => {
  const js = read('staff.mjs');
  assert.match(js, /name\.textContent = center\.name/);
  assert.match(js, /el\.textContent = value/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});

test('صياغة JavaScript جديدة سليمة', () => {
  const result = spawnSync(process.execPath, ['--check',join(root,'staff.mjs')], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
