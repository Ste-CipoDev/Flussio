import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON;

// Check if Supabase credentials are configured
export const isConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// LocalStorage Mock DB for Demo Mode
const localDb = {
  get: (key, defaultValue) => {
    const data = localStorage.getItem(`moneyflow_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  },
  set: (key, data) => {
    localStorage.setItem(`moneyflow_${key}`, JSON.stringify(data));
  }
};

// Database interface wrapper
export const db = {
  // Authentication
  auth: {
    getUser: async () => {
      if (isConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
      } else {
        // Return demo user if demo session is active
        const isDemoLoggedIn = localDb.get('demo_logged_in', false);
        return isDemoLoggedIn ? { id: 'demo-user-id', email: 'demo@moneyflow.app' } : null;
      }
    },
    signUp: async (email, password) => {
      if (isConfigured) {
        return await supabase.auth.signUp({ email, password });
      } else {
        // Mock sign up
        localDb.set('demo_logged_in', true);
        return { data: { user: { id: 'demo-user-id', email } }, error: null };
      }
    },
    signIn: async (email, password) => {
      if (isConfigured) {
        return await supabase.auth.signInWithPassword({ email, password });
      } else {
        // Mock sign in
        localDb.set('demo_logged_in', true);
        return { data: { user: { id: 'demo-user-id', email } }, error: null };
      }
    },
    signOut: async () => {
      if (isConfigured) {
        return await supabase.auth.signOut();
      } else {
        localDb.set('demo_logged_in', false);
        return { error: null };
      }
    },
    onAuthStateChange: (callback) => {
      if (isConfigured) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          callback(event, session ? session.user : null);
        });
        return () => subscription.unsubscribe();
      } else {
        // Simple polling for state changes in demo mode
        const interval = setInterval(async () => {
          const user = await db.auth.getUser();
          callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user);
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  },

  // Profile (User Settings & Balance)
  profile: {
    get: async (userId) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        // If profile doesn't exist yet, insert it (in case trigger fails)
        if (error && error.code === 'PGRST116') {
          const defaultProfile = { id: userId, salary_day: 27, current_balance: 0.00 };
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert(defaultProfile)
            .select()
            .single();
          return newProfile;
        }
        return data;
      } else {
        const profiles = localDb.get('profiles', {});
        if (!profiles[userId]) {
          profiles[userId] = { id: userId, salary_day: 27, current_balance: 0.00 };
          localDb.set('profiles', profiles);
        }
        return profiles[userId];
      }
    },
    update: async (userId, updates) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('profiles')
          .update({ ...updates, updated_at: new Date() })
          .eq('id', userId)
          .select()
          .single();
        return { data, error };
      } else {
        const profiles = localDb.get('profiles', {});
        profiles[userId] = { ...(profiles[userId] || { id: userId }), ...updates };
        localDb.set('profiles', profiles);
        return { data: profiles[userId], error: null };
      }
    }
  },

  // Monthly Commitments
  monthly: {
    list: async (userId) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('monthly_commitments')
          .select('*')
          .eq('user_id', userId)
          .order('day', { ascending: true });
        return { data: data || [], error };
      } else {
        const items = localDb.get('monthly_commitments', []);
        const userItems = items.filter(item => item.user_id === userId);
        userItems.sort((a, b) => a.day - b.day);
        return { data: userItems, error: null };
      }
    },
    insert: async (userId, { name, day, amount }) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('monthly_commitments')
          .insert({ user_id: userId, name, day: parseInt(day), amount: parseFloat(amount) })
          .select()
          .single();
        return { data, error };
      } else {
        const items = localDb.get('monthly_commitments', []);
        const newItem = {
          id: Math.random().toString(36).substring(2),
          user_id: userId,
          name,
          day: parseInt(day),
          amount: parseFloat(amount),
          created_at: new Date().toISOString()
        };
        items.push(newItem);
        localDb.set('monthly_commitments', items);
        return { data: newItem, error: null };
      }
    },
    delete: async (userId, id) => {
      if (isConfigured) {
        const { error } = await supabase
          .from('monthly_commitments')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        return { error };
      } else {
        const items = localDb.get('monthly_commitments', []);
        const filtered = items.filter(item => !(item.id === id && item.user_id === userId));
        localDb.set('monthly_commitments', filtered);
        return { error: null };
      }
    }
  },

  // Annual Commitments
  annual: {
    list: async (userId) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('annual_commitments')
          .select('*')
          .eq('user_id', userId)
          .order('month', { ascending: true });
        return { data: data || [], error };
      } else {
        const items = localDb.get('annual_commitments', []);
        const userItems = items.filter(item => item.user_id === userId);
        userItems.sort((a, b) => a.month - b.month);
        return { data: userItems, error: null };
      }
    },
    insert: async (userId, { name, month, amount }) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('annual_commitments')
          .insert({ user_id: userId, name, month: parseInt(month), amount: parseFloat(amount) })
          .select()
          .single();
        return { data, error };
      } else {
        const items = localDb.get('annual_commitments', []);
        const newItem = {
          id: Math.random().toString(36).substring(2),
          user_id: userId,
          name,
          month: parseInt(month),
          amount: parseFloat(amount),
          created_at: new Date().toISOString()
        };
        items.push(newItem);
        localDb.set('annual_commitments', items);
        return { data: newItem, error: null };
      }
    },
    delete: async (userId, id) => {
      if (isConfigured) {
        const { error } = await supabase
          .from('annual_commitments')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        return { error };
      } else {
        const items = localDb.get('annual_commitments', []);
        const filtered = items.filter(item => !(item.id === id && item.user_id === userId));
        localDb.set('annual_commitments', filtered);
        return { error: null };
      }
    }
  },

  // Annual Payments Status
  annualStatus: {
    list: async (userId, year) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('annual_payments_status')
          .select('*')
          .eq('user_id', userId)
          .eq('year', year);
        return { data: data || [], error };
      } else {
        const statuses = localDb.get('annual_payments_status', []);
        const userStatuses = statuses.filter(s => s.user_id === userId && s.year === parseInt(year));
        return { data: userStatuses, error: null };
      }
    },
    confirm: async (userId, annualCommitmentId, year) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('annual_payments_status')
          .insert({ user_id: userId, annual_commitment_id: annualCommitmentId, year: parseInt(year) })
          .select()
          .single();
        return { data, error };
      } else {
        const statuses = localDb.get('annual_payments_status', []);
        // Check duplicate
        if (statuses.some(s => s.user_id === userId && s.annual_commitment_id === annualCommitmentId && s.year === parseInt(year))) {
          return { data: null, error: null };
        }
        const newStatus = {
          id: Math.random().toString(36).substring(2),
          user_id: userId,
          annual_commitment_id: annualCommitmentId,
          year: parseInt(year),
          confirmed_at: new Date().toISOString()
        };
        statuses.push(newStatus);
        localDb.set('annual_payments_status', statuses);
        return { data: newStatus, error: null };
      }
    },
    unconfirm: async (userId, annualCommitmentId, year) => {
      if (isConfigured) {
        const { error } = await supabase
          .from('annual_payments_status')
          .delete()
          .eq('user_id', userId)
          .eq('annual_commitment_id', annualCommitmentId)
          .eq('year', year);
        return { error };
      } else {
        const statuses = localDb.get('annual_payments_status', []);
        const filtered = statuses.filter(s => !(s.user_id === userId && s.annual_commitment_id === annualCommitmentId && s.year === parseInt(year)));
        localDb.set('annual_payments_status', filtered);
        return { error: null };
      }
    }
  },

  // Planned Expenses (supermarket, petrol, etc. budgeted for current month)
  planned: {
    list: async (userId, month, year) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('planned_expenses')
          .select('*')
          .eq('user_id', userId)
          .eq('month', month)
          .eq('year', year);
        return { data: data || [], error };
      } else {
        const items = localDb.get('planned_expenses', []);
        const userItems = items.filter(item => 
          item.user_id === userId && 
          item.month === parseInt(month) && 
          item.year === parseInt(year)
        );
        return { data: userItems, error: null };
      }
    },
    insert: async (userId, { name, amount, month, year }) => {
      if (isConfigured) {
        const { data, error } = await supabase
          .from('planned_expenses')
          .insert({ user_id: userId, name, amount: parseFloat(amount), month: parseInt(month), year: parseInt(year) })
          .select()
          .single();
        return { data, error };
      } else {
        const items = localDb.get('planned_expenses', []);
        const newItem = {
          id: Math.random().toString(36).substring(2),
          user_id: userId,
          name,
          amount: parseFloat(amount),
          month: parseInt(month),
          year: parseInt(year),
          created_at: new Date().toISOString()
        };
        items.push(newItem);
        localDb.set('planned_expenses', items);
        return { data: newItem, error: null };
      }
    },
    delete: async (userId, id) => {
      if (isConfigured) {
        const { error } = await supabase
          .from('planned_expenses')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        return { error };
      } else {
        const items = localDb.get('planned_expenses', []);
        const filtered = items.filter(item => !(item.id === id && item.user_id === userId));
        localDb.set('planned_expenses', filtered);
        return { error: null };
      }
    }
  }
};
