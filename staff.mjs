import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.mjs';

// Employees MUST first exist in Supabase Authentication. This UI never creates
// Auth identities or handles passwords. Only active admins can use it.
// PostgreSQL RLS enforces the authorization for every write.
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'nour-alamal-reports-auth-v1',
  },
});

const ROLES = Object.freeze({
  vocational_instructor: 'مكوّن التكوين المهني',
  pedagogical_instructor: 'مؤطر التأهيل التربوي',
  activity_facilitator: 'منشّط الأنشطة الموازية',
  attendance_officer: 'مكلّف الحضور والغياب',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const $ = id => document.getElementById(id);

let centers = [];
let profiles = [];
let memberships = [];
let currentUserId = null;
let busy = false;

function status(message, mode = '') {
  $('staffStatus').textContent = message;
  $('staffStatus').className = 'status' + (mode ? ' ' + mode : '');
}

function setBusy(value) {
  busy = value;
  $('staffCreate').disabled = value || !centers.length;
  $('inviteSubmit').disabled = value || !centers.length;
  $('staffLogout').disabled = value;
  for (const b of $('staffList').querySelectorAll('button')) b.disabled = value;
}

function optionCheckbox(center, checked = false) {
  const label = document.createElement('label');
  label.className = 'center-option';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'center_id';
  input.value = center.id;
  input.checked = checked;
  const name = document.createElement('span');
  name.textContent = center.name;
  label.append(input, name);
  return label;
}

function renderNewUserCenters() {
  for (const containerId of ['staffCenters', 'inviteCenters']) {
    const parent = $(containerId);
    parent.replaceChildren();
    if (!centers.length) {
      const p = document.createElement('p');
      p.textContent = 'لا توجد مراكز نشطة. أضف مركزًا من لوحة المراكز أولًا.';
      parent.append(p);
    } else {
      for (const center of centers) parent.append(optionCheckbox(center));
    }
  }
}

function assignedCenters(userId) {
  const ids = new Set(memberships.filter(m => m.user_id === userId && m.is_active).map(m => m.center_id));
  return centers.filter(c => ids.has(c.id));
}

function appendText(tag, value, className = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value;
  return el;
}

function drawStaff() {
  const list = $('staffList');
  list.replaceChildren();
  $('staffCount').textContent = String(profiles.length);
  if (!profiles.length) {
    list.append(appendText('p', 'لم يُعيّن موظفون بعد.', 'staff-empty'));
    return;
  }
  for (const person of profiles) {
    const article = document.createElement('article');
    article.className = 'staff-entry';
    const head = document.createElement('div');
    head.className = 'staff-head';
    head.append(
      appendText('strong', person.full_name),
      appendText('span', person.is_active ? 'نشط' : 'غير نشط', 'tag' + (person.is_active ? '' : ' disabled')),
    );
    article.append(head);
    article.append(appendText('p', ROLES[person.role] || 'إدارة الجمعية', 'staff-role'));
    article.append(appendText('p', person.user_id, 'staff-uid'));
    const assigned = assignedCenters(person.user_id);
    article.append(appendText('p',
      person.role === 'admin' ? 'صلاحية الإدارة شاملة للمراكز.' :
        'المراكز: ' + (assigned.length ? assigned.map(c => c.name).join('، ') : 'لم تُعيّن مراكز بعد'),
      'staff-centers'));

    // The protected bootstrap admin profile cannot be changed by this UI.
    if (person.role !== 'admin' && person.user_id !== currentUserId) {
      const buttons = document.createElement('div');
      buttons.className = 'staff-actions';
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.textContent = 'تعديل المراكز';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = person.is_active ? 'إيقاف الموظف' : 'تفعيل الموظف';
      if (person.is_active) toggle.className = 'danger';
      const editor = document.createElement('div');
      editor.className = 'staff-edit';
      editor.hidden = true;
      editor.append(appendText('p', 'اختر المراكز التي يحق لهذا الموظف العمل فيها:'));
      const options = document.createElement('div');
      options.className = 'center-options';
      const assignedIds = new Set(assigned.map(c => c.id));
      for (const center of centers) {
        options.append(optionCheckbox(center, assignedIds.has(center.id)));
      }
      editor.append(options);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'button primary';
      save.textContent = 'حفظ تعيين المراكز';
      editor.append(save);
      manage.addEventListener('click', () => {
        if (busy) return;
        editor.hidden = !editor.hidden;
      });
      save.addEventListener('click', () => {
        if (busy) return;
        const selected = [...editor.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
        updateCenters(person, selected).catch(() => status('تعذر حفظ المراكز. حاول مرة أخرى.', 'error'));
      });
      toggle.addEventListener('click', () => {
        if (busy) return;
        changeActive(person).catch(() => status('تعذر تغيير حالة الموظف.', 'error'));
      });
      buttons.append(manage, toggle);
      article.append(buttons, editor);
    }
    list.append(article);
  }
  setBusy(busy);
}

async function refresh() {
  const [centersResult, profilesResult, membersResult] = await Promise.all([
    supabase.from('centers').select('id,name,is_active').eq('is_active', true).order('name'),
    supabase.from('staff_profiles').select('user_id,full_name,role,is_active').order('full_name'),
    supabase.from('center_memberships').select('center_id,user_id,is_active'),
  ]);
  if (centersResult.error || profilesResult.error || membersResult.error) {
    status('تعذر تحميل بيانات الموظفين أو المراكز؛ تحقق من الاتصال وصلاحية الإدارة.', 'error');
    return false;
  }
  centers = centersResult.data || [];
  profiles = profilesResult.data || [];
  memberships = membersResult.data || [];
  renderNewUserCenters();
  drawStaff();
  return true;
}

async function verifyAdmin() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    status('يجب تسجيل الدخول بحساب مدير الجمعية أولًا.', 'error');
    $('staffWorkspace').hidden = true;
    return;
  }
  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles').select('full_name,role,is_active')
    .eq('user_id', data.user.id).maybeSingle();
  if (profileError || !profile?.is_active || profile.role !== 'admin') {
    status('الحساب الحالي لا يملك صلاحية إدارة الموظفين.', 'error');
    $('staffWorkspace').hidden = true;
    return;
  }
  currentUserId = data.user.id;
  $('staffAdminName').textContent = profile.full_name + ' · الإدارة';
  $('staffLogout').hidden = false;
  $('staffWorkspace').hidden = false;
  if (await refresh()) status('تم تحميل الموظفين وتعيينات المراكز من قاعدة البيانات.', 'ok');
}

// Server-side function checks Supabase's verified JWT and the database admin role
// before sending any email or granting staff permissions. Never put privileged keys here.
$('inviteForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !currentUserId) return;
  const email = $('inviteEmail').value.trim().toLowerCase();
  const full_name = $('inviteName').value.trim();
  const role = $('inviteRole').value;
  const center_ids = [...$('inviteCenters').querySelectorAll('input[type="checkbox"]:checked')]
    .map(x => x.value);
  const centerSet = new Set(centers.map(c => c.id));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      full_name.length < 2 || full_name.length > 150 ||
      !Object.hasOwn(ROLES, role) || center_ids.length < 1 ||
      center_ids.some(id => !centerSet.has(id))) {
    status('أدخل بريدًا صحيحًا واسم الموظف واختصاصه، وحدد مركزًا واحدًا على الأقل.', 'error');
    return;
  }

  setBusy(true);
  status('جارٍ إرسال الدعوة من خدمة Supabase الآمنة…');
  try {
    const { data, error } = await supabase.functions.invoke('invite-staff', {
      body: { email, full_name, role, center_ids },
    });
    if (error || !data?.ok) {
      let code = data?.code;
      // FunctionsHttpError carries the API's structured error response.
      if (!code && error?.context && typeof error.context.json === 'function') {
        try { code = (await error.context.json())?.code; } catch { /* generic error */ }
      }
      const messages = {
        EMAIL_RATE_LIMIT: 'استُنفد حد رسائل البريد في Supabase. لا تكرر الإرسال؛ اضبط SMTP خاصًا أو انتظر تجدد الحصة.',
        ALREADY_EXISTS: 'البريد مرتبط بحساب موجود مسبقًا. استخدم خيار User UID لإضافة صلاحياته دون إرسال دعوة جديدة.',
        ADMIN_REQUIRED: 'هذا الحساب لا يملك صلاحية إرسال دعوات الموظفين.',
        LOGIN_REQUIRED: 'انتهت جلسة المدير. سجّل الدخول مجددًا.',
        INVALID_CENTERS: 'إحدى المراكز المختارة غير نشطة أو لم تعد موجودة. أعد تحميل الصفحة.',
        BAD_INPUT: 'البيانات غير مكتملة أو غير صحيحة. تحقق منها وأعد المحاولة.',
        INVITED_BUT_UNASSIGNED: 'أُرسلت الدعوة لكن تعيين صلاحيات الموظف لم يكتمل. راجع الحساب في Supabase ولا تعِد إرسال الدعوة قبل التصحيح.',
        INVITE_UNAVAILABLE: 'تعذر إرسال الدعوة عبر خدمة البريد. راجع إعدادات SMTP ومحددات الإرسال في Supabase.',
        VERIFY_FAILED: 'تعذر التحقق من صلاحيات المدير في قاعدة البيانات.',
        SERVER_NOT_CONFIGURED: 'خدمة دعوات الموظفين لم تكتمل تهيئتها لدى Supabase.',
      };
      status(messages[code] || 'تعذّر إرسال الدعوة. تحقق من الاتصال وإعدادات Supabase.', 'error');
      return;
    }
    if (data.code !== 'INVITATION_SENT') {
      status('تعذر تأكيد حالة الدعوة. تحقق من قائمة المستخدمين قبل إعادة الإرسال.', 'error');
      return;
    }
    $('inviteForm').reset();
    await refresh();
    status('تم إرسال دعوة الموظف وحفظ اختصاصه ومراكزه. سيحدد كلمة مروره من رابط الدعوة.', 'ok');
  } catch {
    status('تعذر الاتصال بخدمة الدعوات. راجع الحالة قبل المحاولة مجددًا.', 'error');
  } finally {
    setBusy(false);
  }
});

