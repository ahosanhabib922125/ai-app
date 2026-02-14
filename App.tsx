
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles, Layout, Activity, Loader,
  Monitor, Smartphone, Wand2, Image as ImageIcon, FileText,
  Play, Check, FileCode, X, Paperclip, LayoutTemplate, Upload,
  ChevronLeft, MessageSquare, Bot, User, BrainCircuit,
  Download, Package, Terminal, AlertTriangle,
  ChevronDown, Copy, Figma, History, Plus, Trash2, Calendar,
  PanelTop, Workflow, PanelTopOpen, Maximize, Minimize2, Undo2, Redo2, Eye, PenTool, Search, ExternalLink,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ArrowUpFromLine, ArrowDownFromLine,
  FolderOpen, ChevronRight, Component, Menu, Link2, CheckCheck,
  Zap, ArrowRight, Layers, Globe, MousePointer, Code2, Palette, Share2
} from 'lucide-react';
import { generateArchitectureStream, analyzePRD, mapIconNames, editWithAI, editElementWithAI } from './services/geminiService';
import { PRESET_TEMPLATES } from './constants';
import { RoadmapItem, GeneratedFile, DesignTemplate, ChatMessage, ProjectSession, PageAnalysisItem, PRDColors } from './types';
// JSZip and domToFigmaScript are lazy-loaded when needed

