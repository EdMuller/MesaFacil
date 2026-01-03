
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { CallStatus, CallType, SemaphoreStatus, Table } from '../types';
import Header from './Header';
import SettingsIcon from './icons/SettingsIcon';
import ChartIcon from './icons/ChartIcon';
import ShareIcon from './icons/ShareIcon';
import UserIcon from './icons/UserIcon';
import SettingsModal from './SettingsModal';
import ShareModal from './ShareModal';
import ProfileModal from './ProfileModal';
import StatisticsModal from './StatisticsModal';
import { APP_URL, CALL_TYPE_INFO } from '../constants';


const EstablishmentDashboard: React.FC = () => {
  const { 
      currentEstablishment, 
      closeTable, 
      viewAllCallsForTable, 
      getTableSemaphoreStatus, 
      logout, 
      closeEstablishmentWorkday, 
      checkPendingCallsOnLogin,
      isUpdating
  } = useAppContext();

  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isShareAppOpen, setShareAppOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isStatisticsOpen, setStatisticsOpen] = useState(false);
  
  const hasCheckedPendingRef = useRef(false);

  useEffect(() => {
      const check = async () => {
          if (currentEstablishment && !hasCheckedPendingRef.current) {
              hasCheckedPendingRef.current = true;
              const hasPending = await checkPendingCallsOnLogin(currentEstablishment.id);
              if (hasPending) {
                  const keep = window.confirm(
                      "Identificamos atendimentos pendentes da última sessão. Deseja mantê-los?\n\n[OK] Manter Atendimentos\n[Cancelar] Limpar/Encerrar Tudo"
                  );
                  if (!keep) {
                      await closeEstablishmentWorkday(currentEstablishment.id);
                  }
              }
          }
      };
      check();
  }, [currentEstablishment, checkPendingCallsOnLogin, closeEstablishmentWorkday]);

  const tablesWithStatus = useMemo(() => {
    if (!currentEstablishment) return [];
    return Array.from(currentEstablishment.tables.values())
      .map((table: Table) => ({
        ...table,
        semaphore: getTableSemaphoreStatus(table, currentEstablishment.settings),
        activeCalls: table.calls.filter(c => c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)
      }))
      .filter(table => table.activeCalls.length > 0)
      .sort((a, b) => (a.activeCalls[0]?.createdAt ?? 0) - (b.activeCalls[0]?.createdAt ?? 0));
  }, [currentEstablishment, getTableSemaphoreStatus]);

  const semaphoreCounts = useMemo(() => {
    if (!currentEstablishment) return {} as Record<SemaphoreStatus, number>;
    return tablesWithStatus.reduce((acc, table) => {
      acc[table.semaphore] = (acc[table.semaphore] || 0) + 1;
      return acc;
    }, {} as Record<SemaphoreStatus, number>);
  }, [tablesWithStatus, currentEstablishment]);
  
  const handleCloseShift = async () => {
      if (!currentEstablishment) return;
      if (window.confirm("Deseja encerrar o expediente e zerar todos os atendimentos?")) {
          await closeEstablishmentWorkday(currentEstablishment.id);
          logout();
      }
  }

  if (!currentEstablishment) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <h2 className="text-xl font-bold text-gray-800">Sincronizando Estabelecimento...</h2>
              <p className="text-gray-500 mt-2">Estamos preparando o seu painel de atendimento.</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={logout} isEstablishment backText="Sair" />
      
      {isUpdating && (
          <div className="bg-blue-600 text-white text-[10px] uppercase font-bold text-center py-1 transition-all duration-500 animate-pulse">
              Sincronizando em tempo real...
          </div>
      )}

      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-3 sm:mb-0">
                <div className={`w-3 h-3 rounded-full ${currentEstablishment.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-gray-700 font-bold text-sm uppercase tracking-wide">
                    {currentEstablishment.isOpen ? 'Estabelecimento Aberto' : 'Estabelecimento Fechado'}
                </span>
            </div>
            
            <button 
                onClick={handleCloseShift}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 shadow transition-colors text-sm flex items-center gap-2"
            >
                Encerrar Expediente
            </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SemaphoreCard status={SemaphoreStatus.GREEN} count={semaphoreCounts.GREEN || 0} />
          <SemaphoreCard status={SemaphoreStatus.YELLOW} count={semaphoreCounts.YELLOW || 0} />
          <SemaphoreCard status={SemaphoreStatus.RED} count={semaphoreCounts.RED || 0} />
        </div>

        <div className="bg-white rounded-xl shadow-md p-4">
          <h2 className="text-xl font-bold mb-4">Mesas com Chamados</h2>
          {tablesWithStatus.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                 <p className="text-lg font-medium">Tudo tranquilo!</p>
                 <p className="text-sm">Aguardando novos chamados dos clientes.</p>
             </div>
          ) : (
            <div className="space-y-4">
              {tablesWithStatus.map(table => (
                <TableCard 
                  key={table.number} 
                  table={table} 
                  onCloseTable={() => closeTable(currentEstablishment.id, table.number)}
                  onViewCalls={() => viewAllCallsForTable(currentEstablishment.id, table.number)}
                  semaphore={table.semaphore}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 p-2 flex justify-around items-center z-20">
          <button onClick={() => setSettingsOpen(true)} className="flex flex-col items-center text-gray-600"><SettingsIcon /><span className="text-xs">Config</span></button>
          <button onClick={() => setStatisticsOpen(true)} className="flex flex-col items-center text-gray-600"><ChartIcon /><span className="text-xs">Stats</span></button>
          <button onClick={() => setShareAppOpen(true)} className="flex flex-col items-center text-gray-600"><ShareIcon /><span className="text-xs">Share</span></button>
          <button onClick={() => setProfileOpen(true)} className="flex flex-col items-center text-gray-600"><UserIcon /><span className="text-xs">Perfil</span></button>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
      <StatisticsModal isOpen={isStatisticsOpen} onClose={() => setStatisticsOpen(false)} />
      <ShareModal isOpen={isShareAppOpen} onClose={() => setShareAppOpen(false)} title="Compartilhe" text="" url={APP_URL} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
};

const SemaphoreCard: React.FC<{ status: SemaphoreStatus; count: number }> = ({ status, count }) => {
    if(status === SemaphoreStatus.IDLE) return null;
    const colors = { GREEN: 'bg-green-100 text-green-800', YELLOW: 'bg-yellow-100 text-yellow-800', RED: 'bg-red-100 text-red-800', IDLE: '' };
    const labels = { GREEN: 'Verde', YELLOW: 'Amarelo', RED: 'Vermelho', IDLE: '' };
    return (
        <div className={`p-4 rounded-lg shadow ${colors[status]} flex flex-col items-center justify-center`}>
            <span className="text-xs uppercase font-bold opacity-70 mb-1">{labels[status]}</span>
            <span className="text-3xl font-black">{count}</span>
        </div>
    );
};

const TableCard: React.FC<any> = ({ table, onCloseTable, onViewCalls, semaphore }) => {
    const { currentEstablishment, attendOldestCallByType } = useAppContext();
    const callsByType = table.calls.reduce((acc:any, call:any) => {
        if(call.status === CallStatus.SENT || call.status === CallStatus.VIEWED) {
            acc[call.type] = (acc[call.type] || 0) + 1;
        }
        return acc;
    }, {});

    const borderColors = { RED: 'border-red-500', YELLOW: 'border-yellow-500', GREEN: 'border-green-500', IDLE: 'border-gray-200' };

    return (
        <div className={`border-l-8 ${borderColors[semaphore as SemaphoreStatus]} bg-gray-50 rounded-lg p-4 shadow-sm transition-all`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-black text-gray-800">Mesa {table.number}</h3>
                <button 
                    onClick={onCloseTable} 
                    className="bg-white border border-red-200 text-red-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors uppercase tracking-tight"
                >
                    Fechar Mesa
                </button>
            </div>
            <div className="flex gap-2 flex-wrap">
                {Object.entries(callsByType).map(([type, count]) => (
                    <button 
                        key={type} 
                        onClick={() => attendOldestCallByType(currentEstablishment!.id, table.number, type as CallType)} 
                        className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-md hover:bg-blue-700 transition-all active:scale-95"
                    >
                        {CALL_TYPE_INFO[type as CallType].label} ({count as number})
                    </button>
                ))}
            </div>
        </div>
    )
}

export default EstablishmentDashboard;
