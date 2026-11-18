import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON;

export const isConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Use sessionStorage instead of localStorage to reduce XSS exposure:
        // the JWT token is automatically cleared when the browser tab is closed.
        storage: window.sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Determine if browser is currently online
function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// LocalStorage helpers
const getLocal = (key, defaultValue) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setLocal = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

function clearFlussioStorage() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('flussio_') && key !== 'flussio_chart_type') {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// Local-mode auth subscribers (notified within the same tab as well)
const localAuthListeners = new Set();

function getLocalAuthUser() {
  const loggedIn = localStorage.getItem('flussio_logged_in') === 'true';
  const email = localStorage.getItem('flussio_cached_user_email') || 'locale@flussio.local';
  return loggedIn ? { id: 'local-user', email } : null;
}

function notifyLocalAuth(event, user) {
  localAuthListeners.forEach((cb) => {
    try {
      cb(event, user);
    } catch (err) {
      console.error('Errore listener auth locale:', err);
    }
  });
}

// Queue for offline synchronization
const SYNC_QUEUE_KEY = 'flussio_sync_queue';

export function enqueueSync(type, payload) {
  if (!isConfigured) return;
  const queue = getLocal(SYNC_QUEUE_KEY, []);
  queue.push({ type, payload, timestamp: Date.now() });
  setLocal(SYNC_QUEUE_KEY, queue);
}

function isTransientSyncError(error) {
  if (!error) return false;
  const status = error.status || 0;
  const msg = (error.message || '').toLowerCase();
  return status >= 500 || msg.includes('fetch') || msg.includes('network') || msg.includes('timeout');
}

// Sync all offline changes to Supabase when connection is restored or on startup
export async function syncOfflineData(expectedUserId = null) {
  if (!isConfigured || !isOnline()) return { synced: 0 };
  const queue = getLocal(SYNC_QUEUE_KEY, []);
  if (queue.length === 0) return { synced: 0 };

  let activeUserId = expectedUserId;
  if (!activeUserId) {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    activeUserId = session?.user?.id || null;
  }
  if (!activeUserId) return { synced: 0 };

  console.log(`Flussio: Sincronizzazione di ${queue.length} modifiche offline in corso...`);
  const remainingQueue = [];
  let syncedCount = 0;

  for (const action of queue) {
    const { type, payload } = action;
    const actionUserId = payload?.user_id ?? payload?.id;
    if (actionUserId && actionUserId !== activeUserId) {
      // Preserve queued actions belonging to another account
      remainingQueue.push(action);
      continue;
    }

    try {
      let result = null;
      if (type === 'update_profile') {
        result = await supabase.from('profiles').upsert({
          id: payload.id,
          salary_day: payload.salary_day,
          salary_amount: payload.salary_amount ?? 0.00,
          current_balance: payload.current_balance,
          updated_at: payload.updated_at || new Date().toISOString()
        });
      } else if (type === 'insert_monthly') {
        result = await supabase.from('monthly_commitments').insert(payload);
      } else if (type === 'update_monthly') {
        result = await supabase
          .from('monthly_commitments')
          .update({ name: payload.name, day: payload.day, amount: payload.amount })
          .eq('id', payload.id)
          .eq('user_id', payload.user_id);
      } else if (type === 'delete_monthly') {
        result = await supabase.from('monthly_commitments').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      } else if (type === 'insert_annual') {
        result = await supabase.from('annual_commitments').insert(payload);
      } else if (type === 'delete_annual') {
        result = await supabase.from('annual_commitments').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      } else if (type === 'confirm_annual') {
        result = await supabase.from('annual_payments_status').insert(payload);
      } else if (type === 'unconfirm_annual') {
        result = await supabase
          .from('annual_payments_status')
          .delete()
          .eq('annual_commitment_id', payload.annual_commitment_id)
          .eq('year', payload.year)
          .eq('user_id', payload.user_id);
      } else if (type === 'insert_planned') {
        result = await supabase.from('planned_expenses').insert(payload);
      } else if (type === 'update_planned') {
        result = await supabase
          .from('planned_expenses')
          .update({ name: payload.name, amount: payload.amount })
          .eq('id', payload.id)
          .eq('user_id', payload.user_id);
      } else if (type === 'delete_planned') {
        result = await supabase.from('planned_expenses').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      }

      if (result?.error) {
        // Ignore duplicate key on idempotent confirm_annual
        if (type === 'confirm_annual' && result.error.code === '23505') {
          syncedCount++;
        } else {
          console.error('Errore Supabase durante la sincronizzazione offline:', action, result.error);
          if (isTransientSyncError(result.error)) {
            remainingQueue.push(action);
          }
        }
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error('Errore durante la sincronizzazione offline dell\'azione:', action, err);
      if (isTransientSyncError(err)) {
        remainingQueue.push(action);
      }
    }
  }

  setLocal(SYNC_QUEUE_KEY, remainingQueue);
  console.log(`Flussio: Sincronizzazione offline completata (${syncedCount} applicate, ${remainingQueue.length} in coda).`);
  return { synced: syncedCount };
}

// Setup network listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    const { synced } = await syncOfflineData();
    if (synced > 0) {
      window.dispatchEvent(new CustomEvent('flussio:synced'));
    }
  });
}

