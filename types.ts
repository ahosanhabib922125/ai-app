
export interface RoadmapItem {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

export interface GeneratedFile {
  name: string;
  language: string;
  content: string;
}

export interface ProjectState {
  roadmap: RoadmapItem[];
  files: Record<string, GeneratedFile>;
  status: 'idle' | 'planning' | 'coding' | 'completed';
  activeFile: string | null;
  progress: number;
}

export interface DesignTemplate {
  name: string;
  description: string;
  content?: string;
  path?: string;
}

export interface PageAnalysisItem {
  name: string;
  description: string;
  type: 'page' | 'subpage' | 'modal' | 'component';
  status?: 'pending' | 'active' | 'completed';
}

export interface PRDColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export interface PRDAnalysisResult {
  pages: PageAnalysisItem[];
  colors: PRDColors | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  attachments?: string[];
  // New fields for rich chat UI
  roadmap?: RoadmapItem[];
  pageAnalysis?: PageAnalysisItem[];
  isStreaming?: boolean;
  statusPhase?: 'analyzing' | 'planning' | 'coding' | 'done';
}

export interface ProjectSession {
  id: string;
  title: string; // Usually the first user prompt
  lastModified: number;
  template: DesignTemplate;
  chatHistory: ChatMessage[];
  roadmap: RoadmapItem[];
  files: Record<string, GeneratedFile>;
}
