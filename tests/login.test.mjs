import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');

test('توجد صفحة دخول مستقلة مع حقول البريد وكلمة المرور', () => {
  const html = read('login.html');
  assert.match(html, /lang="ar" dir="rtl"/);
  assert.match(html, /id="loginForm"/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.match(html, /src="login\.mjs"/);
  assert.match(html, /href="login\.css"/);
  assert.doesNotMatch(html, /id="signupForm"|تسجيل حساب جديد/);
});

test('تستعمل الصفحة SDK مثبت النسخة ومفتاح publishable فقط', () => {
  const config = read('supabase-config.mjs');
  const app = read('login.mjs');
  assert.match(config, /https:\/\/nkrbnwvccnsanetmmuqm\.supabase\.co/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role|eyJhbGci/i);
  assert.match(app, /@supabase\/supabase-js@2\.119\.0\/\+esm/);
  assert.doesNotMatch(app, /auth\.signUp\(/);
});

test('التحقق من الصلاحية يتم من جدول RLS بعد getUser', () => {
  const app = read('login.mjs');
  assert.match(app, /auth\.signInWithPassword\(/);
  assert.match(app, /auth\.getUser\(/);
  assert.match(app, /\.from\('staff_profiles'\)/);
  assert.match(app, /if \(!profile\?\.is_active\)/);
  assert.match(app, /\.from\('center_memberships'\)/);
  assert.match(app, /auth\.signOut\(/);
  assert.doesNotMatch(app, /user_metadata|raw_user_meta_data/);
});

test('تدعم الدعوات وتعيين كلمة المرور دون كتابتها في المشروع', () => {
  const app = read('login.mjs');
  assert.match(app, /passwordSetupRequired = invitationType === 'invite'/);
  assert.match(app, /auth\.updateUser\(\{ password \}\)/);
  assert.match(app, /password\.length < 12/);
  assert.match(read('supabase/bootstrap_first_admin.sql'), /email_confirmed_at is not null/i);
  assert.match(read('supabase/bootstrap_first_admin.sql'), /REPLACE_WITH_CONFIRMED_ADMIN_EMAIL/);
});

test('الواجهة الأصلية تبيّن أن التقارير التجريبية غير محمية', () => {
  const app = read('index.html');
  assert.match(app, /href="login\.html"/);
  assert.match(app, /نسخة أولية · حفظ محلي فقط/);
});

test('صياغة ملفات الدخول JavaScript سليمة', () => {
  for (const file of ['login.mjs', 'supabase-config.mjs']) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], {encoding:'utf8'});
    assert.equal(result.status, 0, file + ': ' + result.stderr);
  }
});
