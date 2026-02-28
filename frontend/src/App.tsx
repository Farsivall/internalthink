import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { ProjectDetail } from './pages/ProjectDetail'
import { DecisionDetail } from './pages/DecisionDetail'
import { CreateProject } from './pages/CreateProject'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/new" element={<CreateProject />} />
        <Route path="/project/:projectId" element={<ProjectDetail />} />
        <Route path="/project/:projectId/decision/:decisionId" element={<DecisionDetail />} />
      </Routes>
    </Layout>
  )
}

export default App
