
import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { CallType, CallStatus, Establishment, SemaphoreStatus } from '../types';
import { CALL_TYPE_INFO } from '../constants';
import Header from './Header';
import HandIcon from './icons/HandIcon';
import MenuIcon from './icons/MenuIcon';
import ReceiptIcon from './icons/ReceiptIcon';

interface CustomerViewProps {
    establishment: Establishment;
    tableNumber: string;
    onBack: () => void;
}

const CustomerView: React.FC<CustomerViewProps> = ({ establishment: initialEst, tableNumber, onBack }) => {
  const { establishments, addCall, cancelOldestCallByType, getCallTypeSemaphoreStatus, isUpdating } = useAppContext();
  
  // Obtém versão atualizada do contexto (que é atualizada a cada 30s)
  const establishment = establishments.get(initialEst.id) || initialEst;
  
  // Regra 1: Se fechou, mostra tela de bloqueio
  if (!establishment.isOpen) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded shadow text-center border-t-4 border-red-500">
                  <h2 className="text-xl font-bold mb-2">Estabelecimento Fechado</h2>
                  <p className="text-gray-600 mb-4 text-sm">O expediente foi encerrado.</p>
                  <button onClick={onBack} className="bg-blue-600 text-white py-2 px-4 rounded font-bold w-full">Voltar</button>
              </div>
          </div>
      )
  }
  
  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <Header onBack={onBack} isEstablishment={false} establishmentOverride={establishment} backText="Voltar" />
      
      {isUpdating && <div className="bg-blue-500 text-white text-[10px] text-center py-1">Atualizando status (ciclo 30s)...</div>}

      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center mb-6">
            <p className="text-lg text-gray-600">Sua Mesa</p>
            <h2 className="text-5xl font-bold text-blue-600">{tableNumber}</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
            {[CallType.WAITER, CallType.MENU, CallType.BILL].map(type => (
                <CallButton 
                    key={type}
                    type={type} 
                    establishment={establishment} 
                    tableNumber={tableNumber}
                    onCall={() => addCall(establishment.id, tableNumber, type)}
                    onCancel={() => cancelOldestCallByType(establishment.id, tableNumber, type)}
                />
            ))}
        </div>
      </div>
    </div>
  );
};

const CallButton: React.FC<any> = ({ type, establishment, tableNumber, onCall, onCancel }) => {
    const icons = { [CallType.WAITER]: <HandIcon />, [CallType.MENU]: <MenuIcon />, [CallType.BILL]: <ReceiptIcon /> };
    const table = establishment.tables.get(tableNumber);
    const pendingCalls = table?.calls.filter((c:any) => c.type === type && (c.status === CallStatus.SENT || c.status === CallStatus.VIEWED)) || [];
    const pendingCount = pendingCalls.length;
    const oldestCall = pendingCount > 0 ? pendingCalls[0] : null; // Como vem do banco ordenado, pega o primeiro
    
    // Regra 5: Retornar ao usuário informação de Recebido (Viewed)
    const isViewed = oldestCall?.status === CallStatus.VIEWED;
    
    // Feedback imediato de "Enviado" é garantido pelo addCall local,
    // mas a confirmação de "Recebido/Visualizado" virá no próximo ciclo de 30s.

    return (
        <div className={`bg-white rounded-xl shadow border-2 transition-all p-4 ${pendingCount > 0 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
            <button onClick={onCall} className="w-full flex items-center gap-4 text-blue-600 py-2">
                <div className="scale-110">{icons[type as CallType]}</div>
                <span className="text-xl text-gray-800 font-bold">{CALL_TYPE_INFO[type as CallType].verb}</span>
            </button>
            
            {pendingCount > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase flex items-center gap-1 ${isViewed ? 'bg-green-100 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                        <span className={`w-2 h-2 rounded-full ${isViewed ? 'bg-green-500' : 'bg-yellow-600'}`}></span>
                        {isViewed ? 'Visualizado pelo Garçom' : 'Enviado - Aguarde'}
                    </div>
                    <button onClick={onCancel} className="text-red-600 text-xs font-bold border border-red-200 px-2 py-1 rounded bg-white">Cancelar</button>
                </div>
            )}
        </div>
    );
};

export default CustomerView;