// Database interface (Hybrid: Supabase + LocalStorage Fallback)
export const db = {
  auth: {
    getUser: async () => {
      // Local mode (no Supabase configured): use localStorage as fallback
      if (!isConfigured) {
        return getLocalAuthUser();
      }
      try {
        // Supabase is the single source of truth for auth state
        const { data: { user } } = await supabase.auth.getUser();
        return user;
      } catch (err) {
        // Network error: try to restore from active session in sessionStorage
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        return session?.user ?? null;
      }
    },
    signUp: async (email, password) => {
      // Local mode (no Supabase configured)
      if (!isConfigured) {
        localStorage.setItem('flussio_logged_in', 'true');
        localStorage.setItem('flussio_cached_user_email', email);
        const user = { id: 'local-user', email };
        notifyLocalAuth('SIGNED_IN', user);
        return { data: { user, session: { user } }, error: null };
      }
      // Supabase signUp – if email confirmation is enabled, session will be null
      return await supabase.auth.signUp({ email, password });
    },
    signIn: async (email, password) => {
      // Local mode (no Supabase configured)
      if (!isConfigured) {
        localStorage.setItem('flussio_logged_in', 'true');
        localStorage.setItem('flussio_cached_user_email', email);
        const user = { id: 'local-user', email };
        notifyLocalAuth('SIGNED_IN', user);
        return { data: { user }, error: null };
      }
      // Token is stored in sessionStorage automatically via the client config above
      return await supabase.auth.signInWithPassword({ email, password });
    },
    signOut: async () => {
      if (!isConfigured) {
        localStorage.setItem('flussio_logged_in', 'false');
        notifyLocalAuth('SIGNED_OUT', null);
        return { error: null };
      }
      // Supabase signOut clears the token from sessionStorage automatically
      return await supabase.auth.signOut();
    },
    onAuthStateChange: (callback) => {
      // Local mode (no Supabase configured): use localStorage + in-tab listener
      if (!isConfigured) {
        localAuthListeners.add(callback);
        setTimeout(() => {
          const user = getLocalAuthUser();
          callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user);
        }, 0);
        const storageHandler = (e) => {
          if (e.key === 'flussio_logged_in') {
            const user = getLocalAuthUser();
            callback(e.newValue === 'true' ? 'SIGNED_IN' : 'SIGNED_OUT', user);
          }
        };
        window.addEventListener('storage', storageHandler);
        return () => {
          localAuthListeners.delete(callback);
          window.removeEventListener('storage', storageHandler);
        };
      }

      // Supabase mode: no manual localStorage writes needed.
      // The session is managed entirely by the Supabase client (sessionStorage).
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session ? session.user : null);
      });
      return () => subscription.unsubscribe();
    },
    deleteAccount: async () => {
      if (!isConfigured) {
        clearFlussioStorage();
        notifyLocalAuth('SIGNED_OUT', null);
        return { error: null };
      }
      const { error } = await supabase.rpc('delete_user');
      if (!error) {
        clearFlussioStorage();
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // User already deleted on auth.users; local session cleared
        }
      }
      return { error };
    }
  },

  profile: {
    get: async (userId) => {
      const cacheKey = `flussio_profile_${userId}`;
      const defaultProfile = { id: userId, salary_day: 27, salary_amount: 0.00, current_balance: 0.00 };
      if (!isConfigured || !isOnline()) {
        return getLocal(cacheKey, defaultProfile);
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select()
          .single();
        if (insertError) {
          console.error("Errore nell'inserimento del profilo di default:", insertError);
          return getLocal(cacheKey, defaultProfile);
        }
        const finalProfile = newProfile || defaultProfile;
        setLocal(cacheKey, finalProfile);
        return finalProfile;
      }
      if (!error && data) {
        setLocal(cacheKey, data);
        return data;
      }
      return getLocal(cacheKey, defaultProfile);
    },
    update: async (userId, updates) => {
      const cacheKey = `flussio_profile_${userId}`;
      const localProfile = getLocal(cacheKey, { id: userId, salary_day: 27, salary_amount: 0.00, current_balance: 0.00 });
      const updatedAt = new Date().toISOString();
      const updatedProfile = { ...localProfile, ...updates, updated_at: updatedAt };

      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, updatedProfile);
        enqueueSync('update_profile', updatedProfile);
        return { data: updatedProfile, error: null };
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates, updated_at: updatedAt })
        .select()
        .single();
      if (!error && data) {
        setLocal(cacheKey, data);
      }
      return { data, error };
    }
  },

  monthly: {
    list: async (userId) => {
      const cacheKey = `flussio_monthly_${userId}`;
      if (!isConfigured || !isOnline()) {
        return { data: getLocal(cacheKey, []), error: null };
      }
      const { data, error } = await supabase
        .from('monthly_commitments')
        .select('*')
        .eq('user_id', userId)
        .order('day', { ascending: true });
      if (!error && data) {
        setLocal(cacheKey, data);
        return { data, error: null };
      }
      return { data: getLocal(cacheKey, []), error };
    },
    insert: async (userId, { name, day, amount }) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const parsedDay = parseInt(day, 10);
      const parsedAmount = parseFloat(amount);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const newItem = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          user_id: userId,
          name,
          day: parsedDay,
          amount: parsedAmount,
          created_at: new Date().toISOString()
        };
        localList.push(newItem);
        localList.sort((a, b) => a.day - b.day);
        setLocal(cacheKey, localList);
        enqueueSync('insert_monthly', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('monthly_commitments')
        .insert({ user_id: userId, name, day: parsedDay, amount: parsedAmount })
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        localList.push(data);
        localList.sort((a, b) => a.day - b.day);
        setLocal(cacheKey, localList);
      }
      return { data, error };
    },
    update: async (userId, id, { name, day, amount }) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const parsedDay = parseInt(day, 10);
      const parsedAmount = parseFloat(amount);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const existing = localList.find(item => item.id === id) || {};
        const updatedItem = {
          ...existing,
          id,
          user_id: userId,
          name,
          day: parsedDay,
          amount: parsedAmount
        };
        const newList = localList.map(item => item.id === id ? updatedItem : item);
        newList.sort((a, b) => a.day - b.day);
        setLocal(cacheKey, newList);
        enqueueSync('update_monthly', updatedItem);
        return { data: updatedItem, error: null };
      }

      const { data, error } = await supabase
        .from('monthly_commitments')
        .update({ name, day: parsedDay, amount: parsedAmount })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        const freshList = localList.map(item => item.id === id ? data : item);
        freshList.sort((a, b) => a.day - b.day);
        setLocal(cacheKey, freshList);
      }
      return { data, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_monthly_${userId}`;

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => item.id !== id));
        enqueueSync('delete_monthly', { id, user_id: userId });
        return { error: null };
      }
      const res = await supabase
        .from('monthly_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (!res.error) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => item.id !== id));
      }
      return res;
    },
    clear: async (userId) => {
      const cacheKey = `flussio_monthly_${userId}`;
      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, []);
        return { error: null };
      }
      const res = await supabase.from('monthly_commitments').delete().eq('user_id', userId);
      if (!res.error) {
        setLocal(cacheKey, []);
      }
      return res;
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        day: parseInt(item.day, 10),
        amount: parseFloat(item.amount),
        created_at: new Date().toISOString()
      }));

      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, formattedItems);
        formattedItems.forEach(item => enqueueSync('insert_monthly', item));
        return { data: formattedItems, error: null };
      }

      const { data, error } = await supabase
        .from('monthly_commitments')
        .insert(formattedItems.map(item => ({ user_id: userId, name: item.name, day: item.day, amount: item.amount })))
        .select();
      if (!error && data) {
        setLocal(cacheKey, data);
      }
      return { data, error };
    }
  },

  annual: {
    list: async (userId) => {
      const cacheKey = `flussio_annual_${userId}`;
      if (!isConfigured || !isOnline()) {
        return { data: getLocal(cacheKey, []), error: null };
      }
      const { data, error } = await supabase
        .from('annual_commitments')
        .select('*')
        .eq('user_id', userId)
        .order('month', { ascending: true });
      if (!error && data) {
        setLocal(cacheKey, data);
        return { data, error: null };
      }
      return { data: getLocal(cacheKey, []), error };
    },
    insert: async (userId, { name, month, amount }) => {
      const cacheKey = `flussio_annual_${userId}`;
      const parsedMonth = parseInt(month, 10);
      const parsedAmount = parseFloat(amount);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const newItem = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          user_id: userId,
          name,
          month: parsedMonth,
          amount: parsedAmount,
          created_at: new Date().toISOString()
        };
        localList.push(newItem);
        localList.sort((a, b) => a.month - b.month);
        setLocal(cacheKey, localList);
        enqueueSync('insert_annual', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('annual_commitments')
        .insert({ user_id: userId, name, month: parsedMonth, amount: parsedAmount })
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        localList.push(data);
        localList.sort((a, b) => a.month - b.month);
        setLocal(cacheKey, localList);
      }
      return { data, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_annual_${userId}`;
      const statusKey = `flussio_annual_status_${userId}`;

      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, getLocal(cacheKey, []).filter(item => item.id !== id));
        setLocal(statusKey, getLocal(statusKey, []).filter(s => s.annual_commitment_id !== id));
        enqueueSync('delete_annual', { id, user_id: userId });
        return { error: null };
      }
      const res = await supabase
        .from('annual_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (!res.error) {
        setLocal(cacheKey, getLocal(cacheKey, []).filter(item => item.id !== id));
        setLocal(statusKey, getLocal(statusKey, []).filter(s => s.annual_commitment_id !== id));
      }
      return res;
    },
    clear: async (userId) => {
      const cacheKey = `flussio_annual_${userId}`;
      const statusKey = `flussio_annual_status_${userId}`;
      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, []);
        setLocal(statusKey, []);
        return { error: null };
      }
      const res = await supabase.from('annual_commitments').delete().eq('user_id', userId);
      if (!res.error) {
        setLocal(cacheKey, []);
        setLocal(statusKey, []);
      }
      return res;
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_annual_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        month: parseInt(item.month, 10),
        amount: parseFloat(item.amount),
        created_at: new Date().toISOString()
      }));

      if (!isConfigured || !isOnline()) {
        setLocal(cacheKey, formattedItems);
        formattedItems.forEach(item => enqueueSync('insert_annual', item));
        return { data: formattedItems, error: null };
      }

      const { data, error } = await supabase
        .from('annual_commitments')
        .insert(formattedItems.map(item => ({ user_id: userId, name: item.name, month: item.month, amount: item.amount })))
        .select();
      if (!error && data) {
        setLocal(cacheKey, data);
      }
      return { data, error };
    }
  },

  annualStatus: {
    list: async (userId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      const parsedYear = parseInt(year, 10);
      if (!isConfigured || !isOnline()) {
        const allStatus = getLocal(cacheKey, []);
        return { data: allStatus.filter(s => s.year === parsedYear), error: null };
      }
      const { data, error } = await supabase
        .from('annual_payments_status')
        .select('*')
        .eq('user_id', userId)
        .eq('year', parsedYear);
      if (!error && data) {
        const cached = getLocal(cacheKey, []);
        const otherYears = cached.filter(s => s.year !== parsedYear);
        setLocal(cacheKey, [...otherYears, ...data]);
        return { data, error: null };
      }
      return { data: getLocal(cacheKey, []).filter(s => s.year === parsedYear), error };
    },
    confirm: async (userId, annualCommitmentId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      const parsedYear = parseInt(year, 10);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const existing = localList.find(
          item => item.annual_commitment_id === annualCommitmentId && item.year === parsedYear
        );
        if (existing) {
          return { data: existing, error: null };
        }
        const newItem = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          user_id: userId,
          annual_commitment_id: annualCommitmentId,
          year: parsedYear,
          confirmed_at: new Date().toISOString()
        };
        localList.push(newItem);
        setLocal(cacheKey, localList);
        enqueueSync('confirm_annual', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('annual_payments_status')
        .insert({ user_id: userId, annual_commitment_id: annualCommitmentId, year: parsedYear })
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        const filtered = localList.filter(
          item => !(item.annual_commitment_id === annualCommitmentId && item.year === parsedYear)
        );
        filtered.push(data);
        setLocal(cacheKey, filtered);
      }
      return { data, error };
    },
    unconfirm: async (userId, annualCommitmentId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      const parsedYear = parseInt(year, 10);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => !(item.annual_commitment_id === annualCommitmentId && item.year === parsedYear)));
        enqueueSync('unconfirm_annual', { user_id: userId, annual_commitment_id: annualCommitmentId, year: parsedYear });
        return { error: null };
      }
      const res = await supabase
        .from('annual_payments_status')
        .delete()
        .eq('user_id', userId)
        .eq('annual_commitment_id', annualCommitmentId)
        .eq('year', parsedYear);
      if (!res.error) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => !(item.annual_commitment_id === annualCommitmentId && item.year === parsedYear)));
      }
      return res;
    }
  },

  planned: {
    list: async (userId, month, year) => {
      const cacheKey = `flussio_planned_${userId}`;
      const parsedMonth = parseInt(month, 10);
      const parsedYear = parseInt(year, 10);
      if (!isConfigured || !isOnline()) {
        const allPlanned = getLocal(cacheKey, []);
        return { data: allPlanned.filter(p => p.month === parsedMonth && p.year === parsedYear), error: null };
      }
      const { data, error } = await supabase
        .from('planned_expenses')
        .select('*')
        .eq('user_id', userId)
        .eq('month', parsedMonth)
        .eq('year', parsedYear);
      if (!error && data) {
        const cached = getLocal(cacheKey, []);
        const otherMonths = cached.filter(p => !(p.month === parsedMonth && p.year === parsedYear));
        setLocal(cacheKey, [...otherMonths, ...data]);
        return { data, error: null };
      }
      return { data: getLocal(cacheKey, []).filter(p => p.month === parsedMonth && p.year === parsedYear), error };
    },
    insert: async (userId, { name, amount, month, year }) => {
      const cacheKey = `flussio_planned_${userId}`;
      const now = new Date();
      const parsedMonth = Number.isFinite(parseInt(month, 10)) ? parseInt(month, 10) : now.getMonth() + 1;
      const parsedYear = Number.isFinite(parseInt(year, 10)) ? parseInt(year, 10) : now.getFullYear();
      const parsedAmount = parseFloat(amount);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const newItem = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          user_id: userId,
          name,
          amount: parsedAmount,
          month: parsedMonth,
          year: parsedYear,
          created_at: new Date().toISOString()
        };
        localList.push(newItem);
        setLocal(cacheKey, localList);
        enqueueSync('insert_planned', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('planned_expenses')
        .insert({ user_id: userId, name, amount: parsedAmount, month: parsedMonth, year: parsedYear })
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        localList.push(data);
        setLocal(cacheKey, localList);
      }
      return { data, error };
    },
    update: async (userId, id, { name, amount }) => {
      const cacheKey = `flussio_planned_${userId}`;
      const parsedAmount = parseFloat(amount);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        const existing = localList.find(item => item.id === id) || {};
        const updatedItem = {
          ...existing,
          id,
          user_id: userId,
          name,
          amount: parsedAmount
        };
        const newList = localList.map(item => item.id === id ? updatedItem : item);
        setLocal(cacheKey, newList);
        enqueueSync('update_planned', updatedItem);
        return { data: updatedItem, error: null };
      }

      const { data, error } = await supabase
        .from('planned_expenses')
        .update({ name, amount: parsedAmount })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        const freshList = localList.map(item => item.id === id ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_planned_${userId}`;

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => item.id !== id));
        enqueueSync('delete_planned', { id, user_id: userId });
        return { error: null };
      }
      const res = await supabase
        .from('planned_expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (!res.error) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => item.id !== id));
      }
      return res;
    },
    clear: async (userId, month, year) => {
      const cacheKey = `flussio_planned_${userId}`;
      const parsedMonth = parseInt(month, 10);
      const parsedYear = parseInt(year, 10);

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => !(item.month === parsedMonth && item.year === parsedYear)));
        return { error: null };
      }
      const res = await supabase
        .from('planned_expenses')
        .delete()
        .eq('user_id', userId)
        .eq('month', parsedMonth)
        .eq('year', parsedYear);
      if (!res.error) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, localList.filter(item => !(item.month === parsedMonth && item.year === parsedYear)));
      }
      return res;
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_planned_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        amount: parseFloat(item.amount),
        month: parseInt(item.month, 10),
        year: parseInt(item.year, 10),
        created_at: new Date().toISOString()
      }));

      if (!isConfigured || !isOnline()) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, [...localList, ...formattedItems]);
        formattedItems.forEach(item => enqueueSync('insert_planned', item));
        return { data: formattedItems, error: null };
      }

      const { data, error } = await supabase
        .from('planned_expenses')
        .insert(formattedItems.map(item => ({ user_id: userId, name: item.name, amount: item.amount, month: item.month, year: item.year })))
        .select();
      if (!error && data) {
        const localList = getLocal(cacheKey, []);
        setLocal(cacheKey, [...localList, ...data]);
      }
      return { data, error };
    }
  }
};
