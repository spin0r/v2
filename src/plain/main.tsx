import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/globals.css';
import './plain.css';
import App from './App';
import Edit from './Edit';

const isEdit = location.pathname.startsWith('/plain/edit/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEdit ? <Edit /> : <App />}
  </StrictMode>
);
