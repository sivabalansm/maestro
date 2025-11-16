import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import Layout from './components/Layout';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Scheduled from './pages/Scheduled';
import Account from './pages/Account';

console.log('App.jsx loaded');

function App() {
  console.log('App component rendering');
  
  try {
    return (
      <ThemeProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scheduled" element={<Scheduled />} />
              <Route path="/account" element={<Account />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    );
  } catch (error) {
    console.error('Error in App:', error);
    return (
      <div style={{ padding: '20px' }}>
        <h1>Error loading app</h1>
        <pre>{error.toString()}</pre>
      </div>
    );
  }
}

export default App;
