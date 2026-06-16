import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON;

// Check if credentials are configured
export const isConfigured = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Database interface wrapper (Cloud only)
export const db = {
  // Authentication
  auth: {
    getUser: async () => {
      if (!isConfigured) return null;
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    signUp: async (email, password) => {
      if (!isConfigured) return { error: new Error("Database non configurato") };
      return await supabase.auth.signUp({ email, password });
    },
    signIn: async (email, password) => {
      if (!isConfigured) return { error: new Error("Database non configurato") };
      return await supabase.auth.signInWithPassword({ email, password });
    },
    signOut: async () => {
      if (!isConfigured) return { error: null };
      return await supabase.auth.signOut();
    },
    onAuthStateChange: (callback) => {
      if (!isConfigured) return () => {};
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session ? session.user : null);
      });
      return () => subscription.unsubscribe();
    },
    deleteAccount: async () => {
      if (!isConfigured) return { error: new Error("Database non configurato") };
      const { error } = await supabase.rpc('delete_user');
      if (!error) {
        await supabase.auth.signOut();
      }
      return { error };
    }
  },

  // Profile (User Settings & Balance)
  profile: {
    get: async (userId) => {
      if (!isConfigured) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      // If profile doesn't exist yet, insert it (in case trigger fails)
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
        return newProfile || defaultProfile;
      }
      return data;
    },
    update: async (userId, updates) => {
      if (!isConfigured) return { data: null, error: new Error("Database non configurato") };
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single();
      return { data, error };
    }
  },

  // Monthly Commitments
  monthly: {
    list: async (userId) => {
      if (!isConfigured) return { data: [], error: null };
      const { data, error } = await supabase
        .from('monthly_commitments')
        .select('*')
        .eq('user_id', userId)
        .order('day', { ascending: true });
      return { data: data || [], error };
    },
    insert: async (userId, { name, day, amount }) => {
      if (!isConfigured) return { data: null, error: new Error("Database non configurato") };
      const { data, error } = await supabase
        .from('monthly_commitments')
        .insert({ user_id: userId, name, day: parseInt(day), amount: parseFloat(amount) })
        .select()
        .single();
      return { data, error };
    },
    delete: async (userId, id) => {
      if (!isConfigured) return { error: null };
      const { error } = await supabase
        .from('monthly_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { error };
    }
  },

  // Annual Commitments
  annual: {
    list: async (userId) => {
      if (!isConfigured) return { data: [], error: null };
      const { data, error } = await supabase
        .from('annual_commitments')
        .select('*')
        .eq('user_id', userId)
        .order('month', { ascending: true });
      return { data: data || [], error };
    },
    insert: async (userId, { name, month, amount }) => {
      if (!isConfigured) return { data: null, error: new Error("Database non configurato") };
      const { data, error } = await supabase
        .from('annual_commitments')
        .insert({ user_id: userId, name, month: parseInt(month), amount: parseFloat(amount) })
        .select()
        .single();
      return { data, error };
    },
    delete: async (userId, id) => {
      if (!isConfigured) return { error: null };
      const { error } = await supabase
        .from('annual_commitments')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { error };
    }
  },

  // Annual Payments Status
  annualStatus: {
    list: async (userId, year) => {
      if (!isConfigured) return { data: [], error: null };
      const { data, error } = await supabase
        .from('annual_payments_status')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year);
      return { data: data || [], error };
    },
    confirm: async (userId, annualCommitmentId, year) => {
      if (!isConfigured) return { data: null, error: new Error("Database non configurato") };
      const { data, error } = await supabase
        .from('annual_payments_status')
        .insert({ user_id: userId, annual_commitment_id: annualCommitmentId, year: parseInt(year) })
        .select()
        .single();
      return { data, error };
    },
    unconfirm: async (userId, annualCommitmentId, year) => {
      if (!isConfigured) return { error: null };
      const { error } = await supabase
        .from('annual_payments_status')
        .delete()
        .eq('user_id', userId)
        .eq('annual_commitment_id', annualCommitmentId)
        .eq('year', year);
      return { error };
    }
  },

  // Planned Expenses
  planned: {
    list: async (userId, month, year) => {
      if (!isConfigured) return { data: [], error: null };
      const { data, error } = await supabase
        .from('planned_expenses')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year);
      return { data: data || [], error };
    },
    insert: async (userId, { name, amount, month, year }) => {
      if (!isConfigured) return { data: null, error: new Error("Database non configurato") };
      const { data, error } = await supabase
        .from('planned_expenses')
        .insert({ user_id: userId, name, amount: parseFloat(amount), month: parseInt(month), year: parseInt(year) })
        .select()
        .single();
      return { data, error };
    },
    delete: async (userId, id) => {
      if (!isConfigured) return { error: null };
      const { error } = await supabase
        .from('planned_expenses')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { error };
    }
  }
};
