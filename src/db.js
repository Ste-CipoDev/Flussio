import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON;

export const isConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Determine if browser is currently online
function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// LocalStorage helpers
const getLocal = (key, defaultValue) => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
};

const setLocal = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Queue for offline synchronization
const SYNC_QUEUE_KEY = 'flussio_sync_queue';

export function enqueueSync(type, payload) {
  if (!isConfigured) return;
  const queue = getLocal(SYNC_QUEUE_KEY, []);
  queue.push({ type, payload, timestamp: Date.now() });
  setLocal(SYNC_QUEUE_KEY, queue);
}

// Sync all offline changes to Supabase when connection is restored
export async function syncOfflineData() {
  if (!isConfigured || !isOnline()) return;
  const queue = getLocal(SYNC_QUEUE_KEY, []);
  if (queue.length === 0) return;

  console.log(`Flussio: Sincronizzazione di ${queue.length} modifiche offline in corso...`);
  const remainingQueue = [];

  for (const action of queue) {
    try {
      const { type, payload } = action;
      if (type === 'update_profile') {
        await supabase.from('profiles').upsert(payload);
      } else if (type === 'insert_monthly') {
        await supabase.from('monthly_commitments').insert(payload);
      } else if (type === 'update_monthly') {
        await supabase.from('monthly_commitments').update({ name: payload.name, day: payload.day, amount: payload.amount }).eq('id', payload.id).eq('user_id', payload.user_id);
      } else if (type === 'delete_monthly') {
        await supabase.from('monthly_commitments').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      } else if (type === 'insert_annual') {
        await supabase.from('annual_commitments').insert(payload);
      } else if (type === 'delete_annual') {
        await supabase.from('annual_commitments').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      } else if (type === 'confirm_annual') {
        await supabase.from('annual_payments_status').insert(payload);
      } else if (type === 'unconfirm_annual') {
        await supabase.from('annual_payments_status').delete().eq('annual_commitment_id', payload.annual_commitment_id).eq('year', payload.year).eq('user_id', payload.user_id);
      } else if (type === 'insert_planned') {
        await supabase.from('planned_expenses').insert(payload);
      } else if (type === 'delete_planned') {
        await supabase.from('planned_expenses').delete().eq('id', payload.id).eq('user_id', payload.user_id);
      }
    } catch (err) {
      console.error('Errore durante la sincronizzazione offline dell\'azione:', action, err);
      // Keep in queue only if it's a network error
      if (err.message && (err.message.includes('fetch') || err.message.includes('Network'))) {
        remainingQueue.push(action);
      }
    }
  }

  setLocal(SYNC_QUEUE_KEY, remainingQueue);
  console.log('Flussio: Sincronizzazione offline completata.');
}

// Setup network listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', syncOfflineData);
}