$('staffForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const userId = $('staffUid').value.trim().toLowerCase();
  const fullName = $('staffName').value.trim();
  const role = $('staffRole').value;
  const selected = [...$('staffCenters').querySelectorAll('input[type="checkbox"]:checked')].map(x => x.value);
  const centerIds = new Set(centers.map(c => c.id));
  if (!UUID.test(userId) || fullName.length < 2 || fullName.length > 150 ||
      !Object.hasOwn(ROLES, role) || selected.length === 0 ||
      selected.some(id => !centerIds.has(id))) {
    status('تأكد من صحة User UID والاسم والدور، واختر مركزًا واحدًا على الأقل.', 'error');
    return;
  }
  if (profiles.some(p => p.user_id === userId)) {
    status('هذا الحساب مُعيّن بالفعل. استخدم أدوات تعديل المراكز أسفل اسمه.', 'error');
    return;
  }
  setBusy(true);
  try {
    // Start inactive so that partial failure cannot grant access.
    const { error: createError } = await supabase.from('staff_profiles')
      .insert({ user_id: userId, full_name: fullName, role, is_active: false });
    if (createError) {
      status('تعذر تسجيل الموظف. تأكد من وجود User UID الصحيح في Authentication → Users.', 'error');
      return;
    }
    const assignments = selected.map(center_id => ({ center_id, user_id: userId, is_active: true }));
    const { error: assignError } = await supabase.from('center_memberships').insert(assignments);
    if (assignError) {
      status('أنشئ ملف الموظف غير نشط، لكن تعيين المراكز تعذر. راجع الحساب قبل تفعيله.', 'error');
      await refresh();
      return;
    }
    const { error: activateError } = await supabase.from('staff_profiles')
      .update({ is_active: true }).eq('user_id', userId).eq('is_active', false);
    if (activateError) {
      status('تم إنشاء ملف الموظف والمراكز، لكن تفعيله تعذر. استخدم زر التفعيل بعد المراجعة.', 'error');
      await refresh();
      return;
    }
    $('staffForm').reset();
    if (await refresh()) status('تم تعيين الموظف وربطه بالمراكز بنجاح.', 'ok');
  } catch {
    status('تعذر إكمال تعيين الموظف. تحقق من النتيجة قبل إعادة المحاولة.', 'error');
  } finally {
    setBusy(false);
  }
});