// --- Session sharing: compress/decompress via gzip + base64url ---
async function compressSession(data: object): Promise<string> {
  const json = JSON.stringify(data);
  const blob = new Blob([json]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decompressSession(encoded: string): Promise<any> {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes]);
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

// --- Sub-components ---

const TemplateThumbnail: React.FC<{ template: DesignTemplate }> = React.memo(({ template }) => {
  const [loaded, setLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!template.path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
        <LayoutTemplate className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative bg-white group-hover:shadow-sm transition-all overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
          <Loader className="w-4 h-4 text-slate-300 animate-spin" />
        </div>
      )}
      {isVisible && (
        <iframe
          src={template.path}
          className={`w-[400%] h-[400%] origin-top-left scale-[0.25] pointer-events-none border-none transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          title={template.name}
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 z-20 bg-transparent" />
    </div>
  );
});

const ICON_LIBRARIES = [
  { value: 'lucide', label: 'Lucide', desc: 'Clean & minimal' },
  { value: 'mdi', label: 'Material Design', desc: 'Google Material' },
  { value: 'heroicons', label: 'Heroicons', desc: 'Tailwind style' },
  { value: 'ph', label: 'Phosphor', desc: 'Flexible & consistent' },
  { value: 'tabler', label: 'Tabler Icons', desc: '5000+ icons' },
  { value: 'bi', label: 'Bootstrap Icons', desc: 'Bootstrap official' },
  { value: 'fa6-solid', label: 'Font Awesome', desc: 'FA6 Solid' },
  { value: 'ri', label: 'Remix Icons', desc: 'Open source set' },
  { value: 'solar', label: 'Solar', desc: 'Bold duotone' },
  { value: 'fluent', label: 'Fluent UI', desc: 'Microsoft Fluent' },
];

const App: React.FC = () => {
  // Flow State
  const [step, setStep] = useState<'landing' | 'selection' | 'studio'>('landing');
  const [sharedView, setSharedView] = useState<{ files: Record<string, GeneratedFile>; title: string; compressed: string; activePage: string } | null>(null);

  // App State
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'templates' | 'history'>('chat');
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DesignTemplate>(PRESET_TEMPLATES[0]);

  const [status, setStatus] = useState<'idle' | 'planning' | 'coding' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to build');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<DesignTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [fontSearch, setFontSearch] = useState('');
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const [designMode, setDesignMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{tag: string; classes: string; text: string; canEditText: boolean; styles: Record<string, string>; attrs?: Record<string, string>} | null>(null);
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const [unsplashResults, setUnsplashResults] = useState<Array<{id: string; thumb: string; regular: string; alt: string; user: string}>>([]);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [designSections, setDesignSections] = useState<Record<string, boolean>>({icons: true, typography: true, colors: true, border: false, spacing: false, size: false, layout: false, flexbox: false, effects: false});
  const [activeIconLibrary, setActiveIconLibrary] = useState<string>('lucide');
  const [iconMappingLoading, setIconMappingLoading] = useState(false);
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [aiEditLoading, setAiEditLoading] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [designSrcDoc, setDesignSrcDoc] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ atoms: true, molecules: true, organisms: true, pages: true });
  const designAutoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designDirtyRef = useRef(false);

  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [files, setFiles] = useState<Record<string, GeneratedFile>>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const filesRef = useRef<Record<string, GeneratedFile>>({});
  filesRef.current = files;
  const activeFileRef = useRef<string | null>(null);
  activeFileRef.current = activeFile;
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isChatExportOpen, setIsChatExportOpen] = useState(false);

  // Session State
  const [sessionId, setSessionId] = useState<string>(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#\/chat\/(.+)$/);
    return match ? match[1] : Date.now().toString();
  });
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Chat History
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Undo/Redo State
  const [filesHistory, setFilesHistory] = useState<Record<string, GeneratedFile>[]>([]);
  const [filesHistoryIndex, setFilesHistoryIndex] = useState(-1);
  const filesHistoryIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  // Abort controller for stopping generation
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derived State (memoized)
  const currentTask = useMemo(() => roadmap.find(r => r.status === 'active'), [roadmap]);
  const hasStarted = chatHistory.length > 0;
  const canUndo = filesHistoryIndex > 0;
  const canRedo = filesHistoryIndex < filesHistory.length - 1;

  const groupedFiles = useMemo(() => {
    const allFiles = Object.values(files) as GeneratedFile[];
    const atoms: GeneratedFile[] = [];
    const molecules: GeneratedFile[] = [];
    const organisms: GeneratedFile[] = [];
    const pages: GeneratedFile[] = [];
    for (const f of allFiles) {
      const name = f.name.toLowerCase();
      if (name.endsWith('.atom.html')) { atoms.push(f); }
      else if (name.endsWith('.molecule.html')) { molecules.push(f); }
      else if (name.endsWith('.organism.html')) { organisms.push(f); }
      else { pages.push(f); }
    }
    return { atoms, molecules, organisms, pages };
  }, [files]);

  // Close font dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setFontDropdownOpen(false);
        setFontSearch('');
      }
    };
    if (fontDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fontDropdownOpen]);

  // --- Persistence Logic ---

  // Helper to load a session object into state
  const loadSessionIntoState = useCallback((data: any) => {
    setSessionId(data.id || Date.now().toString());
    if (data.template) setSelectedTemplate(data.template);
    setChatHistory(data.chatHistory || []);
    setRoadmap(data.roadmap || []);
    setFiles(data.files || {});
    const fileKeys = Object.keys(data.files || {});
    setActiveFile(fileKeys.length > 0 ? fileKeys[0] : null);
    setStep('studio');
    setActiveTab('chat');
    setStatus((data.roadmap || []).length > 0 ? 'completed' : 'idle');
    setStatusMessage('Session Loaded');
    setProgress(100);
  }, []);

  // Load sessions from local storage on mount, then auto-load from URL hash
  useEffect(() => {
    const saved = localStorage.getItem('ai_architect_sessions');
    let loadedSessions: ProjectSession[] = [];
    if (saved) {
      try {
        loadedSessions = JSON.parse(saved);
        setSessions(loadedSessions);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }

    const hash = window.location.hash;

    // Shared link: #/{compressedData}/fullview/{pageName}
    const shareMatch = hash.match(/^#\/([A-Za-z0-9_-]{10,})\/fullview(?:\/(.+))?$/);
    if (shareMatch) {
      const compressedData = shareMatch[1];
      const requestedPage = shareMatch[2] ? decodeURIComponent(shareMatch[2]) : '';
      decompressSession(compressedData).then(data => {
        const rawFiles = data.files || {};
        const title = data.title || data.chatHistory?.[0]?.text?.slice(0, 50) || 'Shared Project';
        // Normalize: files might be Record<string, GeneratedFile> or Record<string, string>
        const gFiles: Record<string, GeneratedFile> = {};
        Object.keys(rawFiles).forEach(k => {
          const v = rawFiles[k];
          if (typeof v === 'string') {
            gFiles[k] = { name: k, content: v, language: 'html' };
          } else if (v && typeof v === 'object' && v.content) {
            gFiles[k] = { name: v.name || k, content: v.content, language: v.language || 'html' };
          }
        });
        const allKeys = Object.keys(gFiles);
        const pageKeys = allKeys.filter((n: string) => n.endsWith('.page.html'));
        const defaultPage = pageKeys.length > 0 ? pageKeys[0] : allKeys[0] || '';
        const activePage = requestedPage && gFiles[requestedPage] ? requestedPage : defaultPage;
        setSharedView({ files: gFiles, title, compressed: compressedData, activePage });
      }).catch(err => {
        console.error('Failed to load shared session:', err);
      });
      return;
    }

    // Local link: #/chat/{session_id} — same browser only
    const chatMatch = hash.match(/^#\/chat\/(.+)$/);
    if (chatMatch && loadedSessions.length > 0) {
      const target = loadedSessions.find(s => s.id === chatMatch[1]);
      if (target) loadSessionIntoState(target);
    }
  }, []);

  // Update URL hash based on current step
  useEffect(() => {
    const currentHash = window.location.hash;
    if (step === 'studio' && chatHistory.length > 0) {
      const target = `#/chat/${sessionId}`;
      if (currentHash !== target) window.history.pushState(null, '', target);
    } else if (step === 'selection') {
      if (currentHash !== '#/templates') window.history.pushState(null, '', '#/templates');
    } else if (step === 'landing') {
      if (currentHash && currentHash !== '#' && currentHash !== '#/') window.history.pushState(null, '', window.location.pathname);
    }
  }, [sessionId, step, chatHistory.length]);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      // Handle shared links
      const shareMatch = hash.match(/^#\/([A-Za-z0-9_-]{10,})\/fullview(?:\/(.+))?$/);
      if (shareMatch) {
        const compressedData = shareMatch[1];
        const requestedPage = shareMatch[2] ? decodeURIComponent(shareMatch[2]) : '';
        decompressSession(compressedData).then(data => {
          const rawFiles = data.files || {};
          const gFiles: Record<string, GeneratedFile> = {};
          Object.keys(rawFiles).forEach(k => {
            const v = rawFiles[k];
            if (typeof v === 'string') {
              gFiles[k] = { name: k, content: v, language: 'html' };
            } else if (v && typeof v === 'object' && v.content) {
              gFiles[k] = { name: v.name || k, content: v.content, language: v.language || 'html' };
            }
          });
          const allKeys = Object.keys(gFiles);
          const pageKeys = allKeys.filter((n: string) => n.endsWith('.page.html'));
          const defaultPage = pageKeys.length > 0 ? pageKeys[0] : allKeys[0] || '';
          const activePage = requestedPage && gFiles[requestedPage] ? requestedPage : defaultPage;
          setSharedView({ files: gFiles, title: data.title || 'Shared Project', compressed: compressedData, activePage });
        }).catch(() => {});
        return;
      }
      // Handle local session links
      const chatMatch = hash.match(/^#\/chat\/(.+)$/);
      if (chatMatch) {
        const target = sessions.find(s => s.id === chatMatch[1]);
        if (target && target.id !== sessionId) loadSessionIntoState(target);
      } else if (hash === '#/templates') {
        setStep('selection');
      } else if (!hash || hash === '#' || hash === '#/') {
        setStep('landing');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => { window.removeEventListener('hashchange', handleHashChange); window.removeEventListener('popstate', handleHashChange); };
  }, [sessions, sessionId, loadSessionIntoState]);

  // Save current session state whenever it changes (debounced to avoid lag during streaming)
  useEffect(() => {
    if (chatHistory.length === 0) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      const currentSession: ProjectSession = {
        id: sessionId,
        title: chatHistory[0]?.text.slice(0, 50) + (chatHistory[0]?.text.length > 50 ? '...' : '') || 'Untitled Project',
        lastModified: Date.now(),
        template: selectedTemplate,
        chatHistory,
        roadmap,
        files
      };

      setSessions(prev => {
        const existingIdx = prev.findIndex(s => s.id === sessionId);
        let newSessions;
        if (existingIdx >= 0) {
          newSessions = [...prev];
          newSessions[existingIdx] = currentSession;
        } else {
          newSessions = [currentSession, ...prev];
        }
        localStorage.setItem('ai_architect_sessions', JSON.stringify(newSessions));
        return newSessions;
      });
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [chatHistory, roadmap, files, sessionId, selectedTemplate]);

  // Listen for navigation + design mode messages from preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'navigate' && event.data?.file) {
        const targetFile = event.data.file;
        if (files[targetFile]) {
          const iframe = previewIframeRef.current;
          if (iframe) {
            iframe.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            iframe.style.opacity = '0';
            iframe.style.transform = 'translateX(30px)';
            setTimeout(() => {
              setActiveFile(targetFile);
              iframe.style.transform = 'translateX(-20px)';
              requestAnimationFrame(() => {
                iframe.style.opacity = '1';
                iframe.style.transform = 'translateX(0)';
              });
            }, 200);
          } else {
            setActiveFile(targetFile);
          }
        }
      }
      if (event.data?.type === 'dm-icon-library-detected') {
        setActiveIconLibrary(event.data.library || 'lucide');
      }
      if (event.data?.type === 'dm-select') {
        setSelectedElement({
          tag: event.data.tag,
          classes: event.data.classes,
          text: event.data.text,
          canEditText: event.data.canEditText ?? false,
          attrs: event.data.attrs || {},
          styles: event.data.styles
        });
        setUnsplashResults([]);
        setUnsplashQuery('');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [files]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab]);

  // --- Actions ---

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setSessionId(newId);
    setChatHistory([]);
    setRoadmap([]);
    setFiles({});
    setActiveFile(null);
    setStatus('idle');
    setProgress(0);
    setStatusMessage('Ready to build');
    setStep('selection');
    setActiveTab('chat');
    setFilesHistory([]);
    setFilesHistoryIndex(-1);
    filesHistoryIndexRef.current = -1;
    window.history.replaceState(null, '', window.location.pathname);
  };

  // Push a snapshot to undo/redo history
  const pushFilesSnapshot = useCallback((snapshot: Record<string, GeneratedFile>) => {
    const currentIndex = filesHistoryIndexRef.current;
    setFilesHistory(prev => {
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push({ ...snapshot });
      return newHistory;
    });
    const newIndex = currentIndex + 1;
    setFilesHistoryIndex(newIndex);
    filesHistoryIndexRef.current = newIndex;
  }, []);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = filesHistoryIndex - 1;
    isUndoRedoRef.current = true;
    setFilesHistoryIndex(newIndex);
    filesHistoryIndexRef.current = newIndex;
    const snapshot = filesHistory[newIndex];
    setFiles(snapshot);
    const fileKeys = Object.keys(snapshot);
    if (fileKeys.length === 0) {
      setActiveFile(null);
    } else if (!activeFile || !snapshot[activeFile]) {
      setActiveFile(fileKeys[0]);
    }
    if (designMode) {
      const targetFile = activeFile && snapshot[activeFile] ? activeFile : fileKeys[0];
      if (targetFile && snapshot[targetFile]) {
        setDesignSrcDoc(snapshot[targetFile].content);
      }
      setSelectedElement(null);
      designDirtyRef.current = false;
    }
  }, [canUndo, filesHistoryIndex, filesHistory, activeFile, designMode]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = filesHistoryIndex + 1;
    isUndoRedoRef.current = true;
    setFilesHistoryIndex(newIndex);
    filesHistoryIndexRef.current = newIndex;
    const snapshot = filesHistory[newIndex];
    setFiles(snapshot);
    const fileKeys = Object.keys(snapshot);
    if (fileKeys.length === 0) {
      setActiveFile(null);
    } else if (!activeFile || !snapshot[activeFile]) {
      setActiveFile(fileKeys[0]);
    }
    if (designMode) {
      const targetFile = activeFile && snapshot[activeFile] ? activeFile : fileKeys[0];
      if (targetFile && snapshot[targetFile]) {
        setDesignSrcDoc(snapshot[targetFile].content);
      }
      setSelectedElement(null);
      designDirtyRef.current = false;
    }
  }, [canRedo, filesHistoryIndex, filesHistory, activeFile, designMode]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Clear design mode selection when switching files
  useEffect(() => {
    setSelectedElement(null);
  }, [activeFile]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  const handleLoadSession = (session: ProjectSession) => {
    setSessionId(session.id);
    setSelectedTemplate(session.template);
    setChatHistory(session.chatHistory);
    setRoadmap(session.roadmap);
    setFiles(session.files);
    window.history.pushState(null, '', `#/chat/${session.id}`);

    // Set active file if exists
    const fileKeys = Object.keys(session.files);
    if (fileKeys.length > 0) {
      setActiveFile(fileKeys[0]);
    } else {
      setActiveFile(null);
    }

    setStep('studio');
    setActiveTab('chat');
    setStatus(session.roadmap.length > 0 ? 'completed' : 'idle'); // Assume completed if loading historic
    setStatusMessage('Session Loaded');
    setProgress(100);
  };

  const handleDeleteSession = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== idToDelete);
    setSessions(newSessions);
    localStorage.setItem('ai_architect_sessions', JSON.stringify(newSessions));

    // If deleting current session, reset
    if (idToDelete === sessionId) {
      handleNewChat();
    }
  };

  const handleTemplateSelect = async (tmpl: DesignTemplate) => {
    setIsLoadingTemplate(true);
    let content = tmpl.content;

    // If content is not pre-loaded, fetch it from the path
    if (!content && tmpl.path) {
      try {
        const response = await fetch(tmpl.path);
        if (response.ok) {
          content = await response.text();
        } else {
          console.error(`Failed to load template: ${tmpl.name}`);
          setStatusMessage("Error loading template");
          setIsLoadingTemplate(false);
          return;
        }
      } catch (error) {
        console.error(`Error loading template ${tmpl.name}:`, error);
        setStatusMessage("Error loading template");
        setIsLoadingTemplate(false);
        return;
      }
    }

    if (content) {
      setSelectedTemplate({ ...tmpl, content });
      setStep('studio');
      setStatusMessage(`Using ${tmpl.name} DNA`);
    }
    setIsLoadingTemplate(false);
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      const newTmpl = {
        name: file.name.replace('.html', ''),
        description: "Custom uploaded Design DNA",
        content: text
      };
      handleTemplateSelect(newTmpl);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFiles([...attachedFiles, e.target.files[0]]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(attachedFiles.filter((_, i) => i !== index));
  };

  const startBuild = async () => {
    if (!prompt.trim()) return;
    abortRef.current = false;
    abortControllerRef.current?.abort(); // Cancel any previous build
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Determine if this is a fresh build or a modification
    const isModification = Object.keys(files).length > 0;

    // Push pre-build snapshot for undo support
    pushFilesSnapshot({ ...files });
    const currentTimestamp = Date.now();

    // 1. Add USER message
    const newUserMsg: ChatMessage = {
      id: currentTimestamp.toString(),
      role: 'user',
      text: prompt,
      timestamp: currentTimestamp,
      attachments: attachedFiles.map(f => f.name)
    };

    // 2. Add initial AI message (Analysis Phase)
    const aiMsgId = (currentTimestamp + 1).toString();
    const newAiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'ai',
      text: "Analyzing your requirements...",
      timestamp: currentTimestamp + 1,
      isStreaming: true,
      statusPhase: 'analyzing',
      roadmap: []
    };

    setChatHistory(prev => [...prev, newUserMsg, newAiMsg]);

    // SWITCH TO CHAT TAB IMMEDIATELY
    setActiveTab('chat');

    // Capture prompt and files BEFORE clearing state
    const capturedPrompt = prompt;
    const capturedFiles = [...attachedFiles];

    // Reset Input
    setStatus('planning');
    setProgress(5);
    setStatusMessage('Analyzing Requirements...');
    setPrompt('');
    setAttachedFiles([]);

    // If it's a fresh build, clear previous artifacts
    if (!isModification) {
      setRoadmap([]);
      setFiles({});
      setActiveFile(null);
    }

    // Helper to update the specific AI message in the chat
    const updateAiMessage = (updates: Partial<ChatMessage>) => {
      setChatHistory(prev => prev.map(msg =>
        msg.id === aiMsgId ? { ...msg, ...updates } : msg
      ));
    };

    // PRD Analysis Step (only for fresh builds)
    let pageAnalysis: PageAnalysisItem[] = [];
    let prdColors: PRDColors | null = null;

    if (!isModification) {
      try {
        const analysisResult = await analyzePRD(capturedPrompt, capturedFiles);
        pageAnalysis = analysisResult.pages;
        prdColors = analysisResult.colors;

        if (pageAnalysis.length > 0) {
          updateAiMessage({
            text: `I've analyzed your requirements and identified ${pageAnalysis.length} pages/components to build:`,
            pageAnalysis: pageAnalysis,
            statusPhase: 'planning',
          });

          setProgress(10);
          setStatusMessage('Page analysis complete. Starting generation...');

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            abortController.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(undefined); }, { once: true });
          });
        }
      } catch (analysisError) {
        if (analysisError instanceof DOMException && analysisError.name === 'AbortError') {
          // User stopped during analysis — fall through to completion handler
        } else {
          console.warn("PRD analysis step failed, proceeding with generation:", analysisError);
        }
      }
    }

    // Check abort after analysis phase
    if (abortRef.current) {
      setStatus('completed');
      setStatusMessage('Build Stopped');
      setProgress(0);
      updateAiMessage({ text: 'Build stopped.', isStreaming: false, statusPhase: 'done' });
      return;
    }

    // Build enhanced prompt with page analysis context and colors
    let enhancedPrompt = capturedPrompt;
    if (pageAnalysis.length > 0) {
      const pageListText = pageAnalysis
        .map(p => `- ${p.name} (${p.type}): ${p.description}`)
        .join('\n');
      enhancedPrompt = `${capturedPrompt}\n\nPRE-ANALYZED PAGE STRUCTURE — You MUST generate a separate FILE for EVERY item below (${pageAnalysis.length} files total). Each page must have the same navbar, footer, sidebar, and icons. All pages must link to each other:\n${pageListText}`;
    }
    if (prdColors) {
      const colorEntries = Object.entries(prdColors).filter(([, v]) => v);
      if (colorEntries.length > 0) {
        const colorText = colorEntries.map(([k, v]) => `${k}: ${v}`).join(', ');
        enhancedPrompt += `\n\nCOLOR SCHEME (MUST use these exact colors in the design):\n${colorText}`;
      }
    }

    // Pass existing files if modification, or empty object if fresh
    const currentFilesSnapshot = { ...files };
    // Local accumulator — mirrors React state but readable synchronously
    let buildFiles: Record<string, GeneratedFile> = { ...currentFilesSnapshot };
    // Ensure we have template content
    const dnaContent = selectedTemplate.content || "";

    // Helper: collect all generated file names from the full buffer
    const getGeneratedFileNames = (buffer: string): string[] => {
      if (!buffer.includes("FILE:")) return [];
      return buffer.split("FILE:").slice(1).map(p => p.trim().split("\n")[0].trim()).filter(Boolean);
    };

    // Helper: update page analysis checkmarks based on actual generated files
    const updatePageAnalysisStatus = (generatedFileNames: string[], latestFileName: string) => {
      if (pageAnalysis.length === 0) return;
      const updatedPageAnalysis = pageAnalysis.map((item) => {
        const itemWords = item.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        const isGenerated = generatedFileNames.some(fn => {
          const fnClean = fn.toLowerCase().replace(/\.(atom|molecule|organism|page)?\.html$/, '').replace(/[-_]/g, ' ');
          return itemWords.some(w => w.length > 2 && fnClean.includes(w));
        });
        const isActive = !isGenerated && latestFileName && (() => {
          const fnClean = latestFileName.toLowerCase().replace(/\.(atom|molecule|organism|page)?\.html$/, '').replace(/[-_]/g, ' ');
          return itemWords.some(w => w.length > 2 && fnClean.includes(w));
        })();
        if (isGenerated) return { ...item, status: 'completed' as const };
        if (isActive) return { ...item, status: 'active' as const };
        return { ...item, status: 'pending' as const };
      });
      updateAiMessage({ pageAnalysis: updatedPageAnalysis });
    };

    // Helper: run one streaming generation pass
    const runStreamPass = async (streamPrompt: string, existingFiles: Record<string, GeneratedFile>) => {
      let currentPhase = Object.keys(existingFiles).length > 0 ? 'coding' : 'planning';
      let fullBuffer = "";
      let lastFileCount = 0;

      const stream = generateArchitectureStream(
        streamPrompt,
        dnaContent,
        capturedFiles,
        existingFiles,
        chatHistory,
        abortController.signal
      );

      for await (const chunk of stream) {
        if (abortRef.current) break;
        fullBuffer += chunk;

        // 1. Live Roadmap Parsing
        if (currentPhase === 'planning' && fullBuffer.includes("ROADMAP:")) {
          const roadmapPart = fullBuffer.split("ROADMAP:")[1].split("FILE:")[0];
          const lines = roadmapPart.split("\n")
            .filter(l => l.trim().match(/^[-*]|\d+\./));

          if (lines.length > 0) {
            const newRoadmap = lines.map((line, idx) => ({
              id: Date.now() + idx,
              title: line.replace(/^[-*]|\d+\./, "").trim(),
              description: "Generating layout logic...",
              status: (idx === 0 ? 'active' : 'pending') as RoadmapItem['status']
            } as RoadmapItem));

            setRoadmap(newRoadmap);
            setStatus('coding');
            setStatusMessage('Blueprint Created. Starting Design...');
            setProgress(15);
            currentPhase = 'coding';

            updateAiMessage({
              text: "I've created a plan. Starting implementation:",
              statusPhase: 'coding',
              roadmap: newRoadmap
            });
          }
        }

        // 2. Live File Parsing
        if (fullBuffer.includes("FILE:")) {
          const parts = fullBuffer.split("FILE:");
          const currentFileCount = parts.length - 1;

          for (let i = 1; i < parts.length; i++) {
            const fileBlock = parts[i];
            const lines = fileBlock.trim().split("\n");
            const fileName = lines[0].trim();

            let content = lines.slice(1).join("\n")
              .replace(/^```html/, '')
              .replace(/^```/, '')
              .replace(/```$/, '');

            if (fileName) {
              const fileData = { name: fileName, language: 'html', content: content };
              buildFiles = { ...buildFiles, [fileName]: fileData };
              setFiles(prev => ({ ...prev, [fileName]: fileData }));
              if (i === parts.length - 1) {
                setActiveFile(fileName);
              }
              if (i === parts.length - 1) {
                setStatusMessage(`Designing ${fileName.replace(/\.(atom|molecule|organism|page)\.html$/, '.html')}...`);
              }
            }
          }

          if (currentFileCount > lastFileCount) {
            lastFileCount = currentFileCount;
            const generatedFileNames = parts.slice(1).map(p => p.trim().split("\n")[0].trim()).filter(Boolean);
            const latestFileName = generatedFileNames[generatedFileNames.length - 1] || '';
            updatePageAnalysisStatus(generatedFileNames, latestFileName);

            setRoadmap(prevRoadmap => {
              const completedIdx = currentFileCount - 1;
              const updatedRoadmap = prevRoadmap.map((item, idx) =>
                idx < completedIdx ? { ...item, status: 'completed' as const } :
                (idx === completedIdx ? { ...item, status: 'active' as const } : item)
              );
              updateAiMessage({ roadmap: updatedRoadmap });
              const roadmapCount = prevRoadmap.length || 5;
              const calcProgress = 15 + Math.min(75, (completedIdx / roadmapCount) * 75);
              setProgress(Math.floor(calcProgress));
              return updatedRoadmap as RoadmapItem[];
            });
          }
        }
      }

      return fullBuffer;
    };

    try {
      // --- FIRST PASS ---
      let fullBuffer = await runStreamPass(enhancedPrompt, currentFilesSnapshot);

      // --- AUTO-CONTINUE: keep generating until all pages are built ---
      // Only auto-continue for multi-page projects (4+ pages). For single pages,
      // components, or small requests, the first pass is enough.
      const MIN_PAGES_FOR_AUTOCONTINUE = 4;
      const MAX_CONTINUATIONS = 5;
      let continuationCount = 0;

      while (pageAnalysis.length >= MIN_PAGES_FOR_AUTOCONTINUE && continuationCount < MAX_CONTINUATIONS && !abortRef.current) {
        // Use local accumulator (always in sync, no React batching issues)
        const allFileNames = Object.keys(buildFiles);

        // Check which pages from analysis are still missing
        const missingPages = pageAnalysis.filter(item => {
          const itemWords = item.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
          return !allFileNames.some(fn => {
            const fnClean = fn.toLowerCase().replace(/\.(atom|molecule|organism|page)?\.html$/, '').replace(/[-_]/g, ' ');
            return itemWords.some(w => w.length > 2 && fnClean.includes(w));
          });
        });

        if (missingPages.length === 0) break; // All pages built!

        // If more than half the pages are built, stop — the rest likely have naming mismatches
        if (missingPages.length < pageAnalysis.length * 0.3) break;

        continuationCount++;
        const missingList = missingPages.map(p => `- ${p.name} (${p.type}): ${p.description}`).join('\n');

        updateAiMessage({
          text: `Building remaining ${missingPages.length} pages... (continuation ${continuationCount})`,
          statusPhase: 'coding',
        });
        setStatusMessage(`Continuation ${continuationCount}: ${missingPages.length} pages remaining...`);

        const continuePrompt = `CONTINUE BUILDING. You already generated these files: ${allFileNames.join(', ')}

The following pages are STILL MISSING and MUST be generated now. Generate a separate FILE for each one. Use the EXACT SAME navbar, footer, sidebar, color scheme, and styling as the files already built. All links must work with the existing files.

MISSING PAGES (generate ALL of these NOW):\n${missingList}

IMPORTANT: Do NOT regenerate files that already exist. ONLY generate the missing ones listed above. Start directly with FILE: blocks, no ROADMAP needed.`;

        fullBuffer = await runStreamPass(continuePrompt, { ...buildFiles });
      }

      // --- BUILD COMPLETE (or stopped) ---
      const wasStopped = abortRef.current;
      setStatus('completed');
      setStatusMessage(wasStopped ? 'Build Stopped' : 'Build Finished');
      setProgress(100);

      const finalRoadmap = roadmap.map(item => ({ ...item, status: 'completed' as const } as RoadmapItem));
      if (!wasStopped) setRoadmap(finalRoadmap);

      // Use local accumulator for reliable file reading (avoids React batching issues)
      const finalFiles = { ...buildFiles };

      // POST-PROCESS: Sync navbar/footer across all pages from organism files
      const navbarOrg = Object.keys(finalFiles).find(k => k.toLowerCase().includes('navbar') && k.endsWith('.organism.html'));
      const footerOrg = Object.keys(finalFiles).find(k => k.toLowerCase().includes('footer') && k.endsWith('.organism.html'));
      const sidebarOrg = Object.keys(finalFiles).find(k => k.toLowerCase().includes('sidebar') && k.endsWith('.organism.html'));

      if (navbarOrg || footerOrg || sidebarOrg) {
        // Extract organism markup from their files
        const extractTag = (html: string, tag: string): string | null => {
          const regex = new RegExp(`(<${tag}[\\s>][\\s\\S]*?</${tag}>)`, 'i');
          const match = html.match(regex);
          return match ? match[1] : null;
        };
        const navHtml = navbarOrg ? extractTag(finalFiles[navbarOrg].content, 'nav') : null;
        const footerHtml = footerOrg ? extractTag(finalFiles[footerOrg].content, 'footer') : null;
        const sidebarHtml = sidebarOrg ? extractTag(finalFiles[sidebarOrg].content, 'aside') : null;

        // Replace in all page files
        for (const key of Object.keys(finalFiles)) {
          if (!key.endsWith('.page.html')) continue;
          let content = finalFiles[key].content;
          if (navHtml) {
            content = content.replace(/<nav[\s>][\s\S]*?<\/nav>/i, navHtml);
          }
          if (footerHtml) {
            content = content.replace(/<footer[\s>][\s\S]*?<\/footer>/i, footerHtml);
          }
          if (sidebarHtml) {
            content = content.replace(/<aside[\s>][\s\S]*?<\/aside>/i, sidebarHtml);
          }
          if (content !== finalFiles[key].content) {
            finalFiles[key] = { ...finalFiles[key], content };
          }
        }
        // Sync back to state
        setFiles(finalFiles);
      }

      const finalFileNames = Object.keys(finalFiles);

      // Push completed files to undo/redo history
      pushFilesSnapshot(finalFiles);

      if (pageAnalysis.length > 0) {
        const finalPageAnalysis = pageAnalysis.map(item => {
          const itemWords = item.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
          const isGenerated = finalFileNames.some(fn => {
            const fnClean = fn.toLowerCase().replace(/\.(atom|molecule|organism|page)?\.html$/, '').replace(/[-_]/g, ' ');
            return itemWords.some(w => w.length > 2 && fnClean.includes(w));
          });
          return { ...item, status: isGenerated ? 'completed' as const : 'pending' as const };
        });
        const completedCount = finalPageAnalysis.filter(p => p.status === 'completed').length;
        const statusText = wasStopped
          ? `Build stopped. Generated ${finalFileNames.length} files so far (${completedCount}/${pageAnalysis.length} pages).`
          : `Build complete! Generated ${finalFileNames.length} files (${completedCount}/${pageAnalysis.length} pages matched).`;
        updateAiMessage({
          text: statusText,
          isStreaming: false,
          statusPhase: 'done',
          roadmap: wasStopped ? undefined : finalRoadmap,
          pageAnalysis: finalPageAnalysis
        });
      } else {
        updateAiMessage({
          text: wasStopped ? `Build stopped. Generated ${finalFileNames.length} files so far.` : "Build complete! I've generated the files based on the roadmap.",
          isStreaming: false,
          statusPhase: 'done',
          roadmap: wasStopped ? undefined : finalRoadmap
        });
      }

    } catch (e: any) {
      // If user stopped, handle gracefully (not an error)
      if (abortRef.current || (e instanceof DOMException && e.name === 'AbortError')) {
        setStatus('completed');
        setStatusMessage('Build Stopped');
        setProgress(100);
        const finalFiles = { ...buildFiles };
        const finalFileNames = Object.keys(finalFiles);
        if (finalFileNames.length > 0) pushFilesSnapshot(finalFiles);
        updateAiMessage({
          text: `Build stopped. Generated ${finalFileNames.length} file${finalFileNames.length !== 1 ? 's' : ''} so far.`,
          isStreaming: false,
          statusPhase: 'done'
        });
        return;
      }

      console.error(e);
      setStatusMessage("Generation Failed");
      setStatus('idle');

      const errorMsg = e?.message || JSON.stringify(e);
      let errorText = `I encountered an error: ${errorMsg}`;

      if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        errorText = "⚠️ **Quota Exceeded**: The AI model is currently unavailable due to high usage limits. Please check your billing details or try again later.";
      } else if (errorMsg.includes("503")) {
        errorText = "⚠️ **Service Unavailable**: The AI service is temporarily overloaded. Please try again in a moment.";
      } else if (errorMsg.includes("API_KEY") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED")) {
        errorText = "⚠️ **Invalid API Key**: Your Gemini API key appears to be invalid. Please update GEMINI_API_KEY in .env.local with a valid key from Google AI Studio.";
      } else if (errorMsg.includes("404") || errorMsg.includes("not found")) {
        errorText = `⚠️ **Model Not Found**: The requested model is not available. Error: ${errorMsg}`;
      }

      updateAiMessage({
        text: errorText,
        isStreaming: false,
        statusPhase: 'done'
      });
    }
  };

  const handleDownload = (fileName: string) => {
    const file = files[fileName];
    if (!file) return;
    const blob = new Blob([file.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const handleDownloadProject = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    Object.values(files).forEach(file => {
      zip.file(file.name, file.content);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    a.click();
  };

  const handleCopyCode = async (label: string = 'HTML') => {
    if (!activeFile || !files[activeFile]) return;
    try {
      await navigator.clipboard.writeText(files[activeFile].content);
      const prev = statusMessage;
      setStatusMessage(`Copied ${label} to clipboard!`);
      setTimeout(() => setStatusMessage(prev), 2000);
      setIsExportOpen(false);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const [isCopyingFigma, setIsCopyingFigma] = useState(false);

  const handleCopyAsFigma = async () => {
    if (!activeFile || !files[activeFile]) return;
    setIsCopyingFigma(true);
    const prev = statusMessage;
    setStatusMessage('Generating Figma auto-layout script...');

    const htmlContent = files[activeFile].content;

    // Render HTML in an offscreen iframe for style isolation
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1440px;height:900px;border:none;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) throw new Error('Cannot access iframe document');

      doc.open();
      doc.write(htmlContent);
      doc.close();

      // Wait for content + external resources (fonts, CDN CSS)
      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        setTimeout(resolve, 3000);
      });
      await new Promise(r => setTimeout(r, 500));

      const pageWidth = 1440;
      const pageHeight = doc.body.scrollHeight || 900;
      iframe.style.height = `${pageHeight}px`;

      // Convert rendered DOM → Figma Plugin API script with auto-layout (lazy loaded)
      const { domToFigmaScript } = await import('./utils/domToFigmaSvg');
      const script = domToFigmaScript(doc, pageWidth, pageHeight);

      await navigator.clipboard.writeText(script);

      setStatusMessage('Copied! Open Scripter plugin in Figma → Paste → Run');
      setTimeout(() => setStatusMessage(prev), 4000);
      setIsExportOpen(false);
    } catch (err) {
      console.error('Figma export failed:', err);
      setStatusMessage('Export failed. Try Copy HTML instead.');
      setTimeout(() => setStatusMessage(prev), 3000);
      setIsExportOpen(false);
    } finally {
      document.body.removeChild(iframe);
      setIsCopyingFigma(false);
    }
  };

  // --- DESIGN MODE ---
  const rgbToHex = (rgb: string): string => {
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  };

  const parseNum = (val: string): string => {
    const n = parseFloat(val);
    return isNaN(n) ? '0' : String(Math.round(n * 10) / 10);
  };

  const googleFontsLink = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Roboto:wght@300;400;500;700;900&family=Open+Sans:wght@300;400;500;600;700;800&family=Montserrat:wght@300;400;500;600;700;800;900&family=Poppins:wght@300;400;500;600;700;800;900&family=Lato:wght@300;400;700;900&family=Nunito:wght@300;400;500;600;700;800;900&family=Raleway:wght@300;400;500;600;700;800;900&family=Ubuntu:wght@300;400;500;700&family=Merriweather:wght@300;400;700;900&family=Playfair+Display:wght@400;500;600;700;800;900&family=Source+Sans+3:wght@300;400;500;600;700;800;900&family=PT+Sans:wght@400;700&family=PT+Serif:wght@400;700&family=Noto+Sans:wght@300;400;500;600;700;800;900&family=Work+Sans:wght@300;400;500;600;700;800;900&family=Fira+Sans:wght@300;400;500;600;700;800;900&family=Quicksand:wght@300;400;500;600;700&family=Barlow:wght@300;400;500;600;700;800;900&family=Mulish:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&family=Sora:wght@300;400;500;600;700;800&family=Albert+Sans:wght@300;400;500;600;700;800;900&family=Bricolage+Grotesque:wght@300;400;500;600;700;800&family=Instrument+Serif:wght@400&family=JetBrains+Mono:wght@400;500;600;700&family=Fira+Code:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Newsreader:wght@300;400;500;600;700;800&family=Bitter:wght@300;400;500;600;700;800;900&family=Crimson+Text:wght@400;600;700&family=Lora:wght@400;500;600;700&family=Libre+Baskerville:wght@400;700&family=Oswald:wght@300;400;500;600;700&family=Bebas+Neue&family=Archivo:wght@300;400;500;600;700;800;900&family=Lexend:wght@300;400;500;600;700;800;900&family=Cabin:wght@400;500;600;700&family=Karla:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700;800;900&family=Josefin+Sans:wght@300;400;500;600;700&family=Nunito+Sans:wght@300;400;500;600;700;800;900&family=Titillium+Web:wght@300;400;600;700;900&family=Inconsolata:wght@300;400;500;600;700;800;900&family=Source+Code+Pro:wght@300;400;500;600;700;800;900&family=Overpass:wght@300;400;500;600;700;800;900&family=Figtree:wght@300;400;500;600;700;800;900&family=Geist:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">';

  const designModeScript = `<style id="__dm-css__">.__dm-sel__{outline:2px solid #4f46e5!important;outline-offset:2px!important}.__dm-hov__:not(.__dm-sel__){outline:1px dashed #818cf8!important;outline-offset:1px!important}*{cursor:default!important}img,svg,video,canvas,iframe,input,select,textarea,button,a,span,i,em,strong,b,label,hr,br{pointer-events:auto!important}</style><scr` + `ipt id="__dm-js__">(function(){var sel=null;function getEl(e){var t=e.target;if(!t||t===document.body||t===document.documentElement||t.id==='__dm-css__'||t.id==='__dm-js__')return null;return t;}function getOwnText(el){var t='';for(var i=0;i<el.childNodes.length;i++){if(el.childNodes[i].nodeType===3)t+=el.childNodes[i].textContent;}return t.trim();}function isTextEl(el){var tag=el.tagName.toLowerCase();if(['img','svg','video','canvas','iframe','hr','br','input','select','textarea'].indexOf(tag)>=0)return false;var hasElChild=false;for(var i=0;i<el.childNodes.length;i++){if(el.childNodes[i].nodeType===1){hasElChild=true;break;}}if(!hasElChild)return true;if(getOwnText(el).length>0)return true;return false;}function getAttrs(el){var a={};if(el.src)a.src=el.src;if(el.getAttribute('alt')!==null)a.alt=el.getAttribute('alt')||'';if(el.href)a.href=el.href;return a;}document.addEventListener('mouseover',function(e){var t=getEl(e);if(t)t.classList.add('__dm-hov__');},true);document.addEventListener('mouseout',function(e){var t=getEl(e);if(t)t.classList.remove('__dm-hov__');},true);document.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();var t=getEl(e);if(!t)return;if(sel)sel.classList.remove('__dm-sel__');sel=t;sel.classList.add('__dm-sel__');var cs=getComputedStyle(sel);var cn=typeof sel.className==='string'?sel.className:'';var canEdit=isTextEl(sel);var txt=canEdit?(sel.innerText||sel.textContent||''):(sel.alt||sel.src||sel.textContent||'').substring(0,80);window.parent.postMessage({type:'dm-select',tag:sel.tagName.toLowerCase(),classes:cn.replace(/__dm-(sel|hov)__/g,'').trim(),text:txt,canEditText:canEdit,attrs:getAttrs(sel),styles:{fontFamily:cs.fontFamily,fontSize:cs.fontSize,fontWeight:cs.fontWeight,fontStyle:cs.fontStyle,textDecorationLine:cs.textDecorationLine||cs.textDecoration,textTransform:cs.textTransform,lineHeight:cs.lineHeight,letterSpacing:cs.letterSpacing,color:cs.color,backgroundColor:cs.backgroundColor,borderTopWidth:cs.borderTopWidth,borderTopStyle:cs.borderTopStyle,borderTopColor:cs.borderTopColor,borderRadius:cs.borderRadius,paddingTop:cs.paddingTop,paddingRight:cs.paddingRight,paddingBottom:cs.paddingBottom,paddingLeft:cs.paddingLeft,marginTop:cs.marginTop,marginRight:cs.marginRight,marginBottom:cs.marginBottom,marginLeft:cs.marginLeft,width:cs.width,height:cs.height,minWidth:cs.minWidth,maxWidth:cs.maxWidth,minHeight:cs.minHeight,maxHeight:cs.maxHeight,display:cs.display,position:cs.position,top:cs.top,right:cs.right,bottom:cs.bottom,left:cs.left,zIndex:cs.zIndex,overflow:cs.overflow,visibility:cs.visibility,flexDirection:cs.flexDirection,flexWrap:cs.flexWrap,justifyContent:cs.justifyContent,alignItems:cs.alignItems,alignSelf:cs.alignSelf,gap:cs.gap,flexGrow:cs.flexGrow,flexShrink:cs.flexShrink,flexBasis:cs.flexBasis,order:cs.order,gridTemplateColumns:cs.gridTemplateColumns,gridTemplateRows:cs.gridTemplateRows,opacity:cs.opacity,boxShadow:cs.boxShadow,transform:cs.transform,cursor:cs.cursor,transition:cs.transition,objectFit:cs.objectFit,textAlign:cs.textAlign,verticalAlign:cs.verticalAlign}},'*');},true);window.addEventListener('message',function(e){if(!e.data)return;if(e.data.type==='dm-get-icons'){var icons=document.querySelectorAll('iconify-icon');var names={};for(var j=0;j<icons.length;j++){var ic=icons[j].getAttribute('icon');if(ic){var p=ic.split(':');if(p.length===2)names[p[1]]=1;}}window.parent.postMessage({type:'dm-icons-list',names:Object.keys(names),prefix:icons.length>0&&icons[0].getAttribute('icon')?icons[0].getAttribute('icon').split(':')[0]:'lucide'},'*');return;}if(e.data.type==='dm-swap-icons-mapped'){var lib=e.data.library;var map=e.data.mapping||{};var icons=document.querySelectorAll('iconify-icon');for(var j=0;j<icons.length;j++){var ic=icons[j].getAttribute('icon');if(ic){var p=ic.split(':');if(p.length===2){var newName=map[p[1]]||p[1];icons[j].setAttribute('icon',lib+':'+newName);}}}window.parent.postMessage({type:'dm-icons-swapped',library:lib,count:icons.length},'*');return;}if(e.data.type==='dm-replace-selected'&&sel){var tmp=document.createElement('div');tmp.innerHTML=e.data.html;var newEl=tmp.firstElementChild||tmp;if(tmp.firstElementChild){sel.replaceWith(tmp.firstElementChild);sel=tmp.firstElementChild;sel.classList.add('__dm-sel__');}else{sel.innerHTML=e.data.html;}window.parent.postMessage({type:'dm-replace-done'},'*');return;}if(!sel)return;if(e.data.type==='dm-set-style'){sel.style[e.data.prop]=e.data.val;var cs2=getComputedStyle(sel);window.parent.postMessage({type:'dm-style-updated',prop:e.data.prop,computed:cs2[e.data.prop]},'*');}if(e.data.type==='dm-set-text'){sel.innerText=e.data.val;}if(e.data.type==='dm-set-attr'){sel.setAttribute(e.data.attr,e.data.val);if(e.data.attr==='src'&&sel.tagName==='IMG')sel.src=e.data.val;}});if(!document.querySelector('script[src*="iconify-icon"]')){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/iconify-icon@2.3.0/dist/iconify-icon.min.js';document.head.appendChild(s);}var _ii=document.querySelectorAll('iconify-icon');var _dl='lucide';if(_ii.length>0){var _ic=_ii[0].getAttribute('icon');if(_ic){var _p=_ic.split(':');if(_p.length===2)_dl=_p[0];}}window.parent.postMessage({type:'dm-icon-library-detected',library:_dl,count:_ii.length},'*');})();</scr` + `ipt>`;

  const navScript = `<script>document.addEventListener('click', function(e) {
  var anchor = e.target.closest('a');
  if (anchor && anchor.getAttribute('href')) {
    var href = anchor.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      e.preventDefault();
      var fileName = href.split('/').pop().split('?')[0].split('#')[0];
      window.parent.postMessage({ type: 'navigate', file: fileName }, '*');
    }
  }
});</script>`;

  const extractIframeHtml = (): string | null => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentDocument) return null;
    const doc = iframe.contentDocument;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('#__dm-css__, #__dm-js__').forEach(el => el.remove());
    clone.querySelectorAll('.__dm-sel__, .__dm-hov__').forEach(el => {
      el.classList.remove('__dm-sel__', '__dm-hov__');
      if (el.getAttribute('class') === '') el.removeAttribute('class');
    });
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  };

  const triggerDesignAutoSave = () => {
    designDirtyRef.current = true;
    if (designAutoSaveRef.current) clearTimeout(designAutoSaveRef.current);
    designAutoSaveRef.current = setTimeout(() => {
      designAutoSaveRef.current = null;
      const currentFile = activeFileRef.current;
      if (!currentFile || !designDirtyRef.current) return;
      const html = extractIframeHtml();
      if (!html) return;
      designDirtyRef.current = false;
      pushFilesSnapshot({ ...filesRef.current });
      setFiles(prev => ({ ...prev, [currentFile]: { ...prev[currentFile], content: html } }));
    }, 600);
  };

  const updateElementStyle = (property: string, value: string) => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'dm-set-style', prop: property, val: value }, '*');
    setSelectedElement(prev => prev ? { ...prev, styles: { ...prev.styles, [property]: value } } : null);
    triggerDesignAutoSave();
  };

  const handleIconLibraryChange = async (newLibrary: string) => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;
    setActiveIconLibrary(newLibrary);
    setIconMappingLoading(true);

    // Step 1: Collect all unique icon names from the iframe
    const iconNames = await new Promise<string[]>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'dm-icons-list') {
          window.removeEventListener('message', handler);
          resolve(e.data.names || []);
        }
      };
      window.addEventListener('message', handler);
      iframe.contentWindow!.postMessage({ type: 'dm-get-icons' }, '*');
      // Timeout fallback
      setTimeout(() => { window.removeEventListener('message', handler); resolve([]); }, 3000);
    });

    // Step 2: Get current prefix from detection
    const currentPrefix = activeIconLibrary;

    // Step 3: Call AI to map icon names to the new library
    let mapping: Record<string, string> = {};
    if (iconNames.length > 0) {
      try {
        mapping = await mapIconNames(iconNames, currentPrefix, newLibrary);
      } catch {
        // Fallback: empty mapping means direct prefix swap (name stays the same)
        mapping = {};
      }
    }

    // Step 4: Apply the mapping in the iframe
    iframe.contentWindow!.postMessage({ type: 'dm-swap-icons-mapped', library: newLibrary, mapping }, '*');
    setIconMappingLoading(false);
    triggerDesignAutoSave();
  };

  const updateElementText = (value: string) => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'dm-set-text', val: value }, '*');
    setSelectedElement(prev => prev ? { ...prev, text: value } : null);
    triggerDesignAutoSave();
  };

  const updateElementAttr = (attr: string, value: string) => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'dm-set-attr', attr, val: value }, '*');
    setSelectedElement(prev => prev ? { ...prev, attrs: { ...prev.attrs, [attr]: value } } : null);
    triggerDesignAutoSave();
  };

  const handleAIEdit = async () => {
    if (!aiEditPrompt.trim() || !activeFile || !files[activeFile] || aiEditLoading) return;
    setAiEditLoading(true);
    const instruction = aiEditPrompt.trim();
    const elementTag = selectedElement ? `<${selectedElement.tag}${selectedElement.classes ? '.' + selectedElement.classes.split(' ')[0] : ''}>` : '';
    setAiEditPrompt('');

    // Add user message to chat
    const userMsg: ChatMessage = {
      id: `de-u-${Date.now()}`,
      role: 'user',
      text: elementTag ? `[Design Edit on \`${elementTag}\` in ${activeFile}] ${instruction}` : `[Design Edit on ${activeFile}] ${instruction}`,
      timestamp: Date.now()
    };
    const aiMsg: ChatMessage = {
      id: `de-a-${Date.now()}`,
      role: 'ai',
      text: 'Applying design edit...',
      timestamp: Date.now(),
      isStreaming: true,
      statusPhase: 'coding'
    };
    setChatHistory(prev => [...prev, userMsg, aiMsg]);

    try {
      const currentHtml = designMode ? (extractIframeHtml() || files[activeFile].content) : files[activeFile].content;
      let selectedHtml: string | undefined;
      const iframe = previewIframeRef.current;
      if (selectedElement && iframe?.contentDocument) {
        const sel = iframe.contentDocument.querySelector('.__dm-sel__');
        if (sel) selectedHtml = sel.outerHTML;
      }

      // Fast path: element-scoped edit (sends only the element, not full page)
      if (selectedHtml && designMode && iframe?.contentWindow) {
        // Extract a small style context snippet (first 200 chars of <style> tags)
        const styleMatch = currentHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        const styleContext = styleMatch ? styleMatch.map(s => s.substring(0, 300)).join('\n') : '';

        const newElementHtml = await editElementWithAI(selectedHtml, instruction, styleContext);
        pushFilesSnapshot({ ...filesRef.current });
        // Replace element in iframe via postMessage
        iframe.contentWindow.postMessage({ type: 'dm-replace-selected', html: newElementHtml }, '*');
        // Wait briefly for DOM update, then extract full HTML
        await new Promise(r => setTimeout(r, 100));
        const updatedHtml = extractIframeHtml() || currentHtml;
        setFiles(prev => ({ ...prev, [activeFile]: { ...prev[activeFile], content: updatedHtml } }));
      } else {
        // Fallback: full-page edit (no element selected or not in design mode)
        const newHtml = await editWithAI(currentHtml, instruction, selectedHtml);
        pushFilesSnapshot({ ...filesRef.current });
        setFiles(prev => ({ ...prev, [activeFile]: { ...prev[activeFile], content: newHtml } }));
        if (designMode) {
          setDesignSrcDoc(newHtml);
          setSelectedElement(null);
        }
      }
      // Update AI message as completed
      setChatHistory(prev => prev.map(msg => msg.id === aiMsg.id ? { ...msg, text: `Applied design edit to \`${activeFile}\`: ${instruction}`, isStreaming: false, statusPhase: 'done' as const } : msg));
    } catch (err) {
      console.error('AI edit failed:', err);
      setChatHistory(prev => prev.map(msg => msg.id === aiMsg.id ? { ...msg, text: `Design edit failed: ${err instanceof Error ? err.message : 'Unknown error'}`, isStreaming: false, statusPhase: 'done' as const } : msg));
    } finally {
      setAiEditLoading(false);
    }
  };

  const getUnsplashKey = () => localStorage.getItem('unsplash_access_key') || process.env.UNSPLASH_ACCESS_KEY || '';

  const searchUnsplash = async (query: string) => {
    if (!query.trim()) return;
    const key = getUnsplashKey();
    if (!key) return;
    setUnsplashLoading(true);
    try {
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&client_id=${key}`);
      if (!res.ok) throw new Error('Unsplash API error');
      const data = await res.json();
      setUnsplashResults((data.results || []).map((r: any) => ({
        id: r.id,
        thumb: r.urls?.thumb || r.urls?.small,
        regular: r.urls?.regular || r.urls?.small,
        alt: r.alt_description || r.description || query,
        user: r.user?.name || 'Unknown'
      })));
    } catch (err) {
      console.warn('Unsplash search failed:', err);
      setUnsplashResults([]);
    } finally {
      setUnsplashLoading(false);
    }
  };

  const saveDesignChanges = () => {
    if (designAutoSaveRef.current) {
      clearTimeout(designAutoSaveRef.current);
      designAutoSaveRef.current = null;
    }
    if (!designDirtyRef.current || !activeFile) return;
    const html = extractIframeHtml();
    if (!html) return;
    designDirtyRef.current = false;
    pushFilesSnapshot({ ...files });
    setFiles(prev => ({ ...prev, [activeFile]: { ...prev[activeFile], content: html } }));
  };

  const exitDesignMode = () => {
    if (designMode) saveDesignChanges();
    if (designAutoSaveRef.current) {
      clearTimeout(designAutoSaveRef.current);
      designAutoSaveRef.current = null;
    }
    setDesignMode(false);
    setDesignSrcDoc(null);
    setSelectedElement(null);
    setActiveIconLibrary('lucide');
    designDirtyRef.current = false;
  };

  const handleFullView = () => {
    if (!activeFile || !files[activeFile]) return;

    const allFileNames = Object.keys(files);
    const pageFileNames = allFileNames.filter(n => n.endsWith('.page.html'));
    const initialFile = (pageFileNames.length > 0 && !activeFile.endsWith('.page.html'))
      ? pageFileNames[0] : activeFile;

    // Build a self-contained HTML page with all files embedded (no localStorage needed)
    const allFileData: Record<string, string> = {};
    (Object.values(files) as GeneratedFile[]).forEach(f => { allFileData[f.name] = f.content; });
    const title = chatHistory[0]?.text?.slice(0, 50) || 'Prototype';
    const escapedFiles = JSON.stringify(allFileData).replace(/<\/script>/gi, '<\\/script>');
    const escapedInitial = initialFile.replace(/'/g, "\\'");
    const escapedTitle = title.replace(/'/g, "\\'");
    const fontsLink = googleFontsLink.replace(/"/g, '&quot;');

    const viewerHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff}iframe{width:100%;height:100vh;border:none;display:block}</style>
</head><body>
<iframe id="pv" sandbox="allow-scripts allow-same-origin"></iframe>
<script>
var F=${escapedFiles};
var cur='${escapedInitial}';
var fonts='${fontsLink}';
var navJs='<scr'+'ipt>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a&&a.getAttribute("href")){var h=a.getAttribute("href");if(h&&!h.startsWith("http")&&!h.startsWith("#")&&!h.startsWith("mailto:")&&!h.startsWith("tel:")){e.preventDefault();var f=h.split("/").pop().split("?")[0].split("#")[0];window.parent.postMessage({type:"fv-nav",file:f},"*");}}});<\\/scr'+'ipt>';
function load(name){
  if(!F[name])return;
  cur=name;
  document.title='${escapedTitle} — '+name.replace('.page.html','');
  document.getElementById('pv').srcdoc=fonts+F[name]+navJs;
}
load(cur);
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='fv-nav'&&e.data.file&&F[e.data.file])load(e.data.file);
});
</script></body></html>`;

    const blob = new Blob([viewerHtml], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  // --- COMPONENT: INPUT FORM (Refactored for reuse) ---
  const renderInputForm = (isCompact: boolean) => (
    <div className={`flex flex-col gap-2`}>
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3 border-b border-slate-100 mb-2">
          {attachedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 animate-in slide-in-from-bottom-2">
              {file.type.includes('image') ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              <span className="max-w-[100px] truncate">{file.name}</span>
              <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500 ml-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center gap-2 ${isCompact ? '' : 'px-3'}`}>
        <div className={`flex gap-1 ${isCompact ? '' : 'border-r border-slate-200 pr-3'}`}>
          <label className="p-2 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer hover:bg-indigo-50 rounded-lg">
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            <ImageIcon className="w-5 h-5" />
          </label>
          <label className="p-2 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer hover:bg-indigo-50 rounded-lg">
            <input type="file" accept=".pdf,.md,.txt,.html" className="hidden" onChange={handleFileUpload} />
            <Paperclip className="w-5 h-5" />
          </label>
        </div>

        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && startBuild()}
          placeholder={isCompact ? "Type a message..." : (Object.keys(files).length > 0 ? "Describe changes..." : "Describe your app...")}
          className={`flex-1 bg-transparent border-none focus:ring-0 text-slate-700 text-sm font-medium outline-none placeholder-slate-400 ${isCompact ? 'py-2' : 'py-3'}`}
          disabled={status === 'planning' || status === 'coding'}
        />

        {status === 'planning' || status === 'coding' ? (
          <button
            onClick={handleStop}
            className={`flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold shadow-xl shadow-red-200 transition-all transform hover:scale-105 ${isCompact ? 'p-2 rounded-xl' : 'px-6 py-3 rounded-2xl text-sm'}`}
          >
            {!isCompact && <span>Stop</span>}
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={startBuild}
            disabled={!prompt}
            className={`flex items-center gap-2 bg-gradient-to-r from-indigo-400 to-indigo-600 hover:from-indigo-500 hover:to-indigo-700 text-white font-bold shadow-xl shadow-indigo-200 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${isCompact ? 'p-2 rounded-xl' : 'px-6 py-3 rounded-2xl text-sm'}`}
          >
            {(!isCompact || Object.keys(files).length > 0) && <span className={isCompact ? 'hidden' : ''}>{Object.keys(files).length > 0 ? "Update" : "Build"}</span>}
            <Play className="w-4 h-4 fill-current" />
          </button>
        )}
      </div>
    </div>
  );

  // --- RENDER: SHARED VIEW (Full-screen prototype for share links) ---
  if (sharedView) {
    const sharedFiles = sharedView.files;
    const currentFile = sharedView.activePage;

    const sharedNavScript = `<script>document.addEventListener('click', function(e) {
      var anchor = e.target.closest('a');
      if (anchor && anchor.getAttribute('href')) {
        var href = anchor.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          e.preventDefault();
          var fileName = href.split('/').pop().split('?')[0].split('#')[0];
          window.parent.postMessage({ type: 'shared-navigate', file: fileName }, '*');
        }
      }
    });</script>`;

    // Listen for navigation inside shared view & update URL
    React.useEffect(() => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'shared-navigate' && e.data?.file && sharedFiles[e.data.file]) {
          const newPage = e.data.file;
          setSharedView(prev => prev ? { ...prev, activePage: newPage } : prev);
          const newHash = `#/${sharedView.compressed}/fullview/${encodeURIComponent(newPage)}`;
          window.history.replaceState(null, '', newHash);
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, [sharedFiles, sharedView.compressed]);

    return (
      <div className="h-screen w-full flex flex-col bg-white overflow-hidden font-sans">
        <div className="flex-1 min-h-0 relative">
          {currentFile && sharedFiles[currentFile] ? (
            <iframe
              title="shared-preview"
              srcDoc={googleFontsLink + sharedFiles[currentFile].content + sharedNavScript}
              className="absolute inset-0 w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <div className="text-center">
                <Loader className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading shared project...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER: LANDING PAGE ---
  if (step === 'landing') {
    const features = [
      { icon: <Sparkles className="w-6 h-6" />, title: 'AI-Powered Generation', desc: 'Describe your app in plain language. Gemini AI generates complete multi-page HTML with proper routing, responsive layouts, and production-ready code.' },
      { icon: <PenTool className="w-6 h-6" />, title: 'Visual Design Mode', desc: 'Click any element to edit fonts, colors, spacing, borders, and layout — all in a live visual editor with real-time preview.' },
      { icon: <Component className="w-6 h-6" />, title: 'Atomic Design System', desc: 'Every project is organized into Atoms, Molecules, Organisms, and Pages — a scalable architecture used by top design teams.' },
      { icon: <Play className="w-6 h-6" />, title: 'Instant Prototype', desc: 'Preview your entire app with working page-to-page navigation, smooth transitions, and a full-screen prototype mode.' },
      { icon: <Share2 className="w-6 h-6" />, title: 'Share Anywhere', desc: 'Generate a single compressed URL that contains your entire project. Anyone can view the live prototype — no server needed.' },
      { icon: <Palette className="w-6 h-6" />, title: 'Icon Library Swap', desc: 'Switch between 10+ icon libraries (Lucide, Material, Heroicons, Phosphor) with AI-powered name mapping across the entire page.' },
    ];
    const steps = [
      { num: '01', title: 'Choose Design DNA', desc: 'Pick a template that defines your visual language — colors, fonts, spacing, and component style.', icon: <LayoutTemplate className="w-8 h-8" /> },
      { num: '02', title: 'Describe Your App', desc: 'Type a prompt, paste a PRD, or attach wireframes. The AI understands what you need.', icon: <MessageSquare className="w-8 h-8" /> },
      { num: '03', title: 'Get Full Prototype', desc: 'Watch as the AI generates every page with routing, then tweak anything in design mode.', icon: <Code2 className="w-8 h-8" /> },
    ];

    return (
      <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden">
        {/* ===== NAVBAR ===== */}
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <span className="font-bold text-lg tracking-tight">AI Architect Studio</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
              <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">How It Works</a>
              <a href="#templates" className="hover:text-indigo-600 transition-colors">Templates</a>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { setStep('studio'); setActiveTab('history'); }} className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors">
                <History className="w-4 h-4" /> History
              </button>
              <button onClick={() => setStep('selection')} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all hover:shadow-xl hover:-translate-y-0.5">
                Start Building <ArrowRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        </nav>

        {/* ===== HERO ===== */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl" />
          <div className="relative max-w-7xl mx-auto px-4 md:px-8 pt-20 md:pt-32 pb-20 md:pb-36">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Zap className="w-3.5 h-3.5" /> Powered by Gemini AI
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                Design Full-Stack Apps
                <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent"> with AI</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                Describe your app, pick a design style, and watch AI generate a complete multi-page prototype with routing, animations, and pixel-perfect design.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <button onClick={() => setStep('selection')} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-indigo-200 transition-all hover:shadow-2xl hover:-translate-y-0.5 text-base flex items-center gap-2">
                  Start Building <ArrowRight className="w-5 h-5" />
                </button>
                <a href="#how-it-works" className="px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md text-base flex items-center gap-2">
                  See How It Works <ChevronDown className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Hero Visual — CSS-illustrated studio mockup */}
            <div className="mt-16 md:mt-24 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
              <div className="rounded-2xl border border-slate-200 shadow-2xl shadow-slate-200/50 bg-white overflow-hidden">
                {/* Fake browser chrome */}
                <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center px-4 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <div className="w-3 h-3 rounded-full bg-green-400/80" />
                  </div>
                  <div className="flex-1 mx-4 h-6 bg-white rounded-md border border-slate-200 flex items-center px-3">
                    <span className="text-[10px] text-slate-400 font-mono">ai-architect.studio</span>
                  </div>
                </div>
                {/* Fake studio layout */}
                <div className="flex h-[280px] md:h-[400px]">
                  {/* Sidebar mock */}
                  <div className="w-16 bg-slate-50 border-r border-slate-100 flex flex-col items-center pt-4 gap-4 shrink-0 hidden sm:flex">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg" />
                    <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                    <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                    <div className="w-8 h-8 bg-slate-200 rounded-lg" />
                  </div>
                  {/* Chat panel mock */}
                  <div className="w-1/3 border-r border-slate-100 p-4 flex flex-col gap-3 hidden md:flex">
                    <div className="h-3 w-24 bg-slate-200 rounded-full" />
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="self-end bg-indigo-100 rounded-xl px-3 py-2 max-w-[80%]">
                        <div className="h-2 w-32 bg-indigo-300/50 rounded-full" />
                        <div className="h-2 w-20 bg-indigo-300/50 rounded-full mt-1.5" />
                      </div>
                      <div className="self-start bg-slate-100 rounded-xl px-3 py-2 max-w-[80%]">
                        <div className="h-2 w-28 bg-slate-300 rounded-full" />
                        <div className="h-2 w-36 bg-slate-300 rounded-full mt-1.5" />
                        <div className="h-2 w-16 bg-slate-300 rounded-full mt-1.5" />
                      </div>
                    </div>
                    <div className="h-10 bg-slate-100 rounded-xl border border-slate-200" />
                  </div>
                  {/* Preview panel mock */}
                  <div className="flex-1 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6 flex flex-col gap-3">
                    <div className="flex gap-2 mb-2">
                      <div className="h-6 w-20 bg-indigo-600 rounded-md" />
                      <div className="h-6 w-16 bg-slate-200 rounded-md" />
                      <div className="h-6 w-16 bg-slate-200 rounded-md" />
                    </div>
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2">
                      <div className="h-4 w-40 bg-slate-200 rounded" />
                      <div className="h-3 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-3/4 bg-slate-100 rounded" />
                      <div className="flex gap-2 mt-2">
                        <div className="h-20 flex-1 bg-indigo-100 rounded-lg" />
                        <div className="h-20 flex-1 bg-purple-100 rounded-lg" />
                        <div className="h-20 flex-1 bg-emerald-100 rounded-lg hidden sm:block" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section id="features" className="py-20 md:py-32 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Everything You Need to Build</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">From AI generation to visual editing — a complete design-to-prototype workflow.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    {f.icon}
                  </div>
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="py-20 md:py-32 bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold mb-4">How It Works</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">Three simple steps from idea to interactive prototype.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              {steps.map((s, i) => (
                <div key={i} className="relative text-center group">
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-14 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-indigo-200 to-transparent" />
                  )}
                  <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:from-indigo-600 group-hover:to-purple-600 group-hover:text-white transition-all duration-300 shadow-lg shadow-indigo-100 group-hover:shadow-indigo-300">
                    {s.icon}
                  </div>
                  <div className="text-xs font-bold text-indigo-600 mb-2 tracking-wider">{s.num}</div>
                  <h3 className="font-bold text-xl mb-3">{s.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== TEMPLATES SHOWCASE ===== */}
        <section id="templates" className="py-20 md:py-32 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Design DNA Templates</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">Start with a curated design system. Each template defines the visual language the AI follows.</p>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin snap-x snap-mandatory">
              {PRESET_TEMPLATES.slice(0, 6).map((tmpl, idx) => (
                <div key={idx} className="snap-start shrink-0 w-[280px] md:w-[320px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer" onClick={() => setStep('selection')}>
                  <div className="h-48 overflow-hidden relative bg-slate-50">
                    <TemplateThumbnail template={tmpl} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="p-4">
                    <h4 className="font-bold text-sm mb-1">{tmpl.name}</h4>
                    <p className="text-xs text-slate-500 line-clamp-2">{tmpl.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <button onClick={() => setStep('selection')} className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 shadow-sm transition-all hover:shadow-md text-sm inline-flex items-center gap-2">
                View All Templates <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ===== CTA SECTION ===== */}
        <section className="py-20 md:py-28 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-4xl mx-auto text-center px-4 md:px-8">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">Ready to Build Something Amazing?</h2>
            <p className="text-indigo-200 text-lg mb-10 max-w-xl mx-auto">Go from idea to interactive prototype in minutes, not weeks. No coding required.</p>
            <button onClick={() => setStep('selection')} className="px-10 py-4 bg-white hover:bg-slate-50 text-indigo-700 font-bold rounded-2xl shadow-2xl shadow-indigo-900/30 transition-all hover:shadow-3xl hover:-translate-y-0.5 text-lg inline-flex items-center gap-2">
              Start Building for Free <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="py-12 bg-slate-900 text-slate-400">
          <div className="max-w-7xl mx-auto px-4 md:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="font-bold text-white">AI Architect Studio</span>
              </div>
              <p className="text-sm text-center md:text-left">Built with Gemini AI. Design, prototype, and ship — all from a single prompt.</p>
              <div className="flex items-center gap-4 text-sm">
                <a href="#features" className="hover:text-white transition-colors">Features</a>
                <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
                <a href="#templates" className="hover:text-white transition-colors">Templates</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // --- RENDER: STEP 1 (TEMPLATE SELECTION) ---
  if (step === 'selection') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="h-16 md:h-20 bg-white border-b border-slate-100 flex items-center px-4 md:px-8 lg:px-12 justify-between">
          <button onClick={() => setStep('landing')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-base md:text-xl font-bold tracking-tight">AI Architect Studio</h1>
          </button>
          <button
            onClick={() => { setStep('studio'); setActiveTab('history'); }}
            className="text-slate-500 hover:text-indigo-600 font-medium text-sm flex items-center gap-2"
          >
            <History className="w-4 h-4" /> History
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 md:p-8 overflow-y-auto animate-in fade-in duration-500">
          <div className="max-w-6xl w-full">
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-slate-900 mb-2 md:mb-4">Choose Your Foundation</h2>
              <p className="text-slate-500 text-sm md:text-lg max-w-2xl mx-auto">
                Select a Design DNA to guide the AI's architectural decisions.
              </p>
              <div className="mt-6 max-w-md mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 shadow-sm transition-all"
                />
                {templateSearch && (
                  <button onClick={() => setTemplateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
              {/* Upload Card */}
              <div
                onClick={() => document.getElementById('template-upload-landing')?.click()}
                className="group relative cursor-pointer h-44 md:h-64 rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center text-center gap-2 md:gap-4 shadow-sm hover:shadow-md"
              >
                <div className="w-10 h-10 md:w-16 md:h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <Upload className="w-5 h-5 md:w-8 md:h-8" />
                </div>
                <div>
                  <h3 className="text-sm md:text-lg font-bold text-slate-800">Upload Custom DNA</h3>
                  <p className="text-xs md:text-sm text-slate-400 mt-1 px-2 md:px-4 hidden sm:block">Import your own HTML/CSS structure</p>
                </div>
                <input
                  type="file"
                  id="template-upload-landing"
                  className="hidden"
                  accept=".html"
                  onChange={handleTemplateUpload}
                />
              </div>

              {/* Presets */}
              {PRESET_TEMPLATES.filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.description.toLowerCase().includes(templateSearch.toLowerCase())).map((tmpl, idx) => (
                <div
                  key={idx}
                  className="group relative cursor-default h-44 md:h-64 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-500/50 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute top-0 left-0 right-0 h-20 md:h-32 bg-slate-100 border-b border-slate-100 flex items-center justify-center group-hover:bg-indigo-50/50 transition-colors">
                    <div className="w-full h-full relative overflow-hidden">
                      <TemplateThumbnail template={tmpl} />
                    </div>
                    {/* Hover overlay with buttons */}
                    <div className="absolute inset-0 z-30 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                      {tmpl.path && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewTemplate(tmpl); }}
                          className="px-4 py-2 bg-white text-slate-700 rounded-xl text-xs font-bold shadow-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTemplateSelect(tmpl); }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                      >
                        {isLoadingTemplate && selectedTemplate.name === tmpl.name ? (
                          <><Loader className="w-3.5 h-3.5 animate-spin" /> Loading</>
                        ) : (
                          <><Play className="w-3.5 h-3.5 fill-current" /> Use This</>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3 md:p-6 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-50">
                    <h3 className="text-xs md:text-lg font-bold text-slate-800 group-hover:text-indigo-700 transition-colors truncate">{tmpl.name}</h3>
                    <p className="text-[10px] md:text-sm text-slate-500 mt-0.5 md:mt-2 line-clamp-1 md:line-clamp-2">{tmpl.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Template Preview — Full Page */}
        {previewTemplate && (
          <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Slim Top Bar */}
            <div className="flex items-center justify-between px-3 md:px-5 py-3 border-b border-slate-200 shrink-0 bg-white">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{previewTemplate.name}</h3>
                  <p className="text-xs text-slate-500 truncate">{previewTemplate.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { handleTemplateSelect(previewTemplate); setPreviewTemplate(null); }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Use This Template
                </button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Full Page iframe */}
            <div className="flex-1 min-h-0 relative">
              {previewTemplate.path ? (
                <iframe
                  src={previewTemplate.path}
                  className="absolute inset-0 w-full h-full border-none"
                  title={`Preview: ${previewTemplate.name}`}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <p className="text-sm">No preview available for custom templates</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER: STEP 2 (STUDIO WORKSPACE) ---
  return (
    <div className="flex h-screen w-full bg-white text-slate-900 overflow-hidden font-sans">

      {/* Sidebar: Primary Navigation */}
      <aside className="hidden md:flex w-20 bg-white border-r border-slate-100 flex-col items-center py-6 gap-8 z-50">
        <div
          onClick={() => setStep('selection')}
          className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-600 cursor-pointer transition-all"
          title="Back to Template Selection"
        >
          <ChevronLeft className="w-5 h-5" />
        </div>

        <nav className="flex flex-col gap-5">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="p-3 rounded-2xl transition-all text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
            title="New Chat"
          >
            <Plus className="w-6 h-6" />
          </button>

          {/* Primary Tab: Chat */}
          <button
            onClick={() => setActiveTab('chat')}
            className={`p-3 rounded-2xl transition-all ${activeTab === 'chat' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
            title="AI Chat & Build"
          >
            <MessageSquare className="w-6 h-6" />
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`p-3 rounded-2xl transition-all ${activeTab === 'templates' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
            title="Design DNA"
          >
            <Layout className="w-6 h-6" />
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`p-3 rounded-2xl transition-all ${activeTab === 'history' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
            title="History"
          >
            <History className="w-6 h-6" />
          </button>
        </nav>

        <div className="mt-auto">
          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer">
            <span className="font-bold text-xs text-slate-500">AH</span>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar: Secondary (Contextual) */}
      <aside className={`${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative inset-y-0 left-0 w-[85vw] max-w-[360px] md:w-80 bg-white border-r border-slate-100 flex flex-col z-50 md:z-40 transition-transform duration-300 ease-in-out`}>

        {/* Chat Tab (NOW PRIMARY) */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full animate-in slide-in-from-left-4 fade-in duration-300">
            <div className="p-4 md:p-6 border-b border-slate-50 bg-white z-10 sticky top-0 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-500" /> Architect Chat
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={handleNewChat} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> New
                </button>
                <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Show Active Task in Chat Header */}
            {(status === 'planning' || status === 'coding') && (
              <div className="px-6 pt-3 pb-0">
                <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-1">
                  <Loader className="w-3 h-3 text-indigo-600 animate-spin flex-shrink-0" />
                  <div className="overflow-hidden min-w-0 flex-1">
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                      {currentTask ? 'Current Task' : 'System Status'}
                    </p>
                    <p className="text-xs text-indigo-700 truncate font-medium">
                      {currentTask ? currentTask.title : statusMessage}
                    </p>
                  </div>
                  <button
                    onClick={handleStop}
                    className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-md transition-colors shrink-0 flex items-center gap-1"
                    title="Stop generation"
                  >
                    <X className="w-3 h-3" /> Stop
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {chatHistory.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <p className="text-xs">Describe your app to start building.</p>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-200' : 'bg-indigo-100 text-indigo-600'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4 text-slate-500" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Bubble Content */}
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed max-w-[90%] shadow-sm ${msg.role === 'user' ? 'bg-slate-100 text-slate-700 rounded-tr-none' : 'bg-white border border-slate-100 text-slate-600 rounded-tl-none'}`}>

                      {/* Message Text */}
                      <div className="mb-2 font-medium whitespace-pre-wrap break-words">{msg.text}</div>

                      {/* Render Page Analysis list if present */}
                      {msg.role === 'ai' && msg.pageAnalysis && msg.pageAnalysis.length > 0 && (() => {
                        const pages = msg.pageAnalysis.filter(p => p.type === 'page');
                        const subpages = msg.pageAnalysis.filter(p => p.type === 'subpage');
                        const modals = msg.pageAnalysis.filter(p => p.type === 'modal');
                        const components = msg.pageAnalysis.filter(p => p.type === 'component');

                        const completedCount = msg.pageAnalysis.filter(p => p.status === 'completed').length;
                        const totalCount = msg.pageAnalysis.length;

                        const groups = [
                          { label: 'Pages', items: pages, icon: <PanelTop className="w-3 h-3" />, cls: 'text-indigo-500' },
                          { label: 'Sub-pages', items: subpages, icon: <Workflow className="w-3 h-3" />, cls: 'text-amber-500' },
                          { label: 'Modals', items: modals, icon: <PanelTopOpen className="w-3 h-3" />, cls: 'text-violet-500' },
                          { label: 'Components', items: components, icon: <Layout className="w-3 h-3" />, cls: 'text-emerald-500' },
                        ].filter(g => g.items.length > 0);

                        return (
                          <div className="mt-3 space-y-2">
                            {/* Progress bar */}
                            {completedCount > 0 && (
                              <div className="flex items-center gap-2 px-1">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                                    style={{ width: `${(completedCount / totalCount) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium shrink-0">{completedCount}/{totalCount}</span>
                              </div>
                            )}
                            {groups.map((group) => (
                              <div key={group.label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                <div className={`flex items-center gap-1.5 mb-1.5 ${group.cls}`}>
                                  {group.icon}
                                  <span className="text-[10px] font-bold uppercase tracking-wider">{group.label}</span>
                                  <span className="text-[9px] text-slate-300 ml-auto">
                                    {group.items.filter(i => i.status === 'completed').length}/{group.items.length}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {group.items.map((item, idx) => (
                                    <div key={idx} className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-medium transition-all
                                      ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                        item.status === 'active' ? 'bg-indigo-50 text-indigo-700 animate-pulse' :
                                        'bg-white text-slate-500 border border-slate-100'}`}>
                                      <div className="shrink-0">
                                        {item.status === 'completed' ? <Check className="w-3 h-3 text-emerald-500" /> :
                                          item.status === 'active' ? <Loader className="w-3 h-3 text-indigo-500 animate-spin" /> :
                                          <div className="w-3 h-3 rounded-full border border-slate-200" />}
                                      </div>
                                      <span className={item.status === 'completed' ? 'line-through opacity-60' : ''}>{item.name}</span>
                                      {item.description && item.status !== 'completed' && (
                                        <span className="text-slate-400 ml-auto text-[10px] truncate max-w-[120px]">{item.description}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Render Roadmap INSIDE Chat if present */}
                      {msg.role === 'ai' && msg.roadmap && msg.roadmap.length > 0 && (() => {
                        const pages = msg.roadmap.filter(r => /page|landing|home|about|contact|dashboard|profile|pricing|hero|footer|header|nav|section/i.test(r.title));
                        const modals = msg.roadmap.filter(r => /modal|dialog|popup|overlay|drawer|sheet|toast/i.test(r.title));
                        const flows = msg.roadmap.filter(r => !pages.includes(r) && !modals.includes(r));

                        const categories = [
                          { label: 'Pages', icon: <PanelTop className="w-3 h-3" />, items: pages, cls: 'text-indigo-500' },
                          { label: 'Flows', icon: <Workflow className="w-3 h-3" />, items: flows, cls: 'text-amber-500' },
                          { label: 'Modals', icon: <PanelTopOpen className="w-3 h-3" />, items: modals, cls: 'text-violet-500' },
                        ].filter(c => c.items.length > 0);

                        return (
                          <div className="mt-3 space-y-2">
                            {categories.map((cat) => (
                              <div key={cat.label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                <div className={`flex items-center gap-1.5 mb-1.5 ${cat.cls}`}>
                                  {cat.icon}
                                  <span className="text-[10px] font-bold uppercase tracking-wider">{cat.label}</span>
                                  <span className="text-[9px] text-slate-300 ml-auto">{cat.items.length}</span>
                                </div>
                                <div className="space-y-1">
                                  {cat.items.map((item) => (
                                    <div key={item.id} className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] font-medium transition-all
                                        ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                                        item.status === 'active' ? 'bg-indigo-50 text-indigo-700 animate-pulse' :
                                          'bg-white text-slate-500 border border-slate-100'}`}>
                                      <div className="shrink-0">
                                        {item.status === 'completed' ? <Check className="w-3 h-3 text-emerald-500" /> :
                                          item.status === 'active' ? <Loader className="w-3 h-3 text-indigo-500 animate-spin" /> :
                                          <div className="w-3 h-3 rounded-full border border-slate-200" />}
                                      </div>
                                      <span className={item.status === 'completed' ? 'line-through opacity-60' : ''}>{item.title}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Status Indicator at bottom of bubble */}
                      {msg.isStreaming && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-indigo-500 font-medium">
                          <Loader className="w-3 h-3 animate-spin" />
                          {msg.statusPhase === 'analyzing' ? 'Analyzing...' : 'Building...'}
                        </div>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/50 space-y-1">
                          {msg.attachments.map((att, i) => (
                            <div key={i} className="flex items-center gap-1 text-[10px] text-slate-400 bg-white/50 p-1 rounded">
                              <Paperclip className="w-3 h-3" /> {att}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {/* Progress Indicator in Chat */}
              {(status === 'planning' || status === 'coding') && (
                <div className="mx-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50/80 rounded-2xl border border-indigo-100">
                    <div className="relative flex-shrink-0">
                      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#e0e7ff" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#6366f1" strokeWidth="3"
                          strokeDasharray={`${progress * 0.9425} 94.25`}
                          strokeLinecap="round"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-indigo-600">{progress}%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Loader className="w-3 h-3 text-indigo-500 animate-spin" />
                        <span className="text-xs font-bold text-indigo-700">
                          {status === 'planning' ? 'Planning...' : `Building — Step ${roadmap.findIndex(r => r.status === 'active') + 1 || '...'} of ${roadmap.length || '...'}`}
                        </span>
                      </div>
                      <div className="w-full bg-indigo-100 h-1 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[10px] text-indigo-500/70 mt-1 truncate font-medium">{currentTask ? currentTask.title : statusMessage}</p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area in Sidebar (Visible after start) */}
            {hasStarted && (
              <div className="p-4 bg-white border-t border-slate-100 z-10">
                {renderInputForm(true)}
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="flex flex-col h-full animate-in slide-in-from-left-4 fade-in duration-300">
            <div className="p-4 md:p-6 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Layout className="w-4 h-4 text-indigo-500" /> Template Gallery
              </h3>
              <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div
                onClick={() => document.getElementById('template-upload')?.click()}
                className="group cursor-pointer p-1 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 transition-all flex flex-col items-center justify-center text-center gap-2 min-h-[120px] bg-slate-50 hover:bg-white"
              >
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">Upload Custom DNA</p>
                  <p className="text-xs text-slate-400">Use your own HTML file</p>
                </div>
                <input
                  type="file"
                  id="template-upload"
                  className="hidden"
                  accept=".html"
                  onChange={handleTemplateUpload}
                />
              </div>

              {PRESET_TEMPLATES.map((tmpl, idx) => (
                <div
                  key={idx}
                  onClick={() => handleTemplateSelect(tmpl)}
                  className={`group cursor-pointer p-1 rounded-xl border-2 transition-all ${selectedTemplate.name === tmpl.name ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-transparent hover:border-indigo-500'}`}
                >
                  <div className="aspect-video bg-slate-100 rounded-lg mb-2 overflow-hidden border border-slate-100 flex items-center justify-center relative">
                    <TemplateThumbnail template={tmpl} />
                  </div>
                  <p className="text-sm font-bold text-slate-700">{tmpl.name}</p>
                  <p className="text-xs text-slate-400">{tmpl.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="flex flex-col h-full animate-in slide-in-from-left-4 fade-in duration-300">
            <div className="p-4 md:p-6 border-b border-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" /> Project History
              </h3>
              <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sessions.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <p className="text-xs">No saved projects yet.</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleLoadSession(session)}
                    className={`group cursor-pointer p-3 rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-sm transition-all bg-white relative ${sessionId === session.id ? 'ring-2 ring-indigo-100 border-indigo-500' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm font-bold text-slate-800 line-clamp-1 flex-1 min-w-0">{session.title}</h4>
                      <div className="flex items-center gap-0.5 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const compressed = await compressSession({
                                id: session.id,
                                title: session.title,
                                template: session.template,
                                chatHistory: session.chatHistory,
                                roadmap: session.roadmap,
                                files: session.files
                              });
                              const pageKeys = Object.keys(session.files).filter((n: string) => n.endsWith('.page.html'));
                              const firstPage = pageKeys[0] || Object.keys(session.files)[0] || '';
                              const url = `${window.location.origin}${window.location.pathname}#/${compressed}/fullview/${encodeURIComponent(firstPage)}`;
                              await navigator.clipboard.writeText(url);
                            } catch {
                              const url = `${window.location.origin}${window.location.pathname}#/chat/${session.id}`;
                              navigator.clipboard.writeText(url);
                            }
                          }}
                          className="text-slate-300 hover:text-indigo-500 p-1"
                          title="Copy shareable link"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSession(e, session.id)}
                          className="text-slate-300 hover:text-red-500 p-1"
                          title="Delete Session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-2">
                      <Layout className="w-3 h-3" /> {session.template.name}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(session.lastModified).toLocaleDateString()}
                      </div>
                      {sessionId === session.id && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative bg-white min-w-0">

        {/* Header - PERSISTENT TOP BAR */}
        <header className="h-14 md:h-16 bg-white border-b border-slate-100 flex items-center justify-between px-3 md:px-6 z-10 shadow-sm">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            {/* Mobile hamburger */}
            <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors shrink-0">
              <Menu className="w-5 h-5" />
            </button>

            <div
              onClick={() => setStep('selection')}
              className="group flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors shrink-0"
            >
              <Layout className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tight truncate max-w-[80px] md:max-w-[150px]">{selectedTemplate.name}</span>
              <span className="hidden group-hover:inline text-[10px] text-indigo-400 ml-1">Change</span>
            </div>

            {/* Enhanced Active Task Indicator */}
            <div className="h-8 w-[1px] bg-slate-200 mx-1 md:mx-2 hidden sm:block"></div>

            <div className="flex-col hidden sm:flex">
              <div className="flex items-center gap-2">
                {(status === 'planning' || status === 'coding') && <Loader className="w-3 h-3 text-indigo-500 animate-spin" />}
                <span className={`text-xs font-bold ${status === 'completed' ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {status === 'idle' ? 'Ready' : status === 'completed' ? 'Build Complete' : currentTask ? `Step ${roadmap.findIndex(r => r.id === currentTask.id) + 1} of ${roadmap.length}` : 'Architecting...'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium truncate max-w-[300px]">
                {currentTask ? currentTask.title : statusMessage}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            {/* Undo/Redo */}
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl mr-1 md:mr-2">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className={`p-1.5 rounded-lg transition-all ${canUndo ? 'text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm' : 'text-slate-300 cursor-not-allowed'}`}
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className={`p-1.5 rounded-lg transition-all ${canRedo ? 'text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm' : 'text-slate-300 cursor-not-allowed'}`}
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl mr-1 md:mr-4">
              <button
                onClick={() => setViewMode('desktop')}
                className={`p-1.5 rounded-lg shadow-sm transition-all ${viewMode === 'desktop' ? 'bg-white text-indigo-600' : 'text-slate-400'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`p-1.5 rounded-lg shadow-sm transition-all ${viewMode === 'mobile' ? 'bg-white text-indigo-600' : 'text-slate-400'}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>

            {Object.keys(files).length > 0 && (
              <>
              <button
                onClick={() => { if (designMode) { exitDesignMode(); } else { setDesignMode(true); setDesignSrcDoc(activeFile && files[activeFile] ? files[activeFile].content : null); setSelectedElement(null); } }}
                className={`p-2 md:px-3 md:py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5 ${designMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50'}`}
                title={designMode ? "Exit Design Mode" : "Enter Design Mode"}
              >
                <PenTool className="w-4 h-4" />
                <span className="hidden lg:inline">{designMode ? 'Exit Design' : 'Design'}</span>
              </button>
              <button
                onClick={handleFullView}
                className="p-2 md:px-3 md:py-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5"
                title="Open in Full View"
              >
                <Maximize className="w-4 h-4" />
                <span className="hidden lg:inline">Full View</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="px-2.5 py-2 md:px-4 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1.5 md:gap-2"
                >
                  <span className="hidden sm:inline">Export</span>
                  <Download className="w-4 h-4 sm:hidden" />
                  <ChevronDown className="w-4 h-4 hidden sm:block" />
                </button>

                {isExportOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Download</div>
                    <button
                      onClick={() => { activeFile && handleDownload(activeFile); setIsExportOpen(false); }}
                      disabled={!activeFile}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" /> Download HTML File
                    </button>
                    <button
                      onClick={() => { handleDownloadProject(); setIsExportOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                    >
                      <Package className="w-4 h-4" /> Download All HTML
                    </button>

                    <div className="my-1 border-b border-slate-100"></div>

                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clipboard</div>
                    <button
                      onClick={() => handleCopyCode('HTML')}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" /> Copy HTML
                    </button>
                    <button
                      onClick={handleCopyAsFigma}
                      disabled={isCopyingFigma}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isCopyingFigma ? <Loader className="w-4 h-4 animate-spin" /> : <Figma className="w-4 h-4" />}
                      <div className="flex flex-col">
                        <span>{isCopyingFigma ? 'Generating...' : 'Figma Auto-Layout'}</span>
                        <span className="text-[10px] text-slate-400 font-normal">Scripter plugin script</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
              </>
            )}

            {/* Share Link Button */}
            {chatHistory.length > 0 && (
              <button
                onClick={async () => {
                  setLinkCopied(true);
                  try {
                    const sessionData = {
                      id: sessionId,
                      title: chatHistory[0]?.text.slice(0, 50) || 'Shared Project',
                      template: selectedTemplate,
                      chatHistory,
                      roadmap,
                      files
                    };
                    const compressed = await compressSession(sessionData);
                    const fileKeys = Object.keys(files);
                    const pageKeys = fileKeys.filter(n => n.endsWith('.page.html'));
                    const firstPage = pageKeys.length > 0 ? pageKeys[0] : fileKeys[0] || '';
                    const url = `${window.location.origin}${window.location.pathname}#/${compressed}/fullview${firstPage ? '/' + encodeURIComponent(firstPage) : ''}`;
                    await navigator.clipboard.writeText(url);
                    setTimeout(() => setLinkCopied(false), 2000);
                  } catch {
                    // Fallback: copy local-only link
                    const url = `${window.location.origin}${window.location.pathname}#/chat/${sessionId}`;
                    await navigator.clipboard.writeText(url);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }
                }}
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                title="Copy shareable link"
              >
                {linkCopied ? <CheckCheck className="w-4 h-4 text-emerald-500" /> : <Link2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </header>

        {/* Canvas Container */}
        <div className="flex-1 overflow-hidden relative z-0 flex min-h-0">

          <div
            className="bg-white flex-1 min-h-0 overflow-hidden transition-all duration-700 relative flex flex-col"
            style={{ maxWidth: viewMode === 'desktop' ? '100%' : '375px' }}
          >

            {/* 1. IDLE STATE */}
            {!activeFile && status === 'idle' && (
              <div className="flex flex-col items-center justify-center flex-1 text-center p-6 md:p-20">
                <div className="w-14 h-14 md:w-20 md:h-20 bg-indigo-50 rounded-2xl md:rounded-3xl flex items-center justify-center mb-4 md:mb-8 animate-pulse">
                  <Wand2 className="w-7 h-7 md:w-10 md:h-10 text-indigo-500" />
                </div>
                <h2 className="text-xl md:text-3xl font-extrabold text-slate-800">Mission Control</h2>
                <p className="text-slate-500 mt-2 md:mt-3 max-w-md text-sm md:text-base">
                  DNA: <span className="font-semibold text-indigo-600">{selectedTemplate.name}</span> selected.
                  <br />
                  Enter your prompt to start building.
                </p>
              </div>
            )}

            {/* 2. LOADING / ARCHITECTING STATE (Before first file) */}
            {(status === 'planning' || (status === 'coding' && !activeFile)) && (
              <div className="flex flex-col items-center justify-center flex-1 p-6 md:p-10 space-y-4 md:space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-75"></div>
                  <div className="relative bg-white p-4 rounded-full shadow-xl border border-indigo-100">
                    <Loader className="w-10 h-10 text-indigo-600 animate-spin" />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Architecting Solution</h3>
                  <div className="h-6 overflow-hidden relative">
                    <p className="text-slate-500 text-sm animate-pulse">{statusMessage}</p>
                  </div>
                </div>
                {/* Mini Roadmap Visualization */}
                {roadmap.length > 0 && (
                  <div className="w-full max-w-md bg-slate-50 rounded-xl p-4 border border-slate-100 mt-4">
                    <div className="space-y-2">
                      {roadmap.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex items-center gap-3 opacity-70">
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`}></div>
                          <div className={`h-2 rounded-full flex-1 ${i === 0 ? 'bg-indigo-200' : 'bg-slate-200'}`}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. ACTIVE PREVIEW STATE */}
            {activeFile && files[activeFile] && (
              <div className="flex-1 min-h-0 w-full flex flex-col bg-white overflow-hidden">
                {/* File Tabs - Atomic Design */}
                <div className="bg-slate-50 border-b border-slate-100 px-2 pt-1.5 pb-0 flex gap-0.5 overflow-x-auto shrink-0 scrollbar-thin items-end" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                  {[
                    { key: 'atoms', label: 'Atoms', items: groupedFiles.atoms, btnClass: 'text-emerald-500 hover:text-emerald-600', countClass: 'text-emerald-300', activeTab: 'bg-white text-emerald-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] border-t-2 border-emerald-400', icon: <Component className="w-3 h-3" /> },
                    { key: 'molecules', label: 'Molecules', items: groupedFiles.molecules, btnClass: 'text-amber-500 hover:text-amber-600', countClass: 'text-amber-300', activeTab: 'bg-white text-amber-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] border-t-2 border-amber-400', icon: <Component className="w-3 h-3" /> },
                    { key: 'organisms', label: 'Organisms', items: groupedFiles.organisms, btnClass: 'text-violet-500 hover:text-violet-600', countClass: 'text-violet-300', activeTab: 'bg-white text-violet-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] border-t-2 border-violet-400', icon: <Component className="w-3 h-3" /> },
                    { key: 'pages', label: 'Pages', items: groupedFiles.pages, btnClass: 'text-indigo-500 hover:text-indigo-600', countClass: 'text-indigo-300', activeTab: 'bg-white text-indigo-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] border-t-2 border-indigo-400', icon: <FolderOpen className="w-3 h-3" /> },
                  ].filter(g => g.items.length > 0).map((group, idx) => (
                    <React.Fragment key={group.key}>
                      {idx > 0 && <div className="w-px h-5 bg-slate-200 mx-1 shrink-0 self-center" />}
                      <div className="flex items-end gap-0.5 shrink-0">
                        <button
                          onClick={() => setOpenFolders(p => ({ ...p, [group.key]: !p[group.key] }))}
                          className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold ${group.btnClass} transition-colors uppercase tracking-wider shrink-0`}
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${openFolders[group.key] ? 'rotate-90' : ''}`} />
                          {group.icon}
                          {group.label}
                          <span className={`text-[9px] font-normal ${group.countClass}`}>({group.items.length})</span>
                        </button>
                        {openFolders[group.key] && group.items.map((f) => (
                          <button
                            key={f.name}
                            onClick={() => { if (designMode) { saveDesignChanges(); setDesignSrcDoc(files[f.name]?.content || null); } setActiveFile(f.name); }}
                            className={`px-3 py-1.5 rounded-t-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${activeFile === f.name ? group.activeTab : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                          >
                            {group.key === 'pages' ? <FileCode className="w-3 h-3" /> : <Component className="w-3 h-3" />}
                            {f.name.replace(/\.(atom|molecule|organism|page)\.html$/, '.html')}
                          </button>
                        ))}
                      </div>
                    </React.Fragment>
                  ))}
                  {(status === 'coding') && (
                    <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-indigo-400 animate-pulse shrink-0">
                      <Terminal className="w-3 h-3" />
                      <span>Generating...</span>
                    </div>
                  )}
                  <div className="ml-auto" />
                </div>

                {/* Iframe Preview + Properties Panel */}
                <div className="flex-1 min-h-0 flex">
                  <div className="flex-1 min-h-0 relative">
                    <iframe
                      ref={previewIframeRef}
                      title="preview"
                      srcDoc={googleFontsLink + (designMode && designSrcDoc !== null ? designSrcDoc : files[activeFile].content) + (designMode ? designModeScript : navScript)}
                      className="absolute inset-0 w-full h-full border-none bg-white"
                      sandbox="allow-scripts allow-same-origin"
                    />
                    {/* AI Edit Floating Chatbox — shows when element selected */}
                    {designMode && (selectedElement || aiEditLoading) && (
                      <div className="absolute bottom-4 left-4 right-4 z-30 animate-in slide-in-from-bottom-4 fade-in duration-300">
                        <div className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-2xl shadow-slate-300/30 overflow-hidden">
                          {/* Element tag badge */}
                          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                            <span className="text-indigo-600">◆</span>
                            <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-mono font-bold">
                              &lt;{selectedElement?.tag}{selectedElement?.classes ? `.${selectedElement.classes.split(' ')[0]}` : ''}&gt;
                            </span>
                            <span className="text-[10px] text-slate-400 truncate">{selectedElement?.text?.substring(0, 40)}{(selectedElement?.text?.length || 0) > 40 ? '...' : ''}</span>
                          </div>
                          {/* Input row */}
                          <div className="p-1.5 flex items-center gap-2">
                            <div className="flex items-center gap-2 pl-3 shrink-0">
                              <Wand2 className={`w-4 h-4 ${aiEditLoading ? 'text-indigo-500 animate-spin' : 'text-slate-400'}`} />
                            </div>
                            <input
                              type="text"
                              value={aiEditPrompt}
                              onChange={e => setAiEditPrompt(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAIEdit()}
                              placeholder={`Edit this ${selectedElement?.tag || 'element'} — e.g. "make background dark", "add more padding"`}
                              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none py-2 min-w-0"
                              disabled={aiEditLoading}
                              autoFocus
                            />
                            <button
                              onClick={handleAIEdit}
                              disabled={!aiEditPrompt.trim() || aiEditLoading}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                            >
                              {aiEditLoading ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Editing...</> : <><Sparkles className="w-3.5 h-3.5" /> Apply</>}
                            </button>
                          </div>
                        </div>
                        {aiEditLoading && (
                          <div className="mt-2 text-center">
                            <span className="text-[10px] text-indigo-500 font-medium animate-pulse bg-white/90 px-3 py-1 rounded-full border border-indigo-100">AI is editing the page...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Design Mode Properties Panel */}
                  {designMode && (
                    <div className="absolute right-0 top-0 bottom-0 w-[280px] md:w-72 md:relative border-l border-slate-200 bg-white overflow-y-auto shrink-0 flex flex-col text-slate-700 z-20 shadow-xl md:shadow-none">
                      {/* Panel Header */}
                      <div className="p-4 border-b border-slate-100 shrink-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Properties</h3>
                          <button onClick={exitDesignMode} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {selectedElement ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="text-indigo-600">◆</span>
                              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono truncate">
                                &lt;{selectedElement.tag}{selectedElement.classes ? `.${selectedElement.classes.split(' ')[0]}` : ''}&gt;
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1.5 truncate">{selectedElement.text.substring(0, 60)}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">Click an element to inspect it</p>
                        )}
                      </div>

                      {/* ICON LIBRARY (Page-level — always visible) */}
                      <div className="border-b border-slate-100">
                        <button onClick={() => setDesignSections(p => ({...p, icons: !p.icons}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><span>◇</span> Icon Library</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.icons ? 'rotate-180' : ''}`} />
                        </button>
                        {designSections.icons && (
                          <div className="px-4 pb-4 space-y-2">
                            <p className="text-[10px] text-slate-400">Changes all icons across the page</p>
                            <div className="relative">
                              <select
                                value={activeIconLibrary}
                                onChange={e => handleIconLibraryChange(e.target.value)}
                                disabled={iconMappingLoading}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400 disabled:opacity-50"
                              >
                                {ICON_LIBRARIES.map(lib => (
                                  <option key={lib.value} value={lib.value}>{lib.label} — {lib.desc}</option>
                                ))}
                              </select>
                            </div>
                            {iconMappingLoading && (
                              <div className="flex items-center gap-2 text-[10px] text-indigo-500 animate-pulse">
                                <Loader className="w-3 h-3 animate-spin" />
                                <span>AI mapping icons to {ICON_LIBRARIES.find(l => l.value === activeIconLibrary)?.label}...</span>
                              </div>
                            )}
                            {!iconMappingLoading && activeIconLibrary !== 'lucide' && (
                              <p className="text-[9px] text-emerald-500 leading-relaxed">Icons mapped via AI to {ICON_LIBRARIES.find(l => l.value === activeIconLibrary)?.label}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {selectedElement && (
                        <div className="flex-1 overflow-y-auto">
                          {/* CONTENT (Text Editing) */}
                          {selectedElement.canEditText && (
                            <div className="border-b border-slate-100">
                              <div className="px-4 py-3">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Content</label>
                                <textarea
                                  value={selectedElement.text}
                                  onChange={e => updateElementText(e.target.value)}
                                  rows={Math.min(6, Math.max(2, Math.ceil(selectedElement.text.length / 35)))}
                                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-y leading-relaxed"
                                  placeholder="Enter text content..."
                                />
                              </div>
                            </div>
                          )}
                          {/* IMAGE */}
                          {selectedElement.tag === 'img' && selectedElement.attrs && (
                            <div className="border-b border-slate-100">
                              <div className="px-4 py-3 space-y-3">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Image</label>
                                {/* Preview */}
                                {selectedElement.attrs.src && (
                                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                                    <img src={selectedElement.attrs.src} alt={selectedElement.attrs.alt || ''} className="w-full h-28 object-cover" />
                                  </div>
                                )}
                                {/* Source URL */}
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Source URL</label>
                                  <input
                                    type="text"
                                    value={selectedElement.attrs.src || ''}
                                    onChange={e => updateElementAttr('src', e.target.value)}
                                    placeholder="https://..."
                                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 font-mono"
                                  />
                                </div>
                                {/* Alt Text */}
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Alt Text</label>
                                  <input
                                    type="text"
                                    value={selectedElement.attrs.alt || ''}
                                    onChange={e => updateElementAttr('alt', e.target.value)}
                                    placeholder="Image description..."
                                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                                  />
                                </div>
                                {/* Unsplash Search */}
                                <div className="pt-1">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] text-slate-400 flex items-center gap-1">
                                      <ImageIcon className="w-3 h-3" /> Unsplash
                                    </label>
                                    {!getUnsplashKey() && (
                                      <button
                                        onClick={() => {
                                          const key = window.prompt('Enter your Unsplash Access Key:\n(Get one free at unsplash.com/developers)');
                                          if (key?.trim()) {
                                            localStorage.setItem('unsplash_access_key', key.trim());
                                          }
                                        }}
                                        className="text-[9px] text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" /> Set API Key
                                      </button>
                                    )}
                                    {localStorage.getItem('unsplash_access_key') && (
                                      <button
                                        onClick={() => { localStorage.removeItem('unsplash_access_key'); setUnsplashResults([]); }}
                                        className="text-[9px] text-slate-400 hover:text-red-500"
                                      >
                                        Reset Key
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <div className="flex-1 relative">
                                      <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                      <input
                                        type="text"
                                        value={unsplashQuery}
                                        onChange={e => setUnsplashQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') searchUnsplash(unsplashQuery); }}
                                        placeholder="Search photos..."
                                        className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-indigo-400"
                                      />
                                    </div>
                                    <button
                                      onClick={() => searchUnsplash(unsplashQuery)}
                                      disabled={unsplashLoading || !unsplashQuery.trim()}
                                      className="px-2.5 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-40 transition-colors shrink-0 font-medium"
                                    >
                                      {unsplashLoading ? <Loader className="w-3 h-3 animate-spin" /> : 'Go'}
                                    </button>
                                  </div>
                                  {!getUnsplashKey() && (
                                    <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
                                      Add your free Unsplash API key to search millions of photos.
                                    </p>
                                  )}
                                  {/* Results Grid */}
                                  {unsplashResults.length > 0 && (
                                    <div className="mt-2 grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                                      {unsplashResults.map(img => (
                                        <button
                                          key={img.id}
                                          onClick={() => {
                                            updateElementAttr('src', img.regular);
                                            updateElementAttr('alt', img.alt);
                                          }}
                                          className="relative group rounded-md overflow-hidden border border-slate-200 hover:border-indigo-400 transition-colors aspect-square"
                                          title={`Photo by ${img.user}`}
                                        >
                                          <img src={img.thumb} alt={img.alt} className="w-full h-full object-cover" />
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                            <Check className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 drop-shadow transition-opacity" />
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {unsplashResults.length > 0 && (
                                    <p className="text-[8px] text-slate-400 mt-1.5 text-center">Photos by Unsplash</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {/* TYPOGRAPHY */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, typography: !p.typography}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">✎ Typography</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.typography ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.typography && (
                              <div className="px-4 pb-4 space-y-3">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Font Family</label>
                                  <div ref={fontDropdownRef} className="relative">
                                    <button type="button" onClick={() => { setFontDropdownOpen(!fontDropdownOpen); setFontSearch(''); }} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none flex items-center justify-between gap-1 text-left">
                                      <span className="truncate" style={{ fontFamily: selectedElement.styles.fontFamily || 'inherit' }}>{selectedElement.styles.fontFamily?.split(',')[0]?.replace(/"/g,'').trim() || 'Default (inherit)'}</span>
                                      <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                    </button>
                                    {fontDropdownOpen && (
                                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                                        <div className="p-1.5 border-b border-slate-100">
                                          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-md">
                                            <Search className="w-3 h-3 text-slate-400 shrink-0" />
                                            <input autoFocus type="text" value={fontSearch} onChange={e => setFontSearch(e.target.value)} placeholder="Search fonts..." className="w-full text-xs bg-transparent outline-none placeholder:text-slate-300" />
                                          </div>
                                        </div>
                                        <div className="max-h-52 overflow-y-auto">
                                          {(() => {
                                            const q = fontSearch.toLowerCase();
                                            const fontGroups = [
                                              { label: 'Sans Serif', fonts: ['Inter','Roboto','Open Sans','Montserrat','Poppins','Lato','Nunito','Nunito Sans','Raleway','Ubuntu','Source Sans 3','PT Sans','Noto Sans','Work Sans','Fira Sans','Quicksand','Barlow','Mulish','DM Sans','Manrope','Space Grotesk','Plus Jakarta Sans','Outfit','Sora','Albert Sans','Bricolage Grotesque','Lexend','Cabin','Karla','Rubik','Josefin Sans','Titillium Web','Overpass','Figtree','Geist','Archivo','Oswald','Bebas Neue'] },
                                              { label: 'Serif', fonts: ['Merriweather','Playfair Display','PT Serif','Instrument Serif','Newsreader','Bitter','Crimson Text','Lora','Libre Baskerville'] },
                                              { label: 'Monospace', fonts: ['JetBrains Mono','Fira Code','Space Mono','IBM Plex Mono','Inconsolata','Source Code Pro'] },
                                              { label: 'System', fonts: ['Arial','Georgia','Times New Roman','Verdana','Monospace'] },
                                            ];
                                            const systemMap: Record<string, string> = { 'Arial': 'Arial, sans-serif', 'Georgia': 'Georgia, serif', 'Times New Roman': 'Times New Roman, serif', 'Verdana': 'Verdana, sans-serif', 'Monospace': 'monospace' };
                                            const currentVal = selectedElement.styles.fontFamily?.split(',')[0]?.replace(/"/g,'').trim() || 'inherit';
                                            const items: React.ReactNode[] = [];
                                            if (!q || 'default'.includes(q) || 'inherit'.includes(q)) {
                                              items.push(<button key="inherit" onClick={() => { updateElementStyle('fontFamily', 'inherit'); setFontDropdownOpen(false); setFontSearch(''); }} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 ${currentVal === 'inherit' ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-600'}`}>Default (inherit)</button>);
                                            }
                                            for (const group of fontGroups) {
                                              const filtered = group.fonts.filter(f => !q || f.toLowerCase().includes(q));
                                              if (filtered.length === 0) continue;
                                              items.push(<div key={'g-' + group.label} className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 sticky top-0">{group.label}</div>);
                                              for (const font of filtered) {
                                                const val = systemMap[font] || font;
                                                const isActive = currentVal === font || currentVal === val;
                                                items.push(
                                                  <button key={font} onClick={() => { updateElementStyle('fontFamily', val); setFontDropdownOpen(false); setFontSearch(''); }} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-700'}`} style={{ fontFamily: systemMap[font] ? undefined : font }}>
                                                    {font}
                                                  </button>
                                                );
                                              }
                                            }
                                            return items.length > 0 ? items : <div className="px-3 py-3 text-xs text-slate-400 text-center">No fonts found</div>;
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <label className="text-[10px] text-slate-400 block mb-1">Size</label>
                                    <div className="flex">
                                      <input type="number" value={parseNum(selectedElement.styles.fontSize)} onChange={e => updateElementStyle('fontSize', e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded-l-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                      <span className="text-[10px] text-slate-400 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg px-2 py-1.5 shrink-0">px</span>
                                    </div>
                                  </div>
                                </div>
                                {/* Text Alignment */}
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Alignment</label>
                                  <div className="flex gap-1">
                                    {([
                                      { val: 'left', icon: AlignLeft, label: 'Left' },
                                      { val: 'center', icon: AlignCenter, label: 'Center' },
                                      { val: 'right', icon: AlignRight, label: 'Right' },
                                      { val: 'justify', icon: AlignJustify, label: 'Justify' },
                                    ] as const).map(({ val, icon: Icon, label }) => (
                                      <button
                                        key={val}
                                        onClick={() => updateElementStyle('textAlign', val)}
                                        title={label}
                                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border transition-colors ${selectedElement.styles.textAlign === val ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                                      >
                                        <Icon className="w-3.5 h-3.5" />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Vertical Alignment */}
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Vertical Align</label>
                                  <div className="flex gap-1">
                                    {([
                                      { val: 'top', icon: ArrowUpFromLine, label: 'Top' },
                                      { val: 'middle', label: 'Middle' },
                                      { val: 'bottom', icon: ArrowDownFromLine, label: 'Bottom' },
                                      { val: 'baseline', label: 'Baseline' },
                                    ] as const).map(item => (
                                      <button
                                        key={item.val}
                                        onClick={() => updateElementStyle('verticalAlign', item.val)}
                                        title={item.label}
                                        className={`flex-1 flex items-center justify-center py-1.5 rounded-lg border text-[9px] font-medium transition-colors ${selectedElement.styles.verticalAlign === item.val ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                                      >
                                        {'icon' in item && item.icon ? <item.icon className="w-3.5 h-3.5" /> : item.val.charAt(0).toUpperCase()}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Weight</label>
                                    <select value={selectedElement.styles.fontWeight || 'inherit'} onChange={e => updateElementStyle('fontWeight', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="inherit">Inherit</option>
                                      <option value="300">Light</option>
                                      <option value="400">Normal</option>
                                      <option value="500">Medium</option>
                                      <option value="600">Semibold</option>
                                      <option value="700">Bold</option>
                                      <option value="800">Extrabold</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Style</label>
                                    <select value={selectedElement.styles.fontStyle || 'inherit'} onChange={e => updateElementStyle('fontStyle', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="inherit">Inherit</option>
                                      <option value="normal">Normal</option>
                                      <option value="italic">Italic</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Decoration</label>
                                    <select value={selectedElement.styles.textDecorationLine || 'none'} onChange={e => updateElementStyle('textDecorationLine', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="none">None</option>
                                      <option value="underline">Underline</option>
                                      <option value="line-through">Line-through</option>
                                      <option value="overline">Overline</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Transform</label>
                                    <select value={selectedElement.styles.textTransform || 'none'} onChange={e => updateElementStyle('textTransform', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="none">None</option>
                                      <option value="uppercase">Uppercase</option>
                                      <option value="lowercase">Lowercase</option>
                                      <option value="capitalize">Capitalize</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Line Height</label>
                                    <input type="text" value={parseNum(selectedElement.styles.lineHeight)} onChange={e => updateElementStyle('lineHeight', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Letter Spacing</label>
                                    <div className="flex">
                                      <input type="number" step="0.5" value={parseNum(selectedElement.styles.letterSpacing)} onChange={e => updateElementStyle('letterSpacing', e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded-l-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                      <span className="text-[10px] text-slate-400 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg px-1.5 py-1.5 shrink-0">px</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* COLORS */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, colors: !p.colors}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">⚙ Colors</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.colors ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.colors && (
                              <div className="px-4 pb-4 space-y-3">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Text Color</label>
                                  <div className="flex gap-2">
                                    <input type="color" value={rgbToHex(selectedElement.styles.color)} onChange={e => updateElementStyle('color', e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer shrink-0 p-0.5" />
                                    <input type="text" value={rgbToHex(selectedElement.styles.color)} onChange={e => updateElementStyle('color', e.target.value)} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Background</label>
                                  <div className="flex gap-2">
                                    <input type="color" value={rgbToHex(selectedElement.styles.backgroundColor)} onChange={e => updateElementStyle('backgroundColor', e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer shrink-0 p-0.5" />
                                    <input type="text" value={rgbToHex(selectedElement.styles.backgroundColor)} onChange={e => updateElementStyle('backgroundColor', e.target.value)} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* BORDER */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, border: !p.border}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">☐ Border</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.border ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.border && (
                              <div className="px-4 pb-4 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Width</label>
                                    <div className="flex">
                                      <input type="number" min="0" value={parseNum(selectedElement.styles.borderTopWidth)} onChange={e => updateElementStyle('borderWidth', e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded-l-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                      <span className="text-[10px] text-slate-400 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg px-1.5 py-1.5 shrink-0">px</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Style</label>
                                    <select value={selectedElement.styles.borderTopStyle || 'none'} onChange={e => updateElementStyle('borderStyle', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="none">None</option>
                                      <option value="solid">Solid</option>
                                      <option value="dashed">Dashed</option>
                                      <option value="dotted">Dotted</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Color</label>
                                  <div className="flex gap-2">
                                    <input type="color" value={rgbToHex(selectedElement.styles.borderTopColor)} onChange={e => updateElementStyle('borderColor', e.target.value)} className="w-8 h-8 rounded border border-slate-200 cursor-pointer shrink-0 p-0.5" />
                                    <input type="text" value={rgbToHex(selectedElement.styles.borderTopColor)} onChange={e => updateElementStyle('borderColor', e.target.value)} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Radius</label>
                                  <div className="flex">
                                    <input type="number" min="0" value={parseNum(selectedElement.styles.borderRadius)} onChange={e => updateElementStyle('borderRadius', e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded-l-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                    <span className="text-[10px] text-slate-400 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg px-1.5 py-1.5 shrink-0">px</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SPACING */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, spacing: !p.spacing}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">⊡ Spacing</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.spacing ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.spacing && (
                              <div className="px-4 pb-4 space-y-3">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1.5">Padding</label>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {(['Top','Right','Bottom','Left'] as const).map(side => (
                                      <div key={side} className="text-center">
                                        <span className="text-[9px] text-slate-300 block mb-0.5">{side[0]}</span>
                                        <input type="number" min="0" value={parseNum(selectedElement.styles[`padding${side}` as keyof typeof selectedElement.styles])} onChange={e => updateElementStyle(`padding${side}`, e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded px-1 py-1 text-center outline-none focus:border-indigo-400" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1.5">Margin</label>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {(['Top','Right','Bottom','Left'] as const).map(side => (
                                      <div key={side} className="text-center">
                                        <span className="text-[9px] text-slate-300 block mb-0.5">{side[0]}</span>
                                        <input type="number" value={parseNum(selectedElement.styles[`margin${side}` as keyof typeof selectedElement.styles])} onChange={e => updateElementStyle(`margin${side}`, e.target.value + 'px')} className="w-full text-xs border border-slate-200 rounded px-1 py-1 text-center outline-none focus:border-indigo-400" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SIZE */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, size: !p.size}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">↗ Size</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.size ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.size && (
                              <div className="px-4 pb-4 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Width</label>
                                    <input type="text" value={selectedElement.styles.width || 'auto'} onChange={e => updateElementStyle('width', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Height</label>
                                    <input type="text" value={selectedElement.styles.height || 'auto'} onChange={e => updateElementStyle('height', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Min W</label>
                                    <input type="text" value={selectedElement.styles.minWidth || 'auto'} onChange={e => updateElementStyle('minWidth', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Max W</label>
                                    <input type="text" value={selectedElement.styles.maxWidth || 'none'} onChange={e => updateElementStyle('maxWidth', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Min H</label>
                                    <input type="text" value={selectedElement.styles.minHeight || 'auto'} onChange={e => updateElementStyle('minHeight', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Max H</label>
                                    <input type="text" value={selectedElement.styles.maxHeight || 'none'} onChange={e => updateElementStyle('maxHeight', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                {selectedElement.tag === 'img' && (
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Object Fit</label>
                                    <select value={selectedElement.styles.objectFit || 'fill'} onChange={e => updateElementStyle('objectFit', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="fill">Fill</option>
                                      <option value="contain">Contain</option>
                                      <option value="cover">Cover</option>
                                      <option value="none">None</option>
                                      <option value="scale-down">Scale Down</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* LAYOUT */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, layout: !p.layout}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">⊞ Layout</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.layout ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.layout && (
                              <div className="px-4 pb-4 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Display</label>
                                    <select value={selectedElement.styles.display || 'block'} onChange={e => updateElementStyle('display', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="block">Block</option>
                                      <option value="inline">Inline</option>
                                      <option value="inline-block">Inline Block</option>
                                      <option value="flex">Flex</option>
                                      <option value="inline-flex">Inline Flex</option>
                                      <option value="grid">Grid</option>
                                      <option value="inline-grid">Inline Grid</option>
                                      <option value="none">None</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Position</label>
                                    <select value={selectedElement.styles.position || 'static'} onChange={e => updateElementStyle('position', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="static">Static</option>
                                      <option value="relative">Relative</option>
                                      <option value="absolute">Absolute</option>
                                      <option value="fixed">Fixed</option>
                                      <option value="sticky">Sticky</option>
                                    </select>
                                  </div>
                                </div>
                                {selectedElement.styles.position && selectedElement.styles.position !== 'static' && (
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {(['top','right','bottom','left'] as const).map(side => (
                                      <div key={side} className="text-center">
                                        <span className="text-[9px] text-slate-300 block mb-0.5 uppercase">{side[0]}</span>
                                        <input type="text" value={selectedElement.styles[side] || 'auto'} onChange={e => updateElementStyle(side, e.target.value)} className="w-full text-xs border border-slate-200 rounded px-1 py-1 text-center outline-none focus:border-indigo-400" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Z-Index</label>
                                    <input type="text" value={selectedElement.styles.zIndex || 'auto'} onChange={e => updateElementStyle('zIndex', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Overflow</label>
                                    <select value={selectedElement.styles.overflow || 'visible'} onChange={e => updateElementStyle('overflow', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="visible">Visible</option>
                                      <option value="hidden">Hidden</option>
                                      <option value="scroll">Scroll</option>
                                      <option value="auto">Auto</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Visibility</label>
                                  <select value={selectedElement.styles.visibility || 'visible'} onChange={e => updateElementStyle('visibility', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                    <option value="visible">Visible</option>
                                    <option value="hidden">Hidden</option>
                                    <option value="collapse">Collapse</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* FLEXBOX */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, flexbox: !p.flexbox}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">⬡ Flexbox</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.flexbox ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.flexbox && (
                              <div className="px-4 pb-4 space-y-3">
                                <p className="text-[10px] text-slate-400 italic">Container props (apply when display is flex/grid)</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Direction</label>
                                    <select value={selectedElement.styles.flexDirection || 'row'} onChange={e => updateElementStyle('flexDirection', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="row">Row</option>
                                      <option value="row-reverse">Row Reverse</option>
                                      <option value="column">Column</option>
                                      <option value="column-reverse">Col Reverse</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Wrap</label>
                                    <select value={selectedElement.styles.flexWrap || 'nowrap'} onChange={e => updateElementStyle('flexWrap', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="nowrap">No Wrap</option>
                                      <option value="wrap">Wrap</option>
                                      <option value="wrap-reverse">Wrap Reverse</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Justify</label>
                                    <select value={selectedElement.styles.justifyContent || 'flex-start'} onChange={e => updateElementStyle('justifyContent', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="flex-start">Start</option>
                                      <option value="flex-end">End</option>
                                      <option value="center">Center</option>
                                      <option value="space-between">Space Between</option>
                                      <option value="space-around">Space Around</option>
                                      <option value="space-evenly">Space Evenly</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Align Items</label>
                                    <select value={selectedElement.styles.alignItems || 'stretch'} onChange={e => updateElementStyle('alignItems', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="stretch">Stretch</option>
                                      <option value="flex-start">Start</option>
                                      <option value="flex-end">End</option>
                                      <option value="center">Center</option>
                                      <option value="baseline">Baseline</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Gap</label>
                                  <input type="text" value={selectedElement.styles.gap || '0px'} onChange={e => updateElementStyle('gap', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                </div>
                                <hr className="border-slate-100" />
                                <p className="text-[10px] text-slate-400 italic">Child props (this element as flex child)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Grow</label>
                                    <input type="number" min="0" value={selectedElement.styles.flexGrow || '0'} onChange={e => updateElementStyle('flexGrow', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Shrink</label>
                                    <input type="number" min="0" value={selectedElement.styles.flexShrink || '1'} onChange={e => updateElementStyle('flexShrink', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Basis</label>
                                    <input type="text" value={selectedElement.styles.flexBasis || 'auto'} onChange={e => updateElementStyle('flexBasis', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Align Self</label>
                                    <select value={selectedElement.styles.alignSelf || 'auto'} onChange={e => updateElementStyle('alignSelf', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                      <option value="auto">Auto</option>
                                      <option value="flex-start">Start</option>
                                      <option value="flex-end">End</option>
                                      <option value="center">Center</option>
                                      <option value="stretch">Stretch</option>
                                      <option value="baseline">Baseline</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-1">Order</label>
                                    <input type="number" value={selectedElement.styles.order || '0'} onChange={e => updateElementStyle('order', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* EFFECTS */}
                          <div className="border-b border-slate-100">
                            <button onClick={() => setDesignSections(p => ({...p, effects: !p.effects}))} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">✦ Effects</span>
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${designSections.effects ? 'rotate-180' : ''}`} />
                            </button>
                            {designSections.effects && (
                              <div className="px-4 pb-4 space-y-3">
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Opacity</label>
                                  <div className="flex items-center gap-2">
                                    <input type="range" min="0" max="1" step="0.05" value={selectedElement.styles.opacity || '1'} onChange={e => updateElementStyle('opacity', e.target.value)} className="flex-1 h-1.5 accent-indigo-500" />
                                    <span className="text-xs text-slate-500 w-8 text-right">{Math.round(parseFloat(selectedElement.styles.opacity || '1') * 100)}%</span>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Box Shadow</label>
                                  <input type="text" value={selectedElement.styles.boxShadow || 'none'} onChange={e => updateElementStyle('boxShadow', e.target.value)} placeholder="0px 4px 6px rgba(0,0,0,0.1)" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    <button onClick={() => updateElementStyle('boxShadow', 'none')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">None</button>
                                    <button onClick={() => updateElementStyle('boxShadow', '0 1px 3px rgba(0,0,0,0.12)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">SM</button>
                                    <button onClick={() => updateElementStyle('boxShadow', '0 4px 6px -1px rgba(0,0,0,0.1)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">MD</button>
                                    <button onClick={() => updateElementStyle('boxShadow', '0 10px 15px -3px rgba(0,0,0,0.1)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">LG</button>
                                    <button onClick={() => updateElementStyle('boxShadow', '0 20px 25px -5px rgba(0,0,0,0.1)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">XL</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Transform</label>
                                  <input type="text" value={selectedElement.styles.transform || 'none'} onChange={e => updateElementStyle('transform', e.target.value)} placeholder="rotate(0deg) scale(1)" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    <button onClick={() => updateElementStyle('transform', 'none')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">None</button>
                                    <button onClick={() => updateElementStyle('transform', 'rotate(45deg)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">45°</button>
                                    <button onClick={() => updateElementStyle('transform', 'rotate(90deg)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">90°</button>
                                    <button onClick={() => updateElementStyle('transform', 'scale(1.1)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Scale+</button>
                                    <button onClick={() => updateElementStyle('transform', 'scale(0.9)')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Scale-</button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Cursor</label>
                                  <select value={selectedElement.styles.cursor || 'auto'} onChange={e => updateElementStyle('cursor', e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-indigo-400">
                                    <option value="auto">Auto</option>
                                    <option value="default">Default</option>
                                    <option value="pointer">Pointer</option>
                                    <option value="text">Text</option>
                                    <option value="move">Move</option>
                                    <option value="grab">Grab</option>
                                    <option value="not-allowed">Not Allowed</option>
                                    <option value="crosshair">Crosshair</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 block mb-1">Transition</label>
                                  <input type="text" value={selectedElement.styles.transition || 'none'} onChange={e => updateElementStyle('transition', e.target.value)} placeholder="all 0.3s ease" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400" />
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    <button onClick={() => updateElementStyle('transition', 'none')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">None</button>
                                    <button onClick={() => updateElementStyle('transition', 'all 0.2s ease')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Fast</button>
                                    <button onClick={() => updateElementStyle('transition', 'all 0.3s ease')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Normal</button>
                                    <button onClick={() => updateElementStyle('transition', 'all 0.5s ease-in-out')} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">Slow</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Command Center (The Smart Input) - Hidden after start */}
        {!hasStarted && (
          <div className="absolute bottom-16 md:bottom-8 left-0 right-0 px-3 md:px-8 pointer-events-none z-50">
            <div className="max-w-4xl mx-auto backdrop-blur-xl bg-white/80 p-2 md:p-3 rounded-2xl md:rounded-3xl shadow-2xl pointer-events-auto border border-slate-200 ring-1 ring-slate-100">
              {renderInputForm(false)}
            </div>
          </div>
        )}

      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around py-2 z-30 safe-area-bottom">
        <button onClick={() => { setActiveTab('chat'); setMobileSidebarOpen(true); }} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${activeTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chat</span>
        </button>
        <button onClick={() => { setActiveTab('templates'); setMobileSidebarOpen(true); }} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${activeTab === 'templates' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <Layout className="w-5 h-5" />
          <span className="text-[10px] font-medium">DNA</span>
        </button>
        <button onClick={() => { setActiveTab('history'); setMobileSidebarOpen(true); }} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <History className="w-5 h-5" />
          <span className="text-[10px] font-medium">History</span>
        </button>
        <button onClick={() => setStep('selection')} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-400 transition-colors">
          <LayoutTemplate className="w-5 h-5" />
          <span className="text-[10px] font-medium">Templates</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
