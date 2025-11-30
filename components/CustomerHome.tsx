
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Establishment, UserStatus } from '../types';
import Header from './Header';
import CustomerView from './CustomerView';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import TrashIcon from './icons/TrashIcon';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import VipModal from './VipModal';
import { APP_URL } from '../constants';

interface CustomerHomeProps {
  isGuest?: boolean;
  onExitGuestMode?: () => void;
}

const CustomerHome: React.FC<CustomerHomeProps> = ({ isGuest = false, onExitGuestMode }) => {
  const { 
      currentUser,
      logout, 
      establishments, 
      currentCustomerProfile, 
      getEstablishmentByPhone,
      searchEstablishmentByPhone,
      favoriteEstablishment,
      unfavoriteEstablishment,
      subscribeToEstablishmentCalls,
    } = useAppContext();

  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [isEnteringTable, setIsEnteringTable] = useState(false);
  const [phoneToSearch, setPhoneToSearch] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(''); // Mensagem temporária (ex: Estabelecimento Fechado)
  const [tableError, setTableError] = useState('');
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isVipModalOpen, setVipModalOpen] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);

  // Efeito para ativar o Realtime no estabelecimento selecionado
  useEffect(() => {
      if (selectedEstablishment) {
          const unsubscribe = subscribeToEstablishmentCalls(selectedEstablishment.id);
          return () => {
              unsubscribe && unsubscribe();
          };
      }
  }, [selectedEstablishment?.id, subscribeToEstablishmentCalls]);

  const favorited = useMemo(() => {
    if (!currentCustomerProfile) return [];
    return currentCustomerProfile.favoritedEstablishmentIds
        .map(id => establishments.get(id))
        .filter((e): e is Establishment => e !== undefined);
  }, [currentCustomerProfile, establishments]);
  
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setStatusMessage('');
      setIsLoadingSearch(true);
      
      try {
        // Try to get from cache or async search
        let establishment = getEstablishmentByPhone(phoneToSearch);
        if (!establishment && searchEstablishmentByPhone) {
            // @ts-ignore
            establishment = await searchEstablishmentByPhone(phoneToSearch);
        }
        
        if (!establishment) {
            setError("Nenhum estabelecimento encontrado com este telefone.");
            setIsLoadingSearch(false);
            return;
        }
        
        if (isGuest) {
            if(!establishment.isOpen) {
                setError("Estabelecimento encontrado, mas está fechado no momento.");
                setIsLoadingSearch(false);
                return;
            }
            handleSelectEstablishment(establishment);
        } else {
            try {
            if (!currentUser) throw new Error("Usuário não logado.");
            await favoriteEstablishment(currentUser!.id, establishment.id);
            setPhoneToSearch('');
            } catch (err: any) {
            if (err.message.includes("máximo 3")) {
                setVipModalOpen(true);
            } else {
                setError(err.message);
            }
            }
        }
      } catch (err) {
          setError("Erro ao buscar estabelecimento.");
      } finally {
          setIsLoadingSearch(false);
      }
  };

  const handleSelectEstablishment = (establishment: Establishment) => {
    setError('');
    setStatusMessage('');

    if (!establishment.isOpen) {
        // Não abre a tela de mesa, apenas avisa
        setStatusMessage(`"${establishment.name}" está fechado no momento.`);
        setTimeout(() => setStatusMessage(''), 3000); // Limpa após 3 segundos
        return;
    }

    setSelectedEstablishment(establishment);
    setIsEnteringTable(true);
  };
  
  const handleTableSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setTableError('');

      if (!selectedEstablishment) return;

      if(!selectedEstablishment.isOpen) {
          setTableError("O estabelecimento fechou. Não é possível entrar.");
          return;
      }

      if (!tableNumber.trim()) {
        setTableError("Por favor, informe o número da mesa.");
        return;
      }

      const table = selectedEstablishment?.tables.get(tableNumber);
      const hasActiveCalls = table?.calls.some(c => c.status === 'SENT' || c.status === 'VIEWED');

      if (hasActiveCalls) {
          setTableError("Esta mesa já tem chamados em andamento.");
          // return; 
      }
      
      const tableNum = parseInt(tableNumber, 10);
      const totalTables = selectedEstablishment?.settings?.totalTables || 20;
      
      if (isNaN(tableNum) || tableNum < 1 || tableNum > totalTables) {
           setTableError("Mesa Inexistente. Verifique o número e tente novamente.");
           return;
      }

      setIsEnteringTable(false);
  }

  // If a table has been set, show the call view
  if (selectedEstablishment && tableNumber && !isEnteringTable) {
      return <CustomerView 
                establishment={selectedEstablishment} 
                tableNumber={tableNumber} 
                onBack={() => {
                    setSelectedEstablishment(null);
                    setTableNumber('');
                    setTableError('');
                    if (isGuest && selectedEstablishment) {
                        setIsEnteringTable(true); 
                    }
                }}
             />
  }

  const headerAction = isGuest ? onExitGuestMode! : logout;
  // Botão alterado para "Voltar" conforme pedido
  const backText = "Voltar"; 

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={headerAction} backText={backText} establishmentOverride={null} />
       <main className="p-4 md:p-6 max-w-2xl mx-auto">
        
        {isGuest ? (
            <div className="mb-6">
                <div className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl shadow-lg py-3 px-4 flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span className="text-lg font-bold">Acesso Eventual</span>
                </div>
            </div>
        ) : (
            <div className="text-center mb-4">
                {/* Fonte igualada à do Header (text-xl font-bold) */}
                <h1 className="text-xl font-bold text-blue-600">Meus Favoritos</h1>
                {/* Removido o subtítulo "Selecione um estabelecimento..." */}
            </div>
        )}


        {/* Search form - Fontes reduzidas em 2 números (text-sm -> text-xs, etc) */}
        <form onSubmit={handleSearch} className="mb-6 p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <h2 className="font-bold mb-2 text-xs text-gray-700">{isGuest ? 'Buscar pelo Telefone' : 'Adicionar novo favorito'}</h2>
            <div className="flex flex-col sm:flex-row gap-2">
                <input 
                    type="tel"
                    value={phoneToSearch}
                    onChange={(e) => setPhoneToSearch(e.target.value)}
                    placeholder="Telefone..."
                    className="flex-grow p-1.5 text-xs border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                <button disabled={isLoadingSearch} type="submit" className="bg-blue-600 text-white font-bold py-1.5 px-3 rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-xs">
                    {isLoadingSearch ? '...' : (isGuest ? 'Buscar' : 'Adicionar')}
                </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
            {statusMessage && <p className="text-red-500 text-xs font-bold mt-2 text-center bg-red-50 p-2 rounded animate-pulse">{statusMessage}</p>}
        </form>
        
        {/* Favorited list */}
        {!isGuest && (
            <>
            {favorited.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-xs">Você ainda não tem favoritos.</p>
            ) : (
                <div className="space-y-3">
                    {favorited.map(est => (
                        // Card Principal
                        <div 
                            key={est.id} 
                            onClick={() => handleSelectEstablishment(est)}
                            className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 hover:shadow-md transition-all cursor-pointer"
                        >
                            <div className="flex gap-3">
                                {/* Foto: Altura limitada (aprox 56px) */}
                                <div className="flex-shrink-0">
                                    <img src={est.photoUrl} alt={est.name} className="w-14 h-14 rounded-lg object-cover bg-gray-200" />
                                </div>

                                {/* Conteúdo de Texto */}
                                <div className="flex-grow overflow-hidden flex flex-col justify-between">
                                    <div>
                                        {/* Nome: 1 Linha, Fonte menor */}
                                        <h3 className="text-sm font-bold text-blue-600 truncate leading-tight">{est.name}</h3>
                                        {/* Frase: 1 Linha, Fonte menor */}
                                        <p className="text-xs text-gray-500 italic truncate leading-tight mt-0.5">"{est.phrase}"</p>
                                    </div>
                                    
                                    {/* Linha de Status e Ações (Abaixo da frase) */}
                                    <div className="flex items-center justify-between mt-1.5">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${est.isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {est.isOpen ? 'Aberto' : 'Fechado'}
                                        </span>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Remover "${est.name}"?`)) {
                                                    unfavoriteEstablishment(currentUser!.id, est.id);
                                                }
                                            }}
                                            className="text-gray-300 hover:text-red-500 p-1"
                                            aria-label="Remover"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                                {/* Setinha removida */}
                            </div>
                        </div>
                    ))}
                </div>
            )}
             <div className="my-8 text-center bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-xs text-gray-600 mb-1">Quer ter mais favoritos?</p>
                <button onClick={() => setVipModalOpen(true)} className="font-bold text-lg text-blue-600 hover:text-blue-800 transition-colors">
                   Seja VIP
                </button>
            </div>
            </>
        )}

      </main>

      {isEnteringTable && selectedEstablishment && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-xs p-5 text-center">
                  <h2 className="text-lg font-bold mb-1 text-blue-800">{selectedEstablishment.name}</h2>
                  
                  <form onSubmit={handleTableSubmit}>
                      <label htmlFor="tableNumber" className="block text-sm font-medium text-gray-600 my-3">Qual o número da mesa?</label>
                      <input
                          id="tableNumber"
                          type="number"
                          value={tableNumber}
                          onChange={(e) => setTableNumber(e.target.value)}
                          className="w-full text-center text-3xl font-bold p-3 border-2 border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-800"
                          autoFocus
                          required
                      />
                      {tableError && <p className="text-red-500 text-xs mt-2 font-medium bg-red-50 p-1 rounded">{tableError}</p>}
                      
                      <div className="mt-5 flex gap-2">
                         <button type="button" onClick={() => { setIsEnteringTable(false); setSelectedEstablishment(null); setTableNumber(''); setTableError(''); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2 rounded-md text-sm hover:bg-gray-200">
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-md text-sm hover:bg-blue-700 shadow-md"
                        >
                            Entrar
                        </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
      
      {!isGuest && (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-gray-100 p-2 flex justify-between px-8 items-center z-10">
              <button onClick={() => setShareAppOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <ShareIcon /> <span className="text-[10px] mt-0.5">Share</span>
              </button>
              <button onClick={() => setProfileOpen(true)} className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors">
                  <UserIcon /> <span className="text-[10px] mt-0.5">Perfil</span>
              </button>
            </div>
            <ShareModal isOpen={isShareAppOpen} onClose={() => setShareAppOpen(false)} title="Compartilhar" text="" url={APP_URL} />
            <ProfileModal isOpen={isProfileOpen} onClose={() => setProfileOpen(false)} />
            <VipModal isOpen={isVipModalOpen} onClose={() => setVipModalOpen(false)} />
        </>
      )}

    </div>
  );
};

export default CustomerHome;
