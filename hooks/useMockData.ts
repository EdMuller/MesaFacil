
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
        const url = SUPABASE_CONFIG.url.trim();
        const key = SUPABASE_CONFIG.anonKey.trim();

        if (url && key && url.startsWith('http')) {
            supabaseInstance = createClient(url, key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
            });
        }
    } catch (e) {
        console.error("Erro crítico na inicialização do Supabase:", e);
    }
    return supabaseInstance;
}

const withTimeout = <T>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("O servidor não respondeu a tempo.")), ms))
    ]);
};

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

  const getSb = () => {
      if (supabaseRef.current) return supabaseRef.current;
      const client = initSupabase();
      supabaseRef.current = client;
      return client;
  }

  // --- 1. Inicialização ---
  useEffect(() => {
      const client = getSb();
      const boot = async () => {
          if (!client) { setIsInitialized(true); return; }
          try {
              const { data: { session } } = (await withTimeout(client.auth.getSession())) as any;
              if (session?.user) {
                  await fetchUserProfile(session.user.id, session.user.email!);
              }
          } catch (e) {
              console.warn("Sessão não encontrada:", e);
          } finally {
              setIsInitialized(true);
          }
      };
      boot();

      const { data: { subscription } } = (client?.auth.onAuthStateChange((event: string, session: any) => {
          if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
              setActiveSessions(new Set());
          }
      }) as any) || { data: { subscription: { unsubscribe: () => {} } } };

      return () => subscription.unsubscribe();
  }, []);

  // --- 2. Polling (Executa imediatamente no login e depois a cada 30s) ---
  useEffect(() => {
      if (!currentUser) return;

      const cycle = async () => {
          if (isUpdating) return;
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
              console.error("Erro no ciclo:", e);
          } finally {
              setIsUpdating(false);
          }
      };

      // Executa uma vez imediatamente
      cycle();

      const intervalId = setInterval(cycle, POLLING_INTERVAL);
      return () => clearInterval(intervalId);
  }, [currentUser?.id, currentUser?.establishmentId]);

  // --- Loaders ---

  const sendHeartbeat = async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      try { await sb.from('establishments').update({ is_open: true }).eq('id', estId); } catch (e) {}
  };

  const loadEstablishmentData = async (estId: string) => {
      const sb = getSb();
      if (!sb) return null;
      try {
          const { data: est, error } = (await withTimeout(sb.from('establishments').select('*').eq('id', estId).single())) as any;
          if (error || !est) return null;

          const { data: calls } = await sb.from('calls').select('*').eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']); 
          
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
              id: est.id, ownerId: est.owner_id, name: est.name, phone: (est as any).phone,
              photoUrl: est.photo_url, phrase: est.phrase, settings: est.settings || DEFAULT_SETTINGS,
              tables: tablesMap, eventLog: [], isOpen: est.is_open === true
          };
          setEstablishments(prev => {
              const next = new Map(prev);
              next.set(estId, fullEst);
              return next;
          });
          return fullEst;
      } catch (e) { return null; }
  };

  const fetchUserProfile = async (userId: string, email: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data: profile } = (await withTimeout(sb.from('profiles').select('*').eq('id', userId).single())) as any;
          if (profile) {
              const user: User = { id: profile.id, email, password: '', role: profile.role as Role, name: profile.name, status: profile.status };
              if (user.role === Role.ESTABLISHMENT) {
                  const { data: est } = await sb.from('establishments').select('id').eq('owner_id', userId).single();
                  if (est) {
                      user.establishmentId = est.id;
                      // IMPORTANTE: Carrega os dados IMEDIATAMENTE antes de setar o usuário para evitar o "Carregando"
                      await loadEstablishmentData(est.id);
                  }
              } else {
                  await loadCustomerData(userId);
              }
              setCurrentUser(user);
          }
      } catch (e) {
          console.error("Erro ao buscar perfil:", e);
      }
  };

  const loadCustomerData = async (userId: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data: favs } = (await withTimeout(sb.from('customer_favorites').select('establishment_id').eq('user_id', userId))) as any;
          const favIds = favs?.map((f: any) => f.establishment_id) || [];
          const { data: details } = await sb.from('customer_details').select('*').eq('user_id', userId).maybeSingle();
          const profile: CustomerProfile = { userId, favoritedEstablishmentIds: favIds, phone: (details as any)?.phone, cep: (details as any)?.cep };
          setCustomerProfiles(prev => new Map(prev).set(userId, profile));
          // Carrega favoritos imediatamente
          if (favIds.length > 0) {
              await Promise.all(favIds.map(id => loadEstablishmentData(id)));
          }
      } catch (e) {}
  };

  // --- Ações ---

  const login = useCallback(async (email: string, password: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Erro de conexão.");
      const { data, error } = (await withTimeout(sb.auth.signInWithPassword({ email, password }))) as any;
      if (error) throw error;
      await fetchUserProfile(data.user.id, data.user.email!);
  }, []);

  const logout = useCallback(async () => {
      const sb = getSb();
      if (!sb) return;
      if (currentUser?.role === Role.ESTABLISHMENT && currentUser.establishmentId) {
          try { await sb.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId); } catch(e){}
      }
      await sb.auth.signOut();
  }, [currentUser]);

  const registerEstablishment = async (name: string, phone: string, email: string, password: string, photo: string | null, phrase: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Erro de conexão.");
      
      const { data, error } = (await sb.auth.signUp({ email, password })) as any;
      if (error) throw error;

      const uid = data.user!.id;
      await sb.from('profiles').insert({ id: uid, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING });
      // CORREÇÃO: is_open inicia como false
      await sb.from('establishments').insert({ 
          owner_id: uid, name, phone: sanitizePhone(phone), 
          photo_url: photo, phrase, settings: DEFAULT_SETTINGS, is_open: false 
      });
      return { name };
  };

  const registerCustomer = async (name: string, email: string, password: string, phone?: string, cep?: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Erro de conexão.");
      const { data, error } = (await sb.auth.signUp({ email, password })) as any;
      if (error) throw error;
      const uid = data.user!.id;
      await sb.from('profiles').insert({ id: uid, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING });
      if (phone || cep) await sb.from('customer_details').insert({ user_id: uid, phone, cep });
      return { name };
  };

  const currentEstablishment = currentUser?.establishmentId ? establishments.get(currentUser.establishmentId) : null;
  const currentCustomerProfile = currentUser?.id ? customerProfiles.get(currentUser.id) : null;

  return {
      isInitialized, isUpdating,
      currentUser, users, establishments, customerProfiles, activeSessions,
      currentEstablishment, currentCustomerProfile,
      login, logout, registerCustomer, registerEstablishment,
      searchEstablishmentByPhone: async (phone: string) => {
          const sb = getSb();
          const clean = sanitizePhone(phone);
          const { data } = await sb.from('establishments').select('id').eq('phone', clean).maybeSingle();
          if (data) return await loadEstablishmentData(data.id);
          return null;
      },
      addCall: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          await sb.from('calls').insert({ establishment_id: estId, table_number: tableNum, type, status: CallStatus.SENT, created_at_ts: Date.now() });
          await loadEstablishmentData(estId);
      },
      closeEstablishmentWorkday: async (id: string) => {
          const sb = getSb();
          await sb.from('establishments').update({ is_open: false }).eq('id', id);
          await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']);
          await loadEstablishmentData(id);
      },
      checkPendingCallsOnLogin: async (id: string) => {
          const sb = getSb();
          const { count } = await sb.from('calls').select('*', { count: 'exact', head: true }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']);
          return (count || 0) > 0;
      },
      attendOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
          if (data?.[0]) {
              await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id);
              await loadEstablishmentData(estId);
          }
      },
      cancelOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1);
          if (data?.[0]) {
              await sb.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id);
              await loadEstablishmentData(estId);
          }
      },
      viewAllCallsForTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          const { data } = await sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('status', CallStatus.SENT);
          if (data?.length) {
              await sb.from('calls').update({ status: CallStatus.VIEWED }).in('id', data.map((c: any) => c.id));
              await loadEstablishmentData(estId);
          }
      },
      closeTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          await sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNum).in('status', ['SENT', 'VIEWED']);
          await loadEstablishmentData(estId);
      },
      getEstablishmentByPhone: (p: string) => Array.from(establishments.values()).find((e: Establishment) => e.phone === sanitizePhone(p)),
      favoriteEstablishment: async (uid: string, estId: string) => { await getSb().from('customer_favorites').insert({ user_id: uid, establishment_id: estId }); await loadCustomerData(uid); },
      unfavoriteEstablishment: async (uid: string, estId: string) => { await getSb().from('customer_favorites').delete().eq('user_id', uid).eq('establishment_id', estId); await loadCustomerData(uid); },
      updateSettings: async (id: string, s: Settings) => { await getSb().from('establishments').update({ settings: s }).eq('id', id); await loadEstablishmentData(id); },
      getTableSemaphoreStatus: (table: Table, settings: Settings): SemaphoreStatus => {
          const active = table.calls.filter(c => c.status === 'SENT' || c.status === 'VIEWED');
          if (!active.length) return SemaphoreStatus.IDLE;
          const oldest = active.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
          const elapsed = (Date.now() - oldest.createdAt) / 1000;
          if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
          if (elapsed > settings.timeGreen) return SemaphoreStatus.YELLOW;
          return SemaphoreStatus.GREEN;
      },
      getCallTypeSemaphoreStatus: (table: Table, type: CallType, settings: Settings): SemaphoreStatus => {
          const active = table.calls.filter(c => c.type === type && (c.status === 'SENT' || c.status === 'VIEWED'));
          if (!active.length) return SemaphoreStatus.IDLE;
          const oldest = active[0]; 
          const elapsed = (Date.now() - oldest.createdAt) / 1000;
          if (elapsed > settings.timeYellow) return SemaphoreStatus.RED;
          return SemaphoreStatus.GREEN;
      },
      trackTableSession: (eid: string, t: string) => setActiveSessions(prev => new Set(prev).add(`${eid}:${t}`)),
      clearAllSessions: async () => {}, deleteCurrentUser: async () => {}, 
      updateUserStatus: async (userId: string, status: UserStatus) => {}, 
      subscribeToEstablishmentCalls: () => () => {}, 
  }
};
