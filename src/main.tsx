import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/toast';
import './index.css';

registerSW({ immediate: true });

// offlineFirst: run queries even without a connection so cached data can be used.
const queryClient = new QueryClient({
  defaultOptions: { queries: { networkMode: 'offlineFirst', staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }, mutations: { networkMode: 'offlineFirst' } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
