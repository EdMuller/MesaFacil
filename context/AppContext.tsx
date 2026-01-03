
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMockData } from '../hooks/useMockData';
import ConfigModal from '../components/ConfigModal';
import { SUPABASE_CONFIG } from '../constants';

// Estende o tipo do hook para incluir a função de reset manual
type AppContextType = ReturnType<typeof useMockData> & {
    resetConfig: () => void;
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockData = useMockData();
  
  // Inicializa o estado verificando o localStorage ou Configuração Fixa
  const [showConfig, setShowConfig] = useState(() => {
      // Se as credenciais estiverem no arquivo constants.ts, não mostra o modal
      if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
          return false;
      }

      const url = localStorage.getItem('supabase_url');
      const key = localStorage.getItem('supabase_key');
      return !url || !key;
  });

  const handleConfigSave = () => {
      window.location.reload();
      setShowConfig(false);
  };

  const resetConfig = () => {
      // Se estiver usando configuração fixa, não permite resetar localStorage
      if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
          alert("As configurações do servidor estão definidas pelo administrador e não podem ser alteradas.");
          return;
      }

      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_key');
      setShowConfig(true); // Força a modal a aparecer via React State
      try {
        window.location.reload(); 
      } catch (e) {
        console.log("Reload bloqueado pelo ambiente, seguindo via estado.");
      }
  };

  return (
    <AppContext.Provider value={{ ...mockData, resetConfig }}>
      {showConfig && <ConfigModal onSave={handleConfigSave} />}
      {!showConfig && mockData.isInitialized ? children : !showConfig ? <LoadingScreen /> : null}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

const LoadingScreen = () => {
    const { logout } = useAppContext(); 
    const [showReset, setShowReset] = useState(false);

    useEffect(() => {
        // Se demorar mais de 5 segundos carregando, mostra opção de deslogar
        const timer = setTimeout(() => setShowReset(true), 5000);
        return () => clearTimeout(timer);
    }, []);

    const handleHardReset = () => {
        if (window.confirm("Parece que a conexão está instável ou o seu login expirou. Deseja limpar sua sessão e tentar entrar novamente?")) {
            logout().finally(() => {
                window.location.reload();
            });
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen flex-col gap-6 p-4 text-center bg-gray-50">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <div>
                <p className="text-gray-700 font-bold mb-1">Sincronizando com Mesa Fácil...</p>
                <p className="text-xs text-gray-400">Isso pode levar alguns segundos dependendo da sua internet.</p>
            </div>

            {showReset && (
                <div className="mt-8 animate-fade-in max-w-xs">
                    <p className="text-sm text-gray-500 mb-4">Demorando muito?</p>
                    <button 
                        onClick={handleHardReset}
                        className="w-full bg-white border border-blue-300 text-blue-600 px-4 py-3 rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors shadow-sm"
                    >
                        Limpar Sessão e Recarregar
                    </button>
                    <p className="text-[10px] text-gray-400 mt-3">Utilize se a tela não abrir após o login.</p>
                </div>
            )}
        </div>
    );
}
