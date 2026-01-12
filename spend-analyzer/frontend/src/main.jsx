import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { Amplify } from 'aws-amplify'
import '@aws-amplify/ui-react-storage/styles.css';
import './index.css'
import App from './App.jsx'
import config from './amplifyconfiguration.json';

Amplify.configure(config);


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ChakraProvider>
      <App />
    </ChakraProvider>
  </StrictMode>,
)
