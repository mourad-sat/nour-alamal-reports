import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const redirect = readFileSync(join(root, 'invite-redirect.js'), 'utf8');
const read = file => readFileSync(join(root, file), 'utf8');

function simulate(search = '', hash = '') {
  let destination;
  const location = {
    search,
    hash,
    replace(next) { destination = next; },
  };
  runInNewContext(redirect, { location, URLSearchParams });
  return destination;
}

test('الزيارة العادية للواجهة لا تُحوّل المستخدم', () => {
  assert.equal(simulate(), undefined);
  assert.equal(simulate('?page=reports'), undefined);
});

test('رابط الدعوة الذي يصل إلى الرئيسية يتحول إلى صفحة الدخول مع الحفاظ على البيانات', () => {
  assert.equal(
    simulate('', '#access_token=example-not-a-real-token&refresh_token=example&type=invite'),
    'login.html#access_token=example-not-a-real-token&refresh_token=example&type=invite',
  );
});

test('روابط رمز التحقق والاستعادة توجّه إلى صفحة الدخول', () => {
  assert.equal(simulate('?token_hash=fake&type=invite'), 'login.html?token_hash=fake&type=invite');
  assert.equal(simulate('?code=example-code'), 'login.html?code=example-code');
  assert.equal(simulate('', '#error=access_denied&error_code=otp_expired'), 'login.html#error=access_denied&error_code=otp_expired');
  assert.equal(simulate('?type=recovery'), 'login.html?type=recovery');
});

test('تُحمّل آلية التوجيه قبل تطبيق التقارير المحلي', () => {
  const html = read('index.html');
  const redirectAt = html.indexOf('src="invite-redirect.js"');
  const appAt = html.indexOf('src="app.js"');
  assert.ok(redirectAt > -1);
  assert.ok(appAt > redirectAt);
});

test('تدعم صفحة الدخول طلب استعادة كلمة المرور وإنهاء الدعوة', () => {
  const html = read('login.html');
  const code = read('login.mjs');
  assert.match(html, /id="recoverButton"/);
  assert.match(html, /id="resetForm"/);
  assert.match(html, /id="resetEmail"/);
  assert.match(code, /auth\.resetPasswordForEmail\(/);
  assert.match(code, /auth\.verifyOtp\(/);
  assert.match(code, /PASSWORD_RECOVERY/);
  assert.match(code, /location\.origin \+ '\/login\.html'/);
  assert.doesNotMatch(code, /auth\.signUp\(/);
});
