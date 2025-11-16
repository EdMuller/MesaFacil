import React, { useState, useEffect } from 'react';
import { useAppContext } from './context/AppContext';
import EstablishmentDashboard from './components/EstablishmentDashboard';
import CustomerHome from './components/CustomerHome';
import Login from './components/Login';
import RegisterScreen from './components/RegisterScreen';
import AdminDashboard from './components/AdminDashboard';
import { Role } from './types';

type View = 'ROLE_SELECTION' | 'LOGIN' | 'REGISTER' | 'APP';

const App: React.FC = () => {
  const { currentUser, users, logout } = useAppContext();
  const [view, setView] = useState<View>('LOGIN');
  const [registrationRole, setRegistrationRole] = useState<Role | null>(null);

  useEffect(() => {
    if (currentUser) {
      setView('APP');
    } else {
       // If no users exist (besides admin), force registration. Otherwise, show login.
      if (users.filter(u => u.role !== Role.ADMIN).length === 0) {
        setView('ROLE_SELECTION');
      } else {
        setView('LOGIN');
      }
    }
  }, [currentUser, users]);

  const handleSelectRole = (role: Role) => {
    setRegistrationRole(role);
    setView('REGISTER');
  };

  const handleBackToLogin = () => {
    setRegistrationRole(null);
    setView('LOGIN');
  }
  
  const handleGoToRegister = () => {
     logout(); // ensure no user is logged in
     setView('ROLE_SELECTION');
  }

  const renderContent = () => {
    switch (view) {
      case 'LOGIN':
        return <Login onGoToRegister={handleGoToRegister} />;
      case 'ROLE_SELECTION':
        return <RoleSelectionScreen onSelectRole={handleSelectRole} />;
      case 'REGISTER':
        return <RegisterScreen role={registrationRole!} onBack={handleBackToLogin} />;
      case 'APP':
        if (currentUser?.role === Role.CUSTOMER) {
          return <CustomerHome />;
        }
        if (currentUser?.role === Role.ESTABLISHMENT) {
          return <EstablishmentDashboard />;
        }
        if (currentUser?.role === Role.ADMIN) {
          return <AdminDashboard />;
        }
        return <Login onGoToRegister={handleGoToRegister} />; // Fallback
      default:
        return <RoleSelectionScreen onSelectRole={handleSelectRole} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {renderContent()}
    </div>
  );
};

interface RoleSelectionScreenProps {
  onSelectRole: (role: Role) => void;
}

const RoleSelectionScreen: React.FC<RoleSelectionScreenProps> = ({ onSelectRole }) => {
  const { users } = useAppContext();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">Mesa Ativa</h1>
        <p className="text-lg text-slate-600 mb-12">Gerenciamento de atendimentos simplificado.</p>
      </div>
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-xl font-semibold text-center text-slate-700">Primeiro Acesso: Quem é você?</h2>
        <button
          onClick={() => onSelectRole(Role.CUSTOMER)}
          className="w-full bg-white border-2 border-blue-500 text-blue-500 font-bold py-4 px-6 rounded-xl shadow-md hover:bg-blue-50 transition-transform transform hover:-translate-y-1 duration-300 ease-in-out"
        >
          Sou Cliente
        </button>
        <button
          onClick={() => onSelectRole(Role.ESTABLISHMENT)}
          className="w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:bg-blue-700 transition-transform transform hover:-translate-y-1 duration-300 ease-in-out"
        >
          Sou Estabelecimento
        </button>
      </div>
        {users.length > 0 && (
             <p className="mt-8">
                Já tem uma conta?{' '}
                <button onClick={() => window.location.reload()} className="font-medium text-blue-600 hover:text-blue-500">
                   Faça o login
                </button>
            </p>
        )}
       <footer className="absolute bottom-4 text-center text-sm text-slate-500 px-4">
        <p>Este é um protótipo para demonstração. A troca de papéis simula a interação entre cliente e estabelecimento.</p>
      </footer>
    </div>
  );
};

export default App;