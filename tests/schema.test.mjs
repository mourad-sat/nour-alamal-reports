import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');
const tables = ['centers','staff_profiles','center_memberships','training_groups','session_reports','attendance_records'];

test('كل جدول يفعّل RLS بصورة صريحة', () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('لا توجد صلاحية للجمهور على بيانات التقارير', () => {
  assert.match(sql, /revoke all on public\.centers,[\s\S]*?from public, anon;/i);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*?to authenticated;/i);
  assert.doesNotMatch(sql, /create policy\s+\w+[\s\S]*?to anon/i);
});

test('التفويض يتم من جدول الموظفين وليس بيانات يغيّرها المستخدم', () => {
  assert.match(sql, /p\.role = 'admin'/);
  assert.match(sql, /p\.is_active/);
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data|raw_app_meta_data|auth\.jwt\(/i);
});

test('كل وظائف SECURITY DEFINER محصورة في مخطط داخلي', () => {
  assert.match(sql, /create schema if not exists app_private/i);
  assert.match(sql, /revoke all on schema app_private from public;/i);
  assert.match(sql, /revoke execute on all functions in schema app_private from public, anon;/i);
  assert.doesNotMatch(sql, /create function public\.[\s\S]*?security definer/i);
});

test('تُحفظ أرقام مستعارة للمستفيدين دون أسماء أو أرقام هوية', () => {
  assert.match(sql, /learner_code text not null check/);
  assert.doesNotMatch(sql, /learner_name|national_id|cin_number|birthday|date_of_birth/i);
  assert.match(sql, /unique \(group_id, session_date, learner_code\)/);
});

test('سجلات التقرير والغياب مرتبطة بمركز المجموعة نفسه', () => {
  assert.match(sql, /constraint report_group_same_center/);
  assert.match(sql, /constraint attendance_group_same_center/);
  assert.match(sql, /reports_insert[\s\S]*?author_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /attendance_insert[\s\S]*?recorded_by = \(select auth\.uid\(\)\)/);
});