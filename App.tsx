
import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Layout, Activity, Loader,
  Monitor, Smartphone, Wand2, Image as ImageIcon, FileText,
  Play, Check, FileCode, X, Paperclip, LayoutTemplate, Upload,
  ArrowRight, ChevronLeft, MessageSquare, Bot, User, BrainCircuit,
  Download, Package, Terminal, AlertTriangle,
  ChevronDown, Copy, Figma, History, Plus, Trash2, Calendar,
  PanelTop, Workflow, PanelTopOpen
} from 'lucide-react';
import { generateArchitectureStream } from './services/geminiService';
import { PRESET_TEMPLATES } from './constants';
import { RoadmapItem, GeneratedFile, DesignTemplate, ChatMessage, ProjectSession } from './types';
import JSZip from 'jszip';
import { domToFigmaScript } from './utils/domToFigmaSvg';

// --- Sub-components ---

const TemplateThumbnail: React.FC<{ template: DesignTemplate }> = ({ template }) => {
  const [loaded, setLoaded] = useState(false);

  if (!template.path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
        <LayoutTemplate className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-white group-hover:shadow-sm transition-all overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
          <Loader className="w-4 h-4 text-slate-300 animate-spin" />
        </div>
      )}
      {/* 
         Scale Strategy: 
         - Render iframe at 1280px width (standard desktop).
         - Scale down to 25% (0.25).
         - This effectively fits a 1280px wide view into a ~320px wide container.
         - 400% width = 100% / 0.25
       */}
      <iframe
        src={template.path}
        className={`w-[400%] h-[400%] origin-top-left scale-[0.25] pointer-events-none border-none transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        title={template.name}
        loading="lazy"
      />
      {/* Transparent overlay to prevent iframe interaction but allow clicks on parent */}
      <div className="absolute inset-0 z-20 bg-transparent" />
    </div>
  );
};

const App: React.FC = () => {
  // Flow State
  const [step, setStep] = useState<'selection' | 'studio'>('selection');

  // App State
  const [activeTab, setActiveTab] = useState<'chat' | 'templates' | 'history'>('chat');
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DesignTemplate>(PRESET_TEMPLATES[0]);

  const [status, setStatus] = useState<'idle' | 'planning' | 'coding' | 'completed'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to build');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const [roadmap, setRoadmap] = useState<RoadmapItem[]>([]);
  const [files, setFiles] = useState<Record<string, GeneratedFile>>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isChatExportOpen, setIsChatExportOpen] = useState(false);

  // Session State
  const [sessionId, setSessionId] = useState<string>(() => Date.now().toString());
  const [sessions, setSessions] = useState<ProjectSession[]>([]);

  // Chat History
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Derived State
  const currentTask = roadmap.find(r => r.status === 'active');
  const hasStarted = chatHistory.length > 0;

  // --- Persistence Logic ---

  // Load sessions from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ai_architect_sessions');
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  // Save current session state whenever it changes
  useEffect(() => {
    if (chatHistory.length === 0) return;

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
  }, [chatHistory, roadmap, files, sessionId, selectedTemplate]);

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
    setStep('selection'); // Go back to selection for a fresh start
    setActiveTab('chat');
  };

  const handleLoadSession = (session: ProjectSession) => {
    setSessionId(session.id);
    setSelectedTemplate(session.template);
    setChatHistory(session.chatHistory);
    setRoadmap(session.roadmap);
    setFiles(session.files);

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

    // Determine if this is a fresh build or a modification
    const isModification = Object.keys(files).length > 0;
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

    let currentPhase = 'planning';
    let fullBuffer = "";
    let lastFileCount = 0;
    // Pass existing files if modification, or empty object if fresh
    const currentFilesSnapshot = { ...files };
    // Ensure we have template content
    const dnaContent = selectedTemplate.content || "";

    try {
      const stream = generateArchitectureStream(
        newUserMsg.text,
        dnaContent,
        attachedFiles,
        currentFilesSnapshot,
        chatHistory
      );

      for await (const chunk of stream) {
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

            // Update Global State
            setRoadmap(newRoadmap);
            setStatus('coding');
            setStatusMessage('Blueprint Created. Starting Design...');
            setProgress(15);
            currentPhase = 'coding';

            // Update Chat Message to show Roadmap
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

          // Always update the latest file content (streaming in)
          for (let i = 1; i < parts.length; i++) {
            const fileBlock = parts[i];
            const lines = fileBlock.trim().split("\n");
            const fileName = lines[0].trim();

            // Capture content even if partial
            let content = lines.slice(1).join("\n")
              .replace(/^```html/, '')
              .replace(/^```/, '')
              .replace(/```$/, '');

            if (fileName) {
              setFiles(prev => ({
                ...prev,
                [fileName]: { name: fileName, language: 'html', content: content }
              }));

              // Set active file immediately so user sees it building
              setActiveFile(prev => prev || fileName);

              if (i === parts.length - 1) {
                setStatusMessage(`Designing ${fileName}...`);
              }
            }
          }

          // Only update progress & roadmap when a NEW file is discovered
          if (currentFileCount > lastFileCount) {
            lastFileCount = currentFileCount;

            // Mark completed files and set the current one as active
            setRoadmap(prevRoadmap => {
              const completedIdx = currentFileCount - 1; // files are 0-based, last completed
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

      setStatus('completed');
      setStatusMessage('Build Finished');
      setProgress(100);

      const finalRoadmap = roadmap.map(item => ({ ...item, status: 'completed' as const } as RoadmapItem));
      setRoadmap(finalRoadmap);

      updateAiMessage({
        text: "Build complete! I've generated the files based on the roadmap.",
        isStreaming: false,
        statusPhase: 'done',
        roadmap: finalRoadmap
      });

    } catch (e: any) {
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

      // Convert rendered DOM → Figma Plugin API script with auto-layout
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

        <button
          onClick={startBuild}
          disabled={status === 'planning' || status === 'coding' || !prompt}
          className={`flex items-center gap-2 bg-gradient-to-r from-indigo-400 to-indigo-600 hover:from-indigo-500 hover:to-indigo-700 text-white font-bold shadow-xl shadow-indigo-200 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${isCompact ? 'p-2 rounded-xl' : 'px-6 py-3 rounded-2xl text-sm'}`}
        >
          {status === 'planning' || status === 'coding' ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {(!isCompact || Object.keys(files).length > 0) && <span className={isCompact ? 'hidden' : ''}>{Object.keys(files).length > 0 ? "Update" : "Build"}</span>}
              <Play className="w-4 h-4 fill-current" />
            </>
          )}
        </button>
      </div>
    </div>
  );

  // --- RENDER: STEP 1 (TEMPLATE SELECTION) ---
  if (step === 'selection') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center px-8 md:px-12 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">AI Architect Studio</h1>
          </div>
          {/* History Button on Selection Page */}
          <button
            onClick={() => { setStep('studio'); setActiveTab('history'); }}
            className="text-slate-500 hover:text-indigo-600 font-medium text-sm flex items-center gap-2"
          >
            <History className="w-4 h-4" /> History
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="max-w-6xl w-full">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Choose Your Foundation</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                Select a Design DNA to guide the AI's architectural decisions. This determines the visual language, spacing, and component behavior.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Upload Card */}
              <div
                onClick={() => document.getElementById('template-upload-landing')?.click()}
                className="group relative cursor-pointer h-64 rounded-2xl border-2 border-dashed border-slate-300 bg-white hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center text-center gap-4 shadow-sm hover:shadow-md"
              >
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Upload Custom DNA</h3>
                  <p className="text-sm text-slate-400 mt-1 px-4">Import your own HTML/CSS structure</p>
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
              {PRESET_TEMPLATES.map((tmpl, idx) => (
                <div
                  key={idx}
                  onClick={() => handleTemplateSelect(tmpl)}
                  className="group relative cursor-pointer h-64 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-500/50 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute top-0 left-0 right-0 h-32 bg-slate-100 border-b border-slate-100 flex items-center justify-center group-hover:bg-indigo-50/50 transition-colors">
                    {/* Live Preview of Template */}
                    <div className="w-full h-full relative overflow-hidden">
                      <TemplateThumbnail template={tmpl} />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-20 bg-white/95 backdrop-blur-sm border-t border-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{tmpl.name}</h3>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2">{tmpl.description}</p>
                    <div className="mt-4 flex items-center text-indigo-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all">
                      {isLoadingTemplate && selectedTemplate.name === tmpl.name ? (
                        <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Loading...</span>
                      ) : (
                        <span className="flex items-center gap-1">Select Template <ArrowRight className="w-4 h-4 ml-1" /></span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- RENDER: STEP 2 (STUDIO WORKSPACE) ---
  return (
    <div className="flex h-screen w-full bg-white text-slate-900 overflow-hidden font-sans">

      {/* Sidebar: Primary Navigation */}
      <aside className="w-20 bg-white border-r border-slate-100 flex flex-col items-center py-6 gap-8 z-50">
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

      {/* Sidebar: Secondary (Contextual) */}
      <aside className="w-80 bg-white border-r border-slate-100 flex flex-col z-40 transition-all duration-300">

        {/* Chat Tab (NOW PRIMARY) */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full animate-in slide-in-from-left-4 fade-in duration-300">
            <div className="p-6 border-b border-slate-50 bg-white z-10 sticky top-0 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-500" /> Architect Chat
              </h3>
              <div className="flex items-center gap-2">

                <button onClick={handleNewChat} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> New
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
            <div className="p-6 border-b border-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Layout className="w-4 h-4 text-indigo-500" /> Template Gallery
              </h3>
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
            <div className="p-6 border-b border-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500" /> Project History
              </h3>
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
                      <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{session.title}</h4>
                      <button
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="text-slate-300 hover:text-red-500 p-1 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
      <main className="flex-1 flex flex-col relative  bg-white">

        {/* Header - PERSISTENT TOP BAR */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <div
              onClick={() => setStep('selection')}
              className="group flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
            >
              <Layout className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-tight truncate max-w-[150px]">{selectedTemplate.name}</span>
              <span className="hidden group-hover:inline text-[10px] text-indigo-400 ml-1">Change</span>
            </div>

            {/* Enhanced Active Task Indicator */}
            <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>

            <div className="flex flex-col">
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

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl mr-4">
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
              <div className="relative">
                <button
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <span>Export</span>
                  <ChevronDown className="w-4 h-4" />
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
              <div className="flex flex-col items-center justify-center flex-1 text-center p-20">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 animate-pulse">
                  <Wand2 className="w-10 h-10 text-indigo-500" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-800">Mission Control</h2>
                <p className="text-slate-500 mt-3 max-w-md">
                  DNA: <span className="font-semibold text-indigo-600">{selectedTemplate.name}</span> selected.
                  <br />
                  Enter your prompt below to start building.
                </p>
              </div>
            )}

            {/* 2. LOADING / ARCHITECTING STATE (Before first file) */}
            {(status === 'planning' || (status === 'coding' && !activeFile)) && (
              <div className="flex flex-col items-center justify-center flex-1 p-10 space-y-6">
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
              <div className="flex-1 min-h-0 w-full flex flex-col bg-white">
                {/* File Tabs */}
                <div className="bg-slate-50 border-b border-slate-100 px-2 pt-2 flex gap-1 overflow-x-auto shrink-0">
                  {Object.values(files).map((f) => (
                    <button
                      key={f.name}
                      onClick={() => setActiveFile(f.name)}
                      className={`px-4 py-2 rounded-t-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${activeFile === f.name ? 'bg-white text-indigo-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      {f.name}
                    </button>
                  ))}
                  {/* Streaming indicator tab */}
                  {(status === 'coding') && (
                    <div className="px-3 py-2 flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
                      <Terminal className="w-3 h-3" />
                      <span>Generating...</span>
                    </div>
                  )}
                </div>
                {/* Iframe Preview */}
                <div className="flex-1 min-h-0 relative">
                  <iframe
                    title="preview"
                    srcDoc={files[activeFile].content}
                    className="absolute inset-0 w-full h-full border-none bg-white"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Command Center (The Smart Input) - Hidden after start */}
        {!hasStarted && (
          <div className="absolute bottom-8 left-0 right-0 px-8 pointer-events-none z-50">
            <div className="max-w-4xl mx-auto backdrop-blur-xl bg-white/80 p-3 rounded-3xl shadow-2xl pointer-events-auto border border-slate-200 ring-1 ring-slate-100">
              {renderInputForm(false)}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
