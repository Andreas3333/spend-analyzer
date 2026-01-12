import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser } from 'aws-amplify/auth';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import config from './amplifyconfiguration.json';

Amplify.configure(config);


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then(() => { if (mounted) setIsAuthenticated(true); })
      .catch(() => { if (mounted) setIsAuthenticated(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login onLoginSuccess={() => setIsAuthenticated(true)} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/"
          element={isAuthenticated ? <Dashboard onLogout={() => setIsAuthenticated(false)} /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Router>
  );
}

export default App;
