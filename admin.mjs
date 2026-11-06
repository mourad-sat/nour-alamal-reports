import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.mjs';

// A verified session AND an active admin role in the RLS-protected staff table
// are required. Browser-side checks are UX only; PostgreSQL RLS is authoritative.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'nour-alamal-reports-auth-v1',
  },
});

const el = id => document.getElementById(id);
let centers = [];
let groups = [];
let loading = false;

function notice(message, kind = '') {
  const status = el('message');
  status.textContent = message;
  status.className = 'status' + (kind ? ' ' + kind : '');
}

function setBusy(busy) {
  loading = busy;
  el('centerSubmit').disabled = busy;
  el('groupSubmit').disabled = busy || centers.length === 0;
  el('logout').disabled = busy;
}

function addEmpty(list, message) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = message;
  list.appendChild(li);
}

function draw() {
  const centerList = el('centersList');
  const groupList = el('groupsList');
  centerList.replaceChildren();
  groupList.replaceChildren();
  el('centersCount').textContent = String(centers.length);
  el('groupsCount').textContent = String(groups.length);

  const selector = el('groupCenter');
  const selected = selector.value;
  selector.replaceChildren(new Option('اختر المركز', ''));
  const lookup = new Map();

  for (const center of centers) {
    lookup.set(center.id, center.name);
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = center.name;
    const state = document.createElement('small');
    state.textContent = center.is_active ? 'نشط' : 'غير نشط';
    li.append(name, state);
    centerList.appendChild(li);

    if (center.is_active) {
      selector.appendChild(new Option(center.name, center.id));
    }
  }
  if (centers.length === 0) addEmpty(centerList, 'لا توجد مراكز بعد. أضف المركز الأول.');

  if (Array.from(selector.options).some(o => o.value === selected)) {
    selector.value = selected;
  }

  for (const group of groups) {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = group.name;
    const center = document.createElement('small');
    center.textContent = lookup.get(group.center_id) || 'مركز غير متاح';
    li.append(name, center);
    groupList.appendChild(li);
  }
  if (groups.length === 0) addEmpty(groupList, 'لا توجد مجموعات بعد. أنشئ مركزًا أولًا.');

  el('groupCenter').disabled = !centers.some(c => c.is_active);
  setBusy(loading);
}

async function loadData() {
  const [centerResult, groupResult] = await Promise.all([
    supabase.from('centers')
      .select('id,name,is_active,created_at').order('name', { ascending: true }),
    supabase.from('training_groups')
      .select('id,center_id,name,is_active,created_at').order('name', { ascending: true }),
  ]);
  if (centerResult.error || groupResult.error) {
    notice('تعذر تحميل بيانات المراكز والمجموعات. تحقق من الاتصال وصلاحيات الحساب.', 'error');
    return false;
  }
  centers = centerResult.data ?? [];
  groups = groupResult.data ?? [];
  draw();
  return true;
}

async function verifyAdmin() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    notice('يرجى تسجيل الدخول بحساب مدير الجمعية.', 'error');
    el('workspace').hidden = true;
    setTimeout(() => location.replace('login.html'), 1000);
    return;
  }
  const { data: profile, error } = await supabase
    .from('staff_profiles')
    .select('full_name,role,is_active')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (error || !profile?.is_active || profile.role !== 'admin') {
    notice('ليس لهذا الحساب صلاحية إدارة المراكز والمجموعات.', 'error');
    el('workspace').hidden = true;
    return;
  }

  el('adminName').textContent = profile.full_name + ' · الإدارة';
  el('logout').hidden = false;
  el('workspace').hidden = false;
  const ok = await loadData();
  if (ok) notice('تم تحميل المراكز والمجموعات من قاعدة البيانات المشتركة.', 'ok');
}

el('centerForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (loading) return;
  const name = el('centerName').value.trim();
  if (name.length < 2 || name.length > 150) {
    notice('اسم المركز يجب أن يكون بين حرفين و150 حرفًا.', 'error');
    return;
  }
  if (centers.some(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    notice('يوجد مركز بهذا الاسم بالفعل.', 'error');
    return;
  }
  setBusy(true);
  try {
    const { error } = await supabase.from('centers').insert({ name });
    if (error) {
      notice('تعذر إضافة المركز. تحقق من صلاحية المدير وحاول مجددًا.', 'error');
      return;
    }
    el('centerForm').reset();
    if (await loadData()) notice('تم حفظ المركز الجديد في قاعدة البيانات.', 'ok');
  } catch {
    notice('تعذر الاتصال بقاعدة البيانات أثناء حفظ المركز.', 'error');
  } finally {
    setBusy(false);
  }
});

el('groupForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (loading) return;
  const name = el('groupName').value.trim();
  const centerId = el('groupCenter').value;
  if (name.length < 2 || name.length > 150 || !centers.some(c => c.id === centerId && c.is_active)) {
    notice('اختر مركزًا صحيحًا وأدخل اسم مجموعة من حرفين إلى 150 حرفًا.', 'error');
    return;
  }
  if (groups.some(g => g.center_id === centerId && g.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    notice('اسم المجموعة مسجل بالفعل داخل هذا المركز.', 'error');
    return;
  }
  setBusy(true);
  try {
    const { error } = await supabase.from('training_groups').insert({ center_id: centerId, name });
    if (error) {
      notice('تعذر إنشاء المجموعة. تحقق من المدخلات والصلاحيات.', 'error');
      return;
    }
    el('groupName').value = '';
    if (await loadData()) notice('تم حفظ المجموعة وربطها بالمركز في قاعدة البيانات.', 'ok');
  } catch {
    notice('تعذر الاتصال بقاعدة البيانات أثناء حفظ المجموعة.', 'error');
  } finally {
    setBusy(false);
  }
});

el('logout').addEventListener('click', async () => {
  if (loading) return;
  setBusy(true);
  const { error } = await supabase.auth.signOut();
  if (error) {
    setBusy(false);
    notice('تعذر تسجيل الخروج. حاول مرة أخرى.', 'error');
    return;
  }
  location.replace('login.html');
});

supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT') {
    el('workspace').hidden = true;
    location.replace('login.html');
  }
});

verifyAdmin().catch(() => {
  el('workspace').hidden = true;
  notice('تعذر التحقق من صلاحية المدير. حدّث الصفحة أو حاول مجددًا.', 'error');
});
