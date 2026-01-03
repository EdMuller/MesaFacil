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
        const url = SUPABASE_CONFIG.url?.trim();
        const key = SUPABASE_CONFIG.anonKey?.trim();

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

// Helper para timeout de promessas - Reduzido para 8s para falhar mais rápido
const withTimeout = <T>(promise: Promise<T>, ms: number = 8000): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout: O servidor demorou muito para responder.")), ms))
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
          if (!client) { 
              console.warn("Supabase não configurado.");
              setIsInitialized(true); 
              return; 
          }
          
          try {
              // Verifica sessão atual
              const sessionRes = await withTimeout(client.auth.getSession());
              const session = (sessionRes as any)?.data?.session;
              
              if (session?.user) {
                  // Se existe usuário logado, tenta carregar o perfil
                  await fetchUserProfile(session.user.id, session.user.email!);
              }
          } catch (e) {
              console.error("Erro no processo de boot:", e);
          } finally {
              // GARANTIA: isInitialized sempre será true, escondendo o spinner de carregamento
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

  // --- 2. Polling ---
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
              console.error("Erro no ciclo de atualização:", e);
          } finally {
              setIsUpdating(false);
          }
      };

      cycle();
      const intervalId = setInterval(cycle, POLLING_INTERVAL);
      return () => clearInterval(intervalId);
  }, [currentUser?.id, currentUser?.establishmentId]);

  // --- Loaders ---

  const sendHeartbeat = async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      try { await withTimeout(sb.from('establishments').update({ is_open: true }).eq('id', estId)); } catch (e) {}
  };

  const loadEstablishmentData = async (estId: string) => {
      const sb = getSb();
      if (!sb) return null;
      try {
          const { data: est, error } = (await withTimeout(sb.from('establishments').select('*').eq('id', estId).single())) as any;
          if (error || !est) return null;

          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data: calls } = (await withTimeout(sb.from('calls').select('*').eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']))) as any; 
          
          const tablesMap = new Map<string, Table>();
          (calls as DBCall[])?.forEach((c: DBCall) => {
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
      } catch (e) { 
          console.warn(`Erro ao carregar dados do estabelecimento ${estId}:`, e);
          return null; 
      }
  };

  const fetchUserProfile = async (userId: string, email: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data: profile, error } = (await withTimeout(sb.from('profiles').select('*').eq('id', userId).single())) as any;
          
          // Caso importante: Se o Auth existe mas o perfil no banco foi deletado
          if (error || !profile) {
              console.warn("Perfil não encontrado para usuário logado. Limpando sessão.");
              await sb.auth.signOut();
              return;
          }

          const user: User = { id: profile.id, email, password: '', role: profile.role as Role, name: profile.name, status: profile.status };
          
          if (user.role === Role.ESTABLISHMENT) {
              // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
              const { data: est } = (await withTimeout(sb.from('establishments').select('id').eq('owner_id', userId).single())) as any;
              if (est) {
                  user.establishmentId = (est as any).id;
                  await loadEstablishmentData((est as any).id);
              }
          } else {
              await loadCustomerData(userId);
          }
          
          setCurrentUser(user);
      } catch (e) {
          console.error("Erro ao carregar perfil do usuário:", e);
      }
  };

  const loadCustomerData = async (userId: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          // FIX: Ensure 'as any' is correctly applied to fix missing property 'data' on type '{}'
          const { data: favs } = (await withTimeout(sb.from('customer_favorites').select('establishment_id').eq('user_id', userId))) as any;
          const favIds = favs?.map((f: any) => f.establishment_id) || [];
          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data: details } = (await withTimeout(sb.from('customer_details').select('*').eq('user_id', userId).maybeSingle())) as any;
          
          const profile: CustomerProfile = { userId, favoritedEstablishmentIds: favIds, phone: (details as any)?.phone, cep: (details as any)?.cep };
          setCustomerProfiles(prev => new Map(prev).set(userId, profile));
          
          if (favIds.length > 0) {
              await Promise.all(favIds.map(id => loadEstablishmentData(id)));
          }
      } catch (e) {
          console.error("Erro ao carregar dados do cliente:", e);
      }
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
          try { await withTimeout(sb.from('establishments').update({ is_open: false }).eq('id', currentUser.establishmentId)); } catch(e){}
      }
      await sb.auth.signOut();
  }, [currentUser]);

  const registerEstablishment = async (name: string, phone: string, email: string, password: string, photo: string | null, phrase: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Erro de conexão.");
      
      const { data, error } = (await withTimeout(sb.auth.signUp({ email, password }))) as any;
      if (error) throw error;

      const uid = data.user!.id;
      await withTimeout(sb.from('profiles').insert({ id: uid, email, role: Role.ESTABLISHMENT, name, status: UserStatus.TESTING }));
      await withTimeout(sb.from('establishments').insert({ 
          owner_id: uid, name, phone: sanitizePhone(phone), 
          photo_url: photo, phrase, settings: DEFAULT_SETTINGS, is_open: false 
      }));
      return { name };
  };

  const registerCustomer = async (name: string, email: string, password: string, phone?: string, cep?: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Erro de conexão.");
      const { data, error } = (await withTimeout(sb.auth.signUp({ email, password }))) as any;
      if (error) throw error;
      const uid = data.user!.id;
      await withTimeout(sb.from('profiles').insert({ id: uid, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING }));
      if (phone || cep) await withTimeout(sb.from('customer_details').insert({ user_id: uid, phone, cep }));
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
          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data } = (await withTimeout(sb.from('establishments').select('id').eq('phone', clean).maybeSingle())) as any;
          if (data) return await loadEstablishmentData((data as any).id);
          return null;
      },
      addCall: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          await withTimeout(sb.from('calls').insert({ establishment_id: estId, table_number: tableNum, type, status: CallStatus.SENT, created_at_ts: Date.now() }));
          await loadEstablishmentData(estId);
      },
      closeEstablishmentWorkday: async (id: string) => {
          const sb = getSb();
          await withTimeout(sb.from('establishments').update({ is_open: false }).eq('id', id));
          await withTimeout(sb.from('calls').update({ status: CallStatus.CANCELED }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']));
          await loadEstablishmentData(id);
      },
      checkPendingCallsOnLogin: async (id: string) => {
          const sb = getSb();
          // FIX: Cast awaited withTimeout result to any to fix missing property 'count' on type '{}'
          const { count } = (await withTimeout(sb.from('calls').select('*', { count: 'exact', head: true }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']))) as any;
          return (count || 0) > 0;
      },
      attendOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1))) as any;
          if ((data as any)?.[0]) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', (data as any)[0].id));
              await loadEstablishmentData(estId);
          }
      },
      cancelOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1))) as any;
          if ((data as any)?.[0]) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.CANCELED }).eq('id', (data as any)[0].id));
              await loadEstablishmentData(estId);
          }
      },
      viewAllCallsForTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          // FIX: Cast awaited withTimeout result to any to fix missing property 'data' on type '{}'
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('status', CallStatus.SENT))) as any;
          if ((data as any)?.length) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.VIEWED }).in('id', (data as any).map((c: any) => c.id)));
              await loadEstablishmentData(estId);
          }
      },
      closeTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          await withTimeout(sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNum).in('status', ['SENT', 'VIEWED']));
          await loadEstablishmentData(estId);
      },
      getEstablishmentByPhone: (p: string) => Array.from(establishments.values()).find((e: Establishment) => e.phone === sanitizePhone(p)),
      favoriteEstablishment: async (uid: string, estId: string) => { await withTimeout(getSb().from('customer_favorites').insert({ user_id: uid, establishment_id: estId })); await loadCustomerData(uid); },
      unfavoriteEstablishment: async (uid: string, estId: string) => { await withTimeout(getSb().from('customer_favorites').delete().eq('user_id', uid).eq('establishment_id', estId)); await loadCustomerData(uid); },
      updateSettings: async (id: string, s: Settings) => { await withTimeout(getSb().from('establishments').update({ settings: s }).eq('id', id)); await loadEstablishmentData(id); },
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