// Database interface (Hybrid: Supabase + LocalStorage Fallback)
export const db = {
  auth: {
    getUser: async () => {
      if (!isConfigured) {
        const loggedIn = localStorage.getItem('flussio_logged_in') === 'true';
        return loggedIn ? { id: 'local-user', email: 'locale@flussio.local' } : null;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
      } catch (err) {
        const loggedIn = localStorage.getItem('flussio_logged_in') === 'true';
        const cachedEmail = localStorage.getItem('flussio_cached_user_email') || 'offline@flussio.local';
        return loggedIn ? { id: 'offline-user', email: cachedEmail } : null;
      }
    },
    signUp: async (email, password) => {
      if (!isConfigured) {
        localStorage.setItem('flussio_logged_in', 'true');
        localStorage.setItem('flussio_cached_user_email', email);
        return { data: { user: { id: 'local-user', email } }, error: null };
      }
      return await supabase.auth.signUp({ email, password });
    },
    signIn: async (email, password) => {
      if (!isConfigured) {
        localStorage.setItem('flussio_logged_in', 'true');
        localStorage.setItem('flussio_cached_user_email', email);
        return { data: { user: { id: 'local-user', email } }, error: null };
      }
      const res = await supabase.auth.signInWithPassword({ email, password });
      if (!res.error && res.data?.user) {
        localStorage.setItem('flussio_logged_in', 'true');
        localStorage.setItem('flussio_cached_user_email', res.data.user.email);
      }
      return res;
    },
    signOut: async () => {
      localStorage.setItem('flussio_logged_in', 'false');
      if (!isConfigured) return { error: null };
      return await supabase.auth.signOut();
    },
    onAuthStateChange: (callback) => {
      if (!isConfigured) {
        const getLocalUser = () => {
          const loggedIn = localStorage.getItem('flussio_logged_in') === 'true';
          const email = localStorage.getItem('flussio_cached_user_email') || 'locale@flussio.local';
          return loggedIn ? { id: 'local-user', email } : null;
        };
        // Trigger initial check
        setTimeout(() => callback('SIGNED_IN', getLocalUser()), 0);
        
        const storageHandler = (e) => {
          if (e.key === 'flussio_logged_in') {
            callback(e.newValue === 'true' ? 'SIGNED_IN' : 'SIGNED_OUT', getLocalUser());
          }
        };
        window.addEventListener('storage', storageHandler);
        return () => window.removeEventListener('storage', storageHandler);
      }
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          localStorage.setItem('flussio_logged_in', 'true');
          localStorage.setItem('flussio_cached_user_email', session.user.email);
        } else {
          localStorage.setItem('flussio_logged_in', 'false');
        }
        callback(event, session ? session.user : null);
      });
      return () => subscription.unsubscribe();
    },
    deleteAccount: async () => {
      if (!isConfigured) {
        localStorage.clear();
        return { error: null };
      }
      const { error } = await supabase.rpc('delete_user');
      if (!error) {
        localStorage.clear();
        await supabase.auth.signOut();
      }
      return { error };
    }
  },

  profile: {
    get: async (userId) => {
      const cacheKey = `flussio_profile_${userId}`;
      if (!isConfigured || !isOnline()) {
        return getLocal(cacheKey, { id: userId, salary_day: 27, current_balance: 0.00 });
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        const defaultProfile = { id: userId, salary_day: 27, current_balance: 0.00 };
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select()
          .single();
        if (insertError) {
          console.error("Errore nell'inserimento del profilo di default:", insertError);
        }
        const finalProfile = newProfile || defaultProfile;
        setLocal(cacheKey, finalProfile);
        return finalProfile;
      }
      if (!error && data) {
        setLocal(cacheKey, data);
      }
      return data;
    },
    update: async (userId, updates) => {
      const cacheKey = `flussio_profile_${userId}`;
      const localProfile = getLocal(cacheKey, { id: userId, salary_day: 27, current_balance: 0.00 });
      const updatedProfile = { ...localProfile, ...updates, updated_at: new Date().toISOString() };
      setLocal(cacheKey, updatedProfile);

      if (!isConfigured || !isOnline()) {
        enqueueSync('update_profile', updatedProfile);
        return { data: updatedProfile, error: null };
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single();
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
      }
      return { data: data || getLocal(cacheKey, []), error };
    },
    insert: async (userId, { name, day, amount }) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const localList = getLocal(cacheKey, []);
      const newItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        user_id: userId,
        name,
        day: parseInt(day),
        amount: parseFloat(amount),
        created_at: new Date().toISOString()
      };
      
      localList.push(newItem);
      localList.sort((a, b) => a.day - b.day);
      setLocal(cacheKey, localList);

      if (!isConfigured || !isOnline()) {
        enqueueSync('insert_monthly', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('monthly_commitments')
        .insert({ user_id: userId, name, day: parseInt(day), amount: parseFloat(amount) })
        .select()
        .single();
      if (!error && data) {
        const freshList = localList.map(item => item.id === newItem.id ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data: data || newItem, error };
    },
    update: async (userId, id, { name, day, amount }) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const localList = getLocal(cacheKey, []);
      const updatedItem = {
        id,
        user_id: userId,
        name,
        day: parseInt(day),
        amount: parseFloat(amount),
        created_at: new Date().toISOString()
      };
      
      const newList = localList.map(item => item.id === id ? { ...item, ...updatedItem } : item);
      newList.sort((a, b) => a.day - b.day);
      setLocal(cacheKey, newList);

      if (!isConfigured || !isOnline()) {
        enqueueSync('update_monthly', updatedItem);
        return { data: updatedItem, error: null };
      }

      const { data, error } = await supabase
        .from('monthly_commitments')
        .update({ name, day: parseInt(day), amount: parseFloat(amount) })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (!error && data) {
        const freshList = newList.map(item => item.id === id ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data: data || updatedItem, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, localList.filter(item => item.id !== id));

      if (!isConfigured || !isOnline()) {
        enqueueSync('delete_monthly', { id, user_id: userId });
        return { error: null };
      }
      return await supabase
        .from('monthly_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    },
    clear: async (userId) => {
      const cacheKey = `flussio_monthly_${userId}`;
      setLocal(cacheKey, []);
      if (!isConfigured || !isOnline()) return { error: null };
      return await supabase.from('monthly_commitments').delete().eq('user_id', userId);
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_monthly_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        day: parseInt(item.day),
        amount: parseFloat(item.amount),
        created_at: new Date().toISOString()
      }));
      setLocal(cacheKey, formattedItems);

      if (!isConfigured || !isOnline()) {
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
      return { data: data || formattedItems, error };
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
      }
      return { data: data || getLocal(cacheKey, []), error };
    },
    insert: async (userId, { name, month, amount }) => {
      const cacheKey = `flussio_annual_${userId}`;
      const localList = getLocal(cacheKey, []);
      const newItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        user_id: userId,
        name,
        month: parseInt(month),
        amount: parseFloat(amount),
        created_at: new Date().toISOString()
      };
      
      localList.push(newItem);
      localList.sort((a, b) => a.month - b.month);
      setLocal(cacheKey, localList);

      if (!isConfigured || !isOnline()) {
        enqueueSync('insert_annual', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('annual_commitments')
        .insert({ user_id: userId, name, month: parseInt(month), amount: parseFloat(amount) })
        .select()
        .single();
      if (!error && data) {
        const freshList = localList.map(item => item.id === newItem.id ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data: data || newItem, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_annual_${userId}`;
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, localList.filter(item => item.id !== id));

      const statusKey = `flussio_annual_status_${userId}`;
      const localStatus = getLocal(statusKey, []);
      setLocal(statusKey, localStatus.filter(s => s.annual_commitment_id !== id));

      if (!isConfigured || !isOnline()) {
        enqueueSync('delete_annual', { id, user_id: userId });
        return { error: null };
      }
      return await supabase
        .from('annual_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    },
    clear: async (userId) => {
      const cacheKey = `flussio_annual_${userId}`;
      setLocal(cacheKey, []);
      const statusKey = `flussio_annual_status_${userId}`;
      setLocal(statusKey, []);
      if (!isConfigured || !isOnline()) return { error: null };
      return await supabase.from('annual_commitments').delete().eq('user_id', userId);
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_annual_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        month: parseInt(item.month),
        amount: parseFloat(item.amount),
        created_at: new Date().toISOString()
      }));
      setLocal(cacheKey, formattedItems);

      if (!isConfigured || !isOnline()) {
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
      return { data: data || formattedItems, error };
    }
  },

  annualStatus: {
    list: async (userId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      if (!isConfigured || !isOnline()) {
        const allStatus = getLocal(cacheKey, []);
        return { data: allStatus.filter(s => s.year === year), error: null };
      }
      const { data, error } = await supabase
        .from('annual_payments_status')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year);
      if (!error && data) {
        const cached = getLocal(cacheKey, []);
        const otherYears = cached.filter(s => s.year !== year);
        setLocal(cacheKey, [...otherYears, ...data]);
      }
      return { data: data || [], error };
    },
    confirm: async (userId, annualCommitmentId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      const localList = getLocal(cacheKey, []);
      const newItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        user_id: userId,
        annual_commitment_id: annualCommitmentId,
        year: parseInt(year),
        confirmed_at: new Date().toISOString()
      };
      
      localList.push(newItem);
      setLocal(cacheKey, localList);

      if (!isConfigured || !isOnline()) {
        enqueueSync('confirm_annual', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('annual_payments_status')
        .insert({ user_id: userId, annual_commitment_id: annualCommitmentId, year: parseInt(year) })
        .select()
        .single();
      if (!error && data) {
        const freshList = localList.map(item => item.annual_commitment_id === annualCommitmentId && item.year === year ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data: data || newItem, error };
    },
    unconfirm: async (userId, annualCommitmentId, year) => {
      const cacheKey = `flussio_annual_status_${userId}`;
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, localList.filter(item => !(item.annual_commitment_id === annualCommitmentId && item.year === parseInt(year))));

      if (!isConfigured || !isOnline()) {
        enqueueSync('unconfirm_annual', { user_id: userId, annual_commitment_id: annualCommitmentId, year: parseInt(year) });
        return { error: null };
      }
      return await supabase
        .from('annual_payments_status')
        .delete()
        .eq('user_id', userId)
        .eq('annual_commitment_id', annualCommitmentId)
        .eq('year', year);
    }
  },

  planned: {
    list: async (userId, month, year) => {
      const cacheKey = `flussio_planned_${userId}`;
      if (!isConfigured || !isOnline()) {
        const allPlanned = getLocal(cacheKey, []);
        return { data: allPlanned.filter(p => p.month === month && p.year === year), error: null };
      }
      const { data, error } = await supabase
        .from('planned_expenses')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year);
      if (!error && data) {
        const cached = getLocal(cacheKey, []);
        const otherMonths = cached.filter(p => !(p.month === month && p.year === year));
        setLocal(cacheKey, [...otherMonths, ...data]);
      }
      return { data: data || [], error };
    },
    insert: async (userId, { name, amount, month, year }) => {
      const cacheKey = `flussio_planned_${userId}`;
      const localList = getLocal(cacheKey, []);
      const newItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        user_id: userId,
        name,
        amount: parseFloat(amount),
        month: parseInt(month),
        year: parseInt(year),
        created_at: new Date().toISOString()
      };
      
      localList.push(newItem);
      setLocal(cacheKey, localList);

      if (!isConfigured || !isOnline()) {
        enqueueSync('insert_planned', newItem);
        return { data: newItem, error: null };
      }

      const { data, error } = await supabase
        .from('planned_expenses')
        .insert({ user_id: userId, name, amount: parseFloat(amount), month: parseInt(month), year: parseInt(year) })
        .select()
        .single();
      if (!error && data) {
        const freshList = localList.map(item => item.id === newItem.id ? data : item);
        setLocal(cacheKey, freshList);
      }
      return { data: data || newItem, error };
    },
    delete: async (userId, id) => {
      const cacheKey = `flussio_planned_${userId}`;
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, localList.filter(item => item.id !== id));

      if (!isConfigured || !isOnline()) {
        enqueueSync('delete_planned', { id, user_id: userId });
        return { error: null };
      }
      return await supabase
        .from('planned_expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
    },
    clear: async (userId, month, year) => {
      const cacheKey = `flussio_planned_${userId}`;
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, localList.filter(item => !(item.month === month && item.year === year)));

      if (!isConfigured || !isOnline()) return { error: null };
      return await supabase
        .from('planned_expenses')
        .delete()
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year);
    },
    insertBulk: async (userId, items) => {
      const cacheKey = `flussio_planned_${userId}`;
      const formattedItems = items.map(item => ({
        id: item.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
        user_id: userId,
        name: item.name,
        amount: parseFloat(item.amount),
        month: parseInt(item.month),
        year: parseInt(item.year),
        created_at: new Date().toISOString()
      }));
      
      const localList = getLocal(cacheKey, []);
      setLocal(cacheKey, [...localList, ...formattedItems]);

      if (!isConfigured || !isOnline()) {
        formattedItems.forEach(item => enqueueSync('insert_planned', item));
        return { data: formattedItems, error: null };
      }

      const { data, error } = await supabase
        .from('planned_expenses')
        .insert(formattedItems.map(item => ({ user_id: userId, name: item.name, amount: item.amount, month: item.month, year: item.year })))
        .select();
      if (!error && data) {
        setLocal(cacheKey, data);
      }
      return { data: data || formattedItems, error };
    }
  }
};
