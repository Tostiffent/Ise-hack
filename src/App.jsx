import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const AppContent = () => {
  const { currentUser } = useStore();
  return currentUser ? <Dashboard /> : <Login />;
};

function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default App;
