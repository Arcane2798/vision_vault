import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { config } from '@/config/env';
import { AuthProvider } from '@/context/AuthContext';
import { RealtimeProvider } from '@/context/RealtimeContext';
import App from './App';
import './index.css';

document.title = config.appName;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <App />
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
