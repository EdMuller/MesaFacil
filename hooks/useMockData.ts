
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Establishment, Table, CallType, CallStatus, Settings, SemaphoreStatus, User, Role, CustomerProfile, UserStatus } from '../types';
import { DEFAULT_SETTINGS, SUPABASE_CONFIG, POLLING_INTERVAL } from '../constants';

// --- Tipagem para chamadas do Banco ---
interface DBCall {
    id: string;
    establishment_id: string;
    table_number: string;
    type: CallType;
    status: CallStatus;
    created_at_ts: number;
}

// --- Inicialização do Supabase Singleton ---
let supabaseInstance: any = null;

const initSupabase = () => {
    if (supabaseInstance) return supabaseInstance;
    try {
        const url = SUPABASE_CONFIG.url?.trim() || localStorage.getItem('supabase_url')?.trim();
        const key = SUPABASE_CONFIG.anonKey?.trim() || localStorage.getItem('supabase_key')?.trim();

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
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout de ${ms}ms excedido.`)), ms))
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
  const [initError, setInitError] = useState<string | null>(null);

  const supabaseRef = useRef<any>(null);

  const getSb = () => {
      if (supabaseRef.current) return supabaseRef.current;
      const client = initSupabase();
      supabaseRef.current = client;
      return client;
  }

  // --- 1. Boot do Aplicativo ---
  useEffect(() => {
      const client = getSb();
      
      const boot = async () => {
          if (!client) { 
              console.warn("Supabase não configurado.");
              setIsInitialized(true); 
              return; 
          }
          
          try {
              // Verifica sessão com timeout para não travar o carregamento inicial
              const { data: { session } } = (await withTimeout(client.auth.getSession(), 5000)) as any;
              
              if (session?.user) {
                  // Carrega o perfil do usuário, mas não deixa travar o app se falhar
                  await fetchUserProfile(session.user.id, session.user.email!).catch(e => {
                      console.error("Erro ao carregar perfil no boot:", e);
                      setInitError("Erro ao carregar seu perfil. Tente limpar a sessão.");
                  });
              }
          } catch (e) {
              console.error("Erro no processo de boot:", e);
              // Não travamos o isInitialized para que o usuário veja a tela de login pelo menos
          } finally {
              setIsInitialized(true);
          }
      };
      
      boot();

      // Listener de Autenticação
      const { data: { subscription } } = (client?.auth.onAuthStateChange(async (event: string, session: any) => {
          if (event === 'SIGNED_IN' && session?.user) {
              await fetchUserProfile(session.user.id, session.user.email!);
          }
          if (event === 'SIGNED_OUT') {
              setCurrentUser(null);
              setEstablishments(new Map());
              setActiveSessions(new Set());
          }
      }) as any) || { data: { subscription: { unsubscribe: () => {} } } };

      // Carregar lista de usuários para Admin
      loadAllUsers();

      return () => subscription.unsubscribe();
  }, []);

  // --- 2. Ciclo de Polling ---
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
              console.error("Erro no ciclo de polling:", e);
          } finally {
              setIsUpdating(false);
          }
      };

      const intervalId = setInterval(cycle, POLLING_INTERVAL);
      cycle();
      return () => clearInterval(intervalId);
  }, [currentUser?.id, currentUser?.establishmentId]);

  // --- Funções Auxiliares de Dados ---

  const loadAllUsers = async () => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data, error } = (await withTimeout(sb.from('profiles').select('*'))) as any;
          if (error) throw error;
          if (data) {
              const mapped = data.map((p: any) => ({
                  id: p.id, email: p.email, password: '', role: p.role as Role, name: p.name, status: p.status as UserStatus
              }));
              setUsers(mapped);
          }
      } catch (e) {
          console.warn("Não foi possível carregar lista de usuários (Admin):", e);
      }
  };

  const sendHeartbeat = async (estId: string) => {
      const sb = getSb();
      if (!sb) return;
      try { 
          // Atualiza is_open e last_heartbeat para o backend saber que o painel está ativo
          await sb.from('establishments').update({ is_open: true, updated_at: new Date().toISOString() }).eq('id', estId); 
      } catch (e) {
          console.error("Falha no heartbeat:", e);
      }
  };

  const loadEstablishmentData = async (estId: string) => {
      const sb = getSb();
      if (!sb) return null;
      try {
          const { data: est, error: estError } = (await withTimeout(sb.from('establishments').select('*').eq('id', estId).single())) as any;
          if (estError || !est) return null;

          const { data: calls, error: callsError } = (await withTimeout(sb.from('calls').select('*').eq('establishment_id', estId).in('status', ['SENT', 'VIEWED']))) as any; 
          
          if (callsError) throw callsError;

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
              id: est.id, ownerId: est.owner_id, name: est.name, phone: est.phone,
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
          console.error(`Erro ao carregar dados do est ${estId}:`, e);
          return null; 
      }
  };

  const fetchUserProfile = async (userId: string, email: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data: profile, error } = (await withTimeout(sb.from('profiles').select('*').eq('id', userId).single())) as any;
          
          if (error || !profile) {
              console.warn("Perfil não encontrado no banco.");
              return;
          }

          const user: User = { 
              id: profile.id, 
              email, 
              password: '', 
              role: profile.role as Role, 
              name: profile.name, 
              status: profile.status as UserStatus 
          };
          
          // Define o usuário imediatamente para liberar a UI
          setCurrentUser(user);

          // Carregamentos secundários em paralelo
          if (user.role === Role.ESTABLISHMENT) {
              const { data: est } = (await withTimeout(sb.from('establishments').select('id').eq('owner_id', userId).single())) as any;
              if (est) {
                  user.establishmentId = est.id;
                  setCurrentUser(prev => prev ? { ...prev, establishmentId: est.id } : null);
                  loadEstablishmentData(est.id);
              } else {
                  console.warn("Usuário é estabelecimento mas não tem registro de estabelecimento vinculado.");
              }
          } else {
              loadCustomerData(userId);
          }
      } catch (e) {
          console.error("Erro ao processar perfil do usuário:", e);
      }
  };

  const loadCustomerData = async (userId: string) => {
      const sb = getSb();
      if (!sb) return;
      try {
          const { data: favs } = (await withTimeout(sb.from('customer_favorites').select('establishment_id').eq('user_id', userId))) as any;
          const favIds = favs?.map((f: any) => f.establishment_id) || [];
          const { data: details } = (await withTimeout(sb.from('customer_details').select('*').eq('user_id', userId).maybeSingle())) as any;
          
          const profile: CustomerProfile = { userId, favoritedEstablishmentIds: favIds, phone: details?.phone, cep: details?.cep };
          setCustomerProfiles(prev => new Map(prev).set(userId, profile));
          
          if (favIds.length > 0) {
              favIds.forEach(id => loadEstablishmentData(id));
          }
      } catch (e) {
          console.error("Erro ao carregar dados do cliente:", e);
      }
  };

  const login = useCallback(async (email: string, password: string) => {
      const sb = getSb();
      if (!sb) throw new Error("Conexão com o banco indisponível.");
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
      setCurrentUser(null);
  }, [currentUser]);

  // --- Ações do Sistema ---

  return {
      isInitialized, setIsInitialized, isUpdating, initError,
      currentUser, users, establishments, customerProfiles, activeSessions,
      currentEstablishment: currentUser?.establishmentId ? establishments.get(currentUser.establishmentId) : null,
      currentCustomerProfile: currentUser?.id ? customerProfiles.get(currentUser.id) : null,
      login, logout,
      registerEstablishment: async (name: string, phone: string, email: string, password: string, photo: string | null, phrase: string) => {
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
      },
      registerCustomer: async (name: string, email: string, password: string, phone?: string, cep?: string) => {
          const sb = getSb();
          if (!sb) throw new Error("Erro de conexão.");
          const { data, error } = (await withTimeout(sb.auth.signUp({ email, password }))) as any;
          if (error) throw error;
          const uid = data.user!.id;
          await withTimeout(sb.from('profiles').insert({ id: uid, email, role: Role.CUSTOMER, name, status: UserStatus.TESTING }));
          if (phone || cep) await withTimeout(sb.from('customer_details').insert({ user_id: uid, phone, cep }));
          return { name };
      },
      searchEstablishmentByPhone: async (phone: string) => {
          const sb = getSb();
          const clean = sanitizePhone(phone);
          const { data, error } = (await withTimeout(sb.from('establishments').select('id').eq('phone', clean).maybeSingle())) as any;
          if (error || !data) return null;
          return await loadEstablishmentData(data.id);
      },
      addCall: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          if(!sb) return;
          await withTimeout(sb.from('calls').insert({ establishment_id: estId, table_number: tableNum, type, status: CallStatus.SENT, created_at_ts: Date.now() }));
          await loadEstablishmentData(estId);
      },
      closeEstablishmentWorkday: async (id: string) => {
          const sb = getSb();
          if(!sb) return;
          await withTimeout(sb.from('establishments').update({ is_open: false }).eq('id', id));
          await withTimeout(sb.from('calls').update({ status: CallStatus.CANCELED }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']));
          await loadEstablishmentData(id);
      },
      checkPendingCallsOnLogin: async (id: string) => {
          const sb = getSb();
          if(!sb) return false;
          const { count } = (await withTimeout(sb.from('calls').select('*', { count: 'exact', head: true }).eq('establishment_id', id).in('status', ['SENT', 'VIEWED']))) as any;
          return (count || 0) > 0;
      },
      attendOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1))) as any;
          if (data?.[0]) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('id', data[0].id));
              await loadEstablishmentData(estId);
          }
      },
      cancelOldestCallByType: async (estId: string, tableNum: string, type: CallType) => {
          const sb = getSb();
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('type', type).in('status', ['SENT', 'VIEWED']).order('created_at_ts', {ascending: true}).limit(1))) as any;
          if (data?.[0]) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.CANCELED }).eq('id', data[0].id));
              await loadEstablishmentData(estId);
          }
      },
      viewAllCallsForTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          const { data } = (await withTimeout(sb.from('calls').select('id').eq('establishment_id', estId).eq('table_number', tableNum).eq('status', CallStatus.SENT))) as any;
          if (data?.length) {
              await withTimeout(sb.from('calls').update({ status: CallStatus.VIEWED }).in('id', data.map((c: any) => c.id)));
              await loadEstablishmentData(estId);
          }
      },
      closeTable: async (estId: string, tableNum: string) => {
          const sb = getSb();
          await withTimeout(sb.from('calls').update({ status: CallStatus.ATTENDED }).eq('establishment_id', estId).eq('table_number', tableNum).in('status', ['SENT', 'VIEWED']));
          await loadEstablishmentData(estId);
      },
      favoriteEstablishment: async (uid: string, estId: string) => { 
          await withTimeout(getSb().from('customer_favorites').insert({ user_id: uid, establishment_id: estId })); 
          await loadCustomerData(uid); 
      },
      unfavoriteEstablishment: async (uid: string, estId: string) => { 
          await withTimeout(getSb().from('customer_favorites').delete().eq('user_id', uid).eq('establishment_id', estId)); 
          await loadCustomerData(uid); 
      },
      updateSettings: async (id: string, s: Settings) => { 
          await withTimeout(getSb().from('establishments').update({ settings: s }).eq('id', id)); 
          await loadEstablishmentData(id); 
      },
      updateUserStatus: async (userId: string, status: UserStatus) => {
          const sb = getSb();
          if (!sb) return;
          try {
              // Execução real no banco de dados
              // FIX: Casted to 'any' to fix TypeScript property access error.
              const { error } = (await withTimeout(sb.from('profiles').update({ status }).eq('id', userId))) as any;
              if (error) throw error;
              
              // Atualização do estado local para feedback imediato
              setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
              
              // Se o usuário atual for o afetado, atualiza ele também
              if (currentUser?.id === userId) {
                  setCurrentUser(prev => prev ? { ...prev, status } : null);
              }
          } catch (e) {
              console.error("Falha ao atualizar status do usuário no banco:", e);
              throw new Error("Erro ao salvar alteração no servidor.");
          }
      },
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
      getEstablishmentByPhone: (p: string) => Array.from(establishments.values()).find((e: Establishment) => e.phone === sanitizePhone(p)),
      clearAllSessions: async () => {}, 
      deleteCurrentUser: async () => {
          const sb = getSb();
          if (!sb || !currentUser) return;
          await withTimeout(sb.from('profiles').delete().eq('id', currentUser.id));
          await logout();
      },
      subscribeToEstablishmentCalls: () => () => {}, 
  }
};
