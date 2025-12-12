import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Establishment, Table, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus } from '../types';
import { DEFAULT_SETTINGS, SUPABASE_CONFIG, POLLING_INTERVAL } from '../constants';

// --- Types for DB Tables ---
interface DBCall {
    id: string;
    establishment_id: string;
    table_number: string;
    type: CallType;
    status: CallStatus;
    created_at_ts: number;
}

// --- Initialize Supabase ---
let supabaseInstance: any = null;

const initSupabase = () => {
    if (supabaseInstance) return supabaseInstance;
    try {
        let url = (SUPABASE_CONFIG.url || '').trim();
        let key = (SUPABASE_CONFIG.anonKey || '').trim();

        if (!url || !key) {
            url = (localStorage.getItem('supabase_url') || '').trim();
            key = (localStorage.getItem('supabase_key') || '').trim();
        }

        if (url && key && url.startsWith('http')) {
            supabaseInstance = createClient(url, key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
                realtime: { params: { eventsPerSecond: 1 } } 
            });
        }
    } catch (e) {
        console.error("Supabase init error", e);
    }
    return supabaseInstance;
}

const sanitizePhone = (phone: string) => phone.replace(/\D/g, '');

export const useMockData = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]); 
  const [establishments, setEstablishments] = useState<Map<string, Establishment>>(new Map());
  const [customerProfiles, setCustomerProfiles] = useState<Map<string, CustomerProfile>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false); 

  const supabaseRef = useRef<any>(null);

  // Helper seguro para obter cliente
  const getSb = () => {
      if (supabaseRef.current) return supabaseRef.current;
      const client = initSupabase();
      supabaseRef.current = client;
      return client;
  }

  // --- 1. Inicialização Segura ---
  useEffect(() => {
      const client = getSb();
      
      const boot = async () => {
          if (!client) { setIsInitialized(true); return; }
          
          const { data: { session } } = await client.auth.getSession();
          if (session?.user) {
              await fetchUserProfile(session.user.id, session.user.email!);
          }
          setIsInitialized(true);
      };
      boot();

      const { data: { subscription } } = client?.auth.onAuthStateChange((event: string, session: any) => {
          if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
              setActiveSessions(new Set());
          }
      }) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => subscription.unsubscribe();
  }, []);

  // --- 2. Polling (30s) ---
  useEffect(() => {
      if (!currentUser) return;

      const cycle = async () => {
          setIsUpdating(true); 
          try {
              if (currentUser.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
                  await sendHeartbeat(currentUser.establishmentId);
                  await loadEstablishmentData(currentUser.establishmentId);
              } 
              else if (currentUser.role === Role.CUSTOMER) {
                  const profile = customerProfiles.get(currentUser.id);
                  if (profile?.favoritedEstablishmentIds) {
                      await Promise.all(profile.favoritedEstablishmentIds.map(id => loadEstablishmentData(id)));
                  }
              }
          } catch (e) {
              console.error("Polling error:", e);
          } finally {
              setTimeout(() => setIsUpdating(false), 1000);
          }
      };

      const intervalId = setInterval(cycle, POLLING_INTERVAL);
      return () => clearInterval(intervalId);
  }, [currentUser?.id, currentUser?.role, currentUser?.establishmentId]);

  // --- Core Data Loaders ---

  const sendHeartbeat = async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      await sb.from('establishments')
        .update({ is_open: true, created_at: new Date().toISOString() })
        .eq('id', estId);
  };

  const loadEstablishmentData = async (estId: string) => {
      const sb = getSb();
      if (!sb) return null;
      
      const { data: est, error } = await sb.from('establishments').select('*').eq('id', estId).single();
      if (error || !est) return null;

      const { data: calls } = await sb.from('calls')
        .select('*')
        .eq('establishment_id', estId)
        .in('status', ['SENT', 'VIEWED']); 
      
      const tablesMap = new Map<string, Table>();
      calls?.forEach((c: DBCall) => {
          const existing = tablesMap.get(c.table_number) || { number: c.table_number, calls: [] };
          existing.calls.push({ id: c.id, type: c.type, status: c.status, createdAt: c.created_at_ts });
          tablesMap.set(c.table_number, existing);
      });

      const totalTables = est.settings?.totalTables || DEFAULT_SETTINGS.totalTables;
      for(let i=1; i<=totalTables; i++) {
          const num = i.toString();
          if(!tablesMap.has(num)) tablesMap.set(num, { number: num, calls: [] });
      }

      const fullEst: Establishment = {
          id: est.id,
          ownerId: est.owner_id,
          name: est.name,
          phone: (est as any).phone,
          photoUrl: est.photo_url,
          phrase: est.phrase,
          settings: est.settings || DEFAULT_SETTINGS,
          tables: tablesMap,
          eventLog: [],
          isOpen: est.is_open === true
      };

      setEstablishments(prev => new Map(prev).set(estId, fullEst));
      return fullEst;
  };

  const fetchUserProfile = async (userId: string, email: string) => {
      const sb = getSb();
      if (!sb) return;
      
      const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
      
      if (profile) {
          const user: User = {
              id: profile.id, email, password: '', role: profile.role as Role, name: profile.name, status: profile.status
          };
          if (user.role === Role.ESTABLISHMENT) {
              const { data: est } = await sb.from('establishments').select('id').eq('owner_id', userId).single();
              if (est) user.establishmentId = est.id;
          } else {
              await loadCustomerData(userId);
          }
          setCurrentUser(user);
      }
  };

  const loadCustomerData = async (userId: string) => {
      const sb = getSb();
      if (!sb) return;
      const { data: favs } = await sb.from('customer_favorites').select('establishment_id').eq('user_id', userId);
      const favIds = favs?.map((f: any) => f.establishment_id) || [];
      const { data: details } = await sb.from('customer_details').select('*').eq('user_id', userId).maybeSingle();

      const profile: CustomerProfile = { userId, favoritedEstablishmentIds: favIds, phone: (details as any)?.phone, cep: (details as any)?.cep };
      setCustomerProfiles(prev => new Map(prev).set(userId, profile));
      
      // Carrega sequencialmente para não engasgar conexões ruins
      for (const id of favIds) {
          await loadEstablishmentData(id);
      }
  };

  // --- Ações do Usuário (Hardened) ---

  const login = useCallback(async (email: string, password: string) => {
      const sb = getSb(); // Garante instancia
      if (!sb) throw new Error("Erro de conexão. Verifique a internet.");
      
      // 1. Auth Supabase
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Email ou senha inválidos.");
      if (!data.user) throw new Error("Usuário não encontrado.");

      // 2. Carrega Perfil (Força espera)
      await fetchUserProfile(data.user.id, data.user.email!);
      
      // 3. Se for estabelecimento, abre imediatamente
      const { data: est } = await sb.from('establishments').select('id').eq('owner_id', data.user.id).single();
      if (est) {
          await sb.from('establishments').update({ is_open: true }).eq('id', est.id);
          await loadEstablishmentData(est.id); // Já carrega dados iniciais
      }
      
  }, []);

  const searchEstablishmentByPhone = async (phone: string) => {
      const sb = getSb();
      if (!sb) return null;
      
      const cleanSearch = sanitizePhone(phone);
      if (!cleanSearch) throw new Error("Digite apenas números.");

      try {
        // Busca ID
        const { data, error } = await sb.from('establishments').select('id').eq('phone', cleanSearch).maybeSingle();
        
        if (error) throw error;
        if (!data) return null;

        // Carrega Dados Completos
        const fullData = await loadEstablishmentData(data.id);
        return fullData;
      } catch (e) {
          console.error("Erro na busca:", e);
          throw new Error("Erro ao buscar estabelecimento.");
      }
  }

  const logout = useCallback(async () => {
      const sb = getSb();
      if (!sb) return;
      
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          await sb.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId);
      }
      await sb.auth.signOut();
  }, [currentUser]);

  // --- Outras Ações ---

  const checkPendingCallsOnLogin = async (estId: string): Promise<boolean> => {
      const sb = getSb();
      if (!sb) return false;
      const { count } = await sb.from('calls').select('*', { count: 'exact', head: true }).eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']);
      return (count || 0) > 0;
  };

  const closeEstablishmentWorkday = useCallback(async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      await sb.from('establishments').update({ is_open: false }).eq('id', estId);
      await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']);
      await loadEstablishmentData(estId);
  }, []);

  const addCall = useCallback(async (estId: string, tableNum: string, type: CallType) => {
      const sb = getSb();
      if (!sb) return;
      await sb.from('calls').insert({ establishment_id: estId, table_number: tableNum, type, status: CallStatus.SENT, created_at_ts: Date.now() });
      await loadEstablishmentData(estId); 
  }, []);

  const registerCustomer = async (name: string, email: string, password: string) => {
      const sb = getSb();
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      await sb.from('profiles').insert({ id: data.user!.id, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING });
      return { name } as User;
  };

  const registerEstablishment = async (name: string, phone: string, email: string, password: string, photo: string | null, phrase: string) => {
      const sb = getSb();
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      const uid = data.user!.id;
      await sb.from('profiles').insert({ id: uid, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING });
      await sb.from('establishments').insert({ owner_id: uid, name, phone: sanitizePhone(phone), photo_url: photo, phrase, settings: DEFAULT_SETTINGS, is_open: true });
      return { name } as User;
  };

  const attendOldestCallByType = async (estId: string, tableNum: string, type: CallType) => {
      const sb = getSb();
      const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
      if (data?.[0]) {
          await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id);
          await loadEstablishmentData(estId);
      }
  };

  const cancelOldestCallByType = async (estId: string, tableNum: string, type: CallType) => {
      const sb = getSb();
      const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
      if (data?.[0]) {
          await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id);
          await loadEstablishmentData(estId);
      }
  };

  const viewAllCallsForTable = async (estId: string, tableNum: string) => {
      const sb = getSb();
      const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('status', CallStatus.SENT);
      if (data?.length) {
          const ids = data.map((c: any) => c.id);
          await sb.from('calls').update({ status: CallStatus.VIEWED }).in('id', ids);
      }
  };

  const closeTable = async (estId: string, tableNum: string) => {
      const sb = getSb();
      await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNum).in('status', ['SENT', 'VIEWED']);
      await loadEstablishmentData(estId);
  };
  
  const favoriteEstablishment = async (uid: string, estId: string) => {
      const sb = getSb();
      await sb?.from('customer_favorites').insert({ user_id: uid, establishment_id: estId });
      await loadCustomerData(uid);
  }
  const unfavoriteEstablishment = async (uid: string, estId: string) => {
      const sb = getSb();
      await sb?.from('customer_favorites').delete().eq('user_id', uid).eq('establishment_id', estId);
      await loadCustomerData(uid);
  }

  // --- UI Helpers ---
  const getTableSemaphoreStatus = (table: Table, settings: Settings): SemaphoreStatus => {
      const active = table.calls.filter(c => c.status === 'SENT' || c.status === 'VIEWED');
      if (!active.length) return SemaphoreStatus.IDLE;
      const oldest = active.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
      const elapsed = (Date.now() - oldest.createdAt) / 1000;
      if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
      if (elapsed > settings.timeGreen) return SemaphoreStatus.YELLOW;
      return SemaphoreStatus.GREEN;
  }

  const getCallTypeSemaphoreStatus = (table: Table, type: CallType, settings: Settings): SemaphoreStatus => {
      const active = table.calls.filter(c => c.type === type && (c.status === 'SENT' || c.status === 'VIEWED'));
      if (!active.length) return SemaphoreStatus.IDLE;
      const oldest = active[0]; 
      const elapsed = (Date.now() - oldest.createdAt) / 1000;
      if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
      return SemaphoreStatus.GREEN;
  }

  return {
      isInitialized, isUpdating,
      currentUser, users, establishments, customerProfiles, activeSessions,
      login, logout, closeEstablishmentWorkday, checkPendingCallsOnLogin,
      registerCustomer, registerEstablishment,
      addCall, cancelOldestCallByType, attendOldestCallByType, viewAllCallsForTable, closeTable,
      getEstablishmentByPhone: (p: string) => Array.from(establishments.values()).find((e: Establishment) => e.phone === sanitizePhone(p)),
      searchEstablishmentByPhone,
      favoriteEstablishment, unfavoriteEstablishment,
      updateSettings: async (id: string, s: Settings) => { await getSb()?.from('establishments').update({ settings: s }).eq('id', id); },
      getTableSemaphoreStatus, getCallTypeSemaphoreStatus,
      trackTableSession: (eid: string, t: string) => setActiveSessions(prev => new Set(prev).add(`${eid}:${t}`)),
      clearAllSessions: async () => {}, 
      deleteCurrentUser: async () => {},
      updateUserStatus: async () => {},
      subscribeToEstablishmentCalls: () => () => {}, 
  }
};