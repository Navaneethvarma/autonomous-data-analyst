import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { SAMPLE_SALES_SPEC } from './sample-spec.js';
import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App initialSpec={SAMPLE_SALES_SPEC} />
    </React.StrictMode>
  );
}
