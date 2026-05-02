import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }
  }
});

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={qc}>
    <App />
  </QueryClientProvider>
);