async function updateCenters(person, desired) {
  const allowed = new Set(centers.map(c => c.id));
  if (!desired.length || desired.some(id => !allowed.has(id))) {
    status('اختر مركزًا نشطًا واحدًا على الأقل.', 'error');
    return;
  }
  setBusy(true);
  try {
    const current = new Set(assignedCenters(person.user_id).map(c => c.id));
    const wanted = new Set(desired);
    const additions = [...wanted].filter(id => !current.has(id));
    const removals = [...current].filter(id => !wanted.has(id));
    if (additions.length) {
      const { error } = await supabase.from('center_memberships')
        .upsert(additions.map(center_id => ({ user_id: person.user_id, center_id, is_active: true })),
          { onConflict: 'center_id,user_id' });
      if (error) throw error;
    }
    if (removals.length) {
      const { error } = await supabase.from('center_memberships')
        .delete().eq('user_id', person.user_id).in('center_id', removals);
      if (error) throw error;
    }
    if (await refresh()) status('تم تحديث المراكز المسموحة للموظف.', 'ok');
  } catch {
    await refresh();
    status('تعذر حفظ جميع التغييرات. أعد مراجعة تعيينات المراكز الظاهرة.', 'error');
  } finally {
    setBusy(false);
  }
}

async function changeActive(person) {
  const target = !person.is_active;
  if (target && !assignedCenters(person.user_id).length) {
    status('يجب تعيين مركز نشط واحد على الأقل قبل تفعيل هذا الموظف.', 'error');
    return;
  }
  const question = target ? 'هل تريد تفعيل هذا الموظف؟' : 'هل تريد إيقاف صلاحية هذا الموظف مؤقتًا؟';
  if (!window.confirm(question)) return;
  setBusy(true);
  try {
    const { error } = await supabase.from('staff_profiles')
      .update({ is_active: target }).eq('user_id', person.user_id).neq('role', 'admin');
    if (error) throw error;
    if (await refresh()) status(target ? 'تم تفعيل الموظف.' : 'تم إيقاف صلاحية الموظف.', 'ok');
  } catch {
    status('تعذر تعديل حالة الموظف. أعد المحاولة.', 'error');
  } finally {
    setBusy(false);
  }
}

$('staffLogout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  const { error } = await supabase.auth.signOut();
  if (error) {
    setBusy(false);
    status('تعذر إنهاء الجلسة.', 'error');
    return;
  }
  location.replace('login.html');
});

supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT') {
    $('staffWorkspace').hidden = true;
    location.replace('login.html');
  }
});

verifyAdmin().catch(() => {
  $('staffWorkspace').hidden = true;
  status('تعذّر التحقق من الجلسة والصلاحيات. حدّث الصفحة وحاول مجددًا.', 'error');
});
