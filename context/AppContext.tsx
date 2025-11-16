import React, { createContext, useContext } from 'react';
import { useMockData } from '../hooks/useMockData';

type AppContextType = ReturnType<typeof useMockData>;

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockData = useMockData();
  return (
    <AppContext.Provider value={mockData}>
      {mockData.isInitialized ? children : <LoadingScreen />}
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

const LoadingScreen = () => (
    <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
    </div>
)
