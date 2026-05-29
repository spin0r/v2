import './styles/globals.css';
import { renderApp } from './appShell.ts';

const el = document.getElementById('app');
if (el) renderApp(el);
