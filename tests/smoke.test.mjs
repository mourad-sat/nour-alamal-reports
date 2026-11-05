import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');

test('الملفات الأساسية للنشر موجودة', () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'vercel.json']) {
    assert.ok(existsSync(join(root, file)), `Missing ${file}`);
  }
});

test('الواجهة عربية وتربط ملفاتها بشكل صحيح', () => {
  const html = read('index.html');
  assert.match(html, /<html\b[^>]*lang="ar"[^>]*dir="rtl"/);
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  for (const id of ['main', 'sidebar', 'overlay', 'modalRoot', 'toast', 'printArea']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('الأقسام الأساسية متاحة في التطبيق', () => {
  const html = read('index.html');
  for (const page of ['dashboard', 'reports', 'vocational', 'pedagogical', 'attendance', 'activities', 'settings']) {
    assert.match(html, new RegExp(`data-page="${page}"`));
  }
});

test('صياغة JavaScript سليمة', () => {
  const result = spawnSync(process.execPath, ['--check', join(root, 'app.js')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('التطبيق التجريبي يحذر من استخدام بيانات حقيقية', () => {
  const script = read('app.js');
  assert.match(script, /function banner\(/);
  assert.match(script, /تجنب إدخال أسماء أو معلومات حقيقية/);
  assert.match(script, /function validImport\(/);
  assert.doesNotMatch(script, /service_role|supabase_service_role|SUPABASE_SECRET_KEY/i);
});

test('إعدادات Vercel صالحة وتتضمن رؤوس حماية', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.version, 2);
  const names = config.headers.flatMap(item => item.headers.map(header => header.key));
  for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']) {
    assert.ok(names.includes(name), `Missing ${name}`);
  }
});
