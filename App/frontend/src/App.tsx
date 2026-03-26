import { useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import { useUIStore } from './stores/ui';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ChatView from './components/ChatView';
import RightPanel from './components/RightPanel';
import Dashboard from './components/Dashboard';
import SpawnModal from './components/SpawnModal';

export default function App() {
  useSSE();

  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const selectedWorkspaceId = useUIStore((s) => s.selectedWorkspaceId);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          setMode('dashboard');
        } else if (e.key === '2') {
          e.preventDefault();
          if (selectedWorkspaceId) setMode('workspace');
        } else if (e.key === '3') {
          e.preventDefault();
          setMode('review');
        } else if (e.key === 'b') {
          e.preventDefault();
          toggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setMode, toggleSidebar, selectedWorkspaceId]);

  const showWorkspace = mode === 'workspace' && selectedWorkspaceId;

  return (
    <div className="flex h-full w-full bg-[--color-hermes-bg]">
      {/* Left Sidebar */}
      {sidebarOpen && <Sidebar />}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {showWorkspace && <TopBar />}

        {showWorkspace ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Center: Chat area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ChatView />
            </div>

            {/* Right Panel: file viewer + terminal */}
            <RightPanel />
          </div>
        ) : (
          <Dashboard />
        )}
      </div>

      {/* Global modals */}
      <SpawnModal />
    </div>
  );
}
