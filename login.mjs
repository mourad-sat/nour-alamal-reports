import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.mjs';

// Only the publishable key is sent to the browser. Supabase enforces RLS on every query.
// This screen tests staff authentication; the local reporting prototype is not migrated yet.
const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'nour-alamal-reports-auth-v1',
  },
});

const labels = {
  admin: 'الإدارة',
  vocational_instructor: 'مكوّن التكوين المهني',
  pedagogical_instructor: 'مؤطر التأهيل التربوي',
  activity_facilitator: 'منشط الأنشطة الموازية',
  attendance_officer: 'مسؤول الحضور والغياب',
};

const el = id => document.getElementById(id);
const loginForm = el('loginForm');
const passwordForm = el('passwordForm');
const profilePanel = el('profilePanel');
const memberActions = el('memberActions');
const status = el('status');

const invitationType = new URLSearchParams(location.hash.slice(1)).get('type') ||
  new URLSearchParams(location.search).get('type');
let passwordSetupRequired = invitationType === 'invite' || invitationType === 'recovery';
let busy = false;
let latestCheck = 0;

function message(text, kind = '') {
  status.textContent = text;
  status.className = 'status' + (kind ? ' ' + kind : '');
}

function show(which) {
  loginForm.hidden = which !== 'login';
  passwordForm.hidden = which !== 'password';
  profilePanel.hidden = which !== 'profile';
  memberActions.hidden = which !== 'password' && which !== 'profile';
  el('logoutButton').hidden = which === 'login';
  el('reloadButton').hidden = which === 'password';
}

function setBusy(flag) {
  busy = flag;
  for (const id of ['loginButton', 'passwordButton', 'reloadButton', 'logoutButton']) {
    el(id).disabled = flag;
  }
}

function friendlyError(error) {
  if (error?.status === 429) return 'تم تجاوز عدد المحاولات المسموح به مؤقتًا. حاول لاحقًا.';
  if (error?.status === 400 || error?.status === 401 || error?.status === 422) {
    return 'تعذّر تسجيل الدخول. تحقق من بياناتك وتفعيل حسابك عبر إدارة الجمعية.';
  }
  return 'تعذّر الاتصال بخدمة الدخول. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.';
}

async function refreshProfile() {
  const requestNumber = ++latestCheck;
  if (!busy) message('جارٍ التحقق من الهوية والصلاحيات…');
  const { data: userResult, error: authError } = await client.auth.getUser();
  if (requestNumber !== latestCheck) return;

  if (!userResult?.user) {
    show('login');
    message(authError && authError.name !== 'AuthSessionMissingError'
      ? 'تعذّر التحقق من الجلسة. حاول تسجيل الدخول مجددًا.'
      : 'أدخل البريد الإلكتروني وكلمة المرور لحسابك المصرّح به.');
    return;
  }

  if (passwordSetupRequired) {
    show('password');
    message('تم التحقق من رابط الدعوة. اختر كلمة مرور قوية لإكمال التفعيل.', 'success');
    return;
  }

  const userId = userResult.user.id;
  const { data: profile, error } = await client
    .from('staff_profiles')
    .select('full_name, role, is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (requestNumber !== latestCheck) return;
  show('profile');

  if (error) {
    el('profileText').textContent = 'تم تسجيل الدخول، لكن تعذّر قراءة صلاحياتك. حاول تحديث الصلاحيات أو اتصل بالمسؤول.';
    el('centersText').textContent = '';
    message('تعذّر التحقق من صلاحيات قاعدة البيانات.', 'error');
    return;
  }

  if (!profile?.is_active) {
    el('profileText').textContent = 'تم إثبات هويتك بنجاح، لكن ليس لديك ملف موظف نشط في الجمعية. لا توجد صلاحية للوصول إلى بيانات التقارير.';
    el('centersText').textContent = '';
    message('في انتظار تفعيل حسابك من طرف الإدارة.');
    return;
  }

  el('profileText').textContent = 'مرحبًا ' + profile.full_name + ' — صفتك: ' +
    (labels[profile.role] || 'موظف');
  if (profile.role === 'admin') {
    el('centersText').textContent = 'صلاحية الإدارة مثبتة في قاعدة البيانات. إدارة الموظفين وربط التقارير ستكون في المرحلة القادمة.';
  } else {
    const { data: memberships, error: membershipError } = await client
      .from('center_memberships')
      .select('center_id')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (requestNumber !== latestCheck) return;
    el('centersText').textContent = membershipError
      ? 'تعذّر التحقق من المراكز المصرح بها.'
      : 'عدد المراكز المسموح بها: ' + (memberships?.length ?? 0);
  }
  message('تم التحقق من هوية الموظف وصلاحيته بواسطة Supabase.', 'success');
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const email = el('email').value.trim();
  const password = el('password').value;
  if (!email || !password) return;
  setBusy(true);
  message('جارٍ تسجيل الدخول…');
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    el('password').value = '';
    if (error) {
      message(friendlyError(error), 'error');
      return;
    }
    await refreshProfile();
  } catch {
    message('تعذّر الاتصال بخدمة الدخول. حاول مجددًا.', 'error');
  } finally {
    setBusy(false);
  }
});

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const password = el('newPassword').value;
  const confirm = el('confirmPassword').value;
  if (password.length < 12 || password !== confirm) {
    message('تأكد من مطابقة كلمتي المرور وأن طولها 12 حرفًا على الأقل.', 'error');
    return;
  }
  setBusy(true);
  message('جارٍ تفعيل كلمة المرور…');
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      message('تعذّر حفظ كلمة المرور. اطلب إعادة إرسال الدعوة إذا انتهت صلاحيتها.', 'error');
      return;
    }
    el('newPassword').value = '';
    el('confirmPassword').value = '';
    passwordSetupRequired = false;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    await refreshProfile();
  } catch {
    message('تعذّر الاتصال بالخدمة. حاول مرة أخرى.', 'error');
  } finally {
    setBusy(false);
  }
});

el('logoutButton').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  message('جارٍ إنهاء الجلسة…');
  try {
    const { error } = await client.auth.signOut();
    if (error) {
      message('تعذر تسجيل الخروج عبر الخادم. أعد المحاولة.', 'error');
      return;
    }
    passwordSetupRequired = false;
    latestCheck++;
    show('login');
    message('تم تسجيل الخروج من حسابك.', 'success');
  } catch {
    message('تعذّر إكمال تسجيل الخروج. أعد المحاولة.', 'error');
  } finally {
    setBusy(false);
  }
});

el('reloadButton').addEventListener('click', () => {
  if (!busy) refreshProfile().catch(() => message('تعذّر تحديث الصلاحيات.', 'error'));
});

client.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    latestCheck++;
    passwordSetupRequired = false;
    show('login');
    message('تم تسجيل الخروج.');
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    // Do not await Supabase calls within the auth callback.
    setTimeout(() => refreshProfile().catch(() => message('تعذّر تحديث حالة الحساب.', 'error')), 0);
  }
});

refreshProfile().catch(() => {
  show('login');
  message('تعذّر تهيئة نظام الدخول. تحقق من اتصال الإنترنت.', 'error');
});
