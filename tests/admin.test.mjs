import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => readFileSync(join(root, filename), 'utf8');

test('توجد لوحة مستقلة للمراكز والمجموعات', () => {
  const html = read('admin.html');
  for (const id of ['workspace', 'centerForm', 'centerName', 'groupForm', 'groupCenter',
    'groupName', 'centersList', 'groupsList', 'logout']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /lang="ar" dir="rtl"/);
  assert.match(html, /type="module" src="admin\.mjs"/);
  assert.match(html, /href="admin\.css"/);
  assert.match(html, /id="workspace" hidden/);
});

test('لوحة الإدارة تتحقق من جلسة فعلية وصلاحية المدير النشط', () => {
  const js = read('admin.mjs');
  assert.match(js, /supabase\.auth\.getUser\(\)/);
  assert.match(js, /\.from\('staff_profiles'\)/);
  assert.match(js, /profile\.role !== 'admin'/);
  assert.match(js, /!profile\?\.is_active/);
  assert.match(js, /el\('workspace'\)\.hidden = true/);
  assert.match(js, /\.from\('centers'\)/);
  assert.match(js, /\.from\('training_groups'\)/);
  assert.match(js, /\.insert\(\{ name \}\)/);
  assert.match(js, /\.insert\(\{ center_id: centerId, name \}\)/);
  assert.doesNotMatch(js, /service_role|sb_secret_|user_metadata|raw_user_meta_data/);
});

test('المعلومات المسترجعة من قاعدة البيانات تُعرض كنص دون HTML مباشر', () => {
  const js = read('admin.mjs');
  assert.match(js, /name\.textContent = center\.name/);
  assert.match(js, /name\.textContent = group\.name/);
  assert.match(js, /li\.append\(name, /);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});

test('زر الإدارة لا يظهر إلا عند التحقق من صفة المدير في جدول الموظفين', () => {
  const html = read('login.html');
  const js = read('login.mjs');
  assert.match(html, /id="adminPanelLink"[^>]*href="admin\.html" hidden/);
  assert.match(js, /el\('adminPanelLink'\)\.hidden = true/);
  assert.match(js, /if \(profile\.role === 'admin'\)/);
  assert.match(js, /el\('adminPanelLink'\)\.hidden = false/);
});

test('تظل صلاحيات إنشاء المراكز والمجموعات محمية في PostgreSQL', () => {
  const sql = read('supabase/schema.sql');
  assert.match(sql, /create policy centers_insert[\s\S]*?with check \(\(select app_private\.is_admin\(\)\)\)/);
  assert.match(sql, /create policy groups_insert[\s\S]*?with check \(\(select app_private\.is_admin\(\)\)\)/);
});

test('تجتاز ملفات JavaScript الجديدة فحص الصياغة', () => {
  for (const file of ['admin.mjs', 'login.mjs']) {
    const r = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    assert.equal(r.status, 0, file + ': ' + r.stderr);
  }
});
