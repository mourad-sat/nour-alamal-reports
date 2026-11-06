import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(root, file), 'utf8');
const backend = read('supabase/functions/invite-staff/index.ts');
const frontend = read('staff.mjs');
const html = read('staff.html');

test('صفحة الموظفين تحتوي نموذج دعوة بالبريد دون كلمة مرور', () => {
  for (const id of ['inviteForm','inviteEmail','inviteName','inviteRole','inviteCenters','inviteSubmit','inviteNote']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /id="staffForm"/);
  assert.doesNotMatch(html, /type="password"/);
  assert.doesNotMatch(html, /<option value="admin">/);
});

test('الدعوات تُرسل إلى وظيفة خادمية وليس عبر Auth Admin API في المتصفح', () => {
  assert.match(frontend, /supabase\.functions\.invoke\('invite-staff'/);
  assert.doesNotMatch(frontend, /\.auth\.admin\./);
  assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/);
  assert.match(frontend, /EMAIL_RATE_LIMIT/);
  assert.match(frontend, /INVITED_BUT_UNASSIGNED/);
});

test('الخادم يتحقق من JWT ودور المدير في قاعدة البيانات قبل إرسال أي دعوة', () => {
  const verify = backend.indexOf('admin.auth.getUser(match[1])');
  const role = backend.indexOf('adminProfile.role !== "admin"');
  const invite = backend.indexOf('admin.auth.admin.inviteUserByEmail');
  assert.ok(verify > 0 && role > verify && invite > role);
  assert.match(backend, /!adminProfile\?\.is_active/);
  assert.match(backend, /verified\.user\.is_anonymous/);
  assert.match(backend, /if \(origin && origin !== APP_ORIGIN\)/);
});

test('الوظيفة لا تسمح بدور مدير وتقيّد إدخال البريد والاختصاص والمراكز', () => {
  assert.match(backend, /const ROLES = new Set\(/);
  const roleList = backend.match(/const ROLES = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  assert.doesNotMatch(roleList, /"admin"/);
  for (const role of ['vocational_instructor','pedagogical_instructor','activity_facilitator','attendance_officer']) {
    assert.ok(roleList.includes(role), role);
  }
  assert.match(backend, /centerIds\.length !== ids\.length/);
  assert.match(backend, /activeCenters\.length !== centerIds\.length/);
  assert.match(backend, /fullName\.length > 150/);
  assert.match(backend, /email\.length > 254/);
});

test('فشل تسجيل الموظف لا يترك ملفه مفعّلًا بعد نجاح إرسال الدعوة', () => {
  const disabled = backend.indexOf('is_active: false');
  const memberships = backend.indexOf('center_memberships").insert(');
  const activation = backend.indexOf('.update({ is_active: true })');
  assert.ok(disabled > 0 && memberships > disabled && activation > memberships);
  assert.match(backend, /INVITED_BUT_UNASSIGNED/);
  assert.match(backend, /EMAIL_RATE_LIMIT/);
  assert.match(backend, /redirectTo: LOGIN_URL/);
});

test('المفاتيح عالية الامتياز موجودة في بيئة Edge فقط دون قيمة مضمّنة', () => {
  assert.match(backend, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(backend, /sb_secret_[a-zA-Z0-9]/);
  assert.doesNotMatch(backend, /eyJhbGciOi/);
  assert.match(backend, /Cache-Control": "no-store"/);
});

test('JavaScript الواجهة صالح وملف deno.json يستخدم نسخة محددة', () => {
  const result = spawnSync(process.execPath, ['--check',join(root,'staff.mjs')], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const deps = JSON.parse(read('supabase/functions/invite-staff/deno.json'));
  assert.equal(deps.imports['@supabase/supabase-js'], 'npm:@supabase/supabase-js@2.119.0');
});
