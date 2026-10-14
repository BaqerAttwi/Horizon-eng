import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { UnsavedChangesProvider } from './context/UnsavedChangesContext';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const router = createBrowserRouter([{ path: '*', element: <UnsavedChangesProvider>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', maxWidth: '400px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)' },
        success: { style: { background: '#0d1f12', color: '#4ade80', border: '1px solid #166534' } },
        error:   { style: { background: '#1f0d0d', color: '#f87171', border: '1px solid #991b1b' } },
      }}
    />
  </UnsavedChangesProvider> }]);

ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />);
