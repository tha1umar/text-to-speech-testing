import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BOOK_TITLE, CHAPTERS } from './constants';
import { Chapter, PlayerState, VoiceName } from './types';
import { generateSpeech } from './services/geminiService';
import { decodeBase64, decodeRawPcmData } from './services/audioUtils';
import { PlayIcon, PauseIcon, AudioWaveIcon, BookOpenIcon } from './components/Icons';

const App: React.FC = () => {
  const [currentChapter, setCurrentChapter] = useState<Chapter>(CHAPTERS[0]);
  const [playerState, setPlayerState] = useState<PlayerState>(PlayerState.IDLE);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  
  // Audio context refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  // Cache for generated audio buffers to avoid re-fetching same chapter
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map());

  // Initialize Audio Context lazily (browser requirement)
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000 // Matching model output
      });
    }
    return audioContextRef.current;
  };

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    setPlayerState(PlayerState.IDLE);
  }, []);

  const playAudioBuffer = useCallback(async (buffer: AudioBuffer) => {
    const ctx = getAudioContext();
    
    // Resume context if suspended (common browser policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    stopAudio(); // Ensure previous audio is stopped

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
        setPlayerState(PlayerState.IDLE);
        sourceNodeRef.current = null;
    };

    sourceNodeRef.current = source;
    source.start();
    setPlayerState(PlayerState.PLAYING);
  }, [stopAudio]);

  const handlePlay = async () => {
    // Case 1: Resume logic is tricky with raw buffers without tracking time manually.
    // For simplicity/reliability with this specific API pattern, we restart or play from cached.
    // If we are already playing, we stop (Toggle behavior).
    if (playerState === PlayerState.PLAYING) {
      stopAudio();
      return;
    }

    // Case 2: Check cache
    const cacheKey = `${currentChapter.id}-${selectedVoice}`;
    if (bufferCache.current.has(cacheKey)) {
      await playAudioBuffer(bufferCache.current.get(cacheKey)!);
      return;
    }

    // Case 3: Fetch and Generate
    setPlayerState(PlayerState.LOADING);
    try {
      const base64Data = await generateSpeech(currentChapter.content, selectedVoice);
      
      if (!base64Data) {
        throw new Error("No audio data received");
      }

      const rawBytes = decodeBase64(base64Data);
      const ctx = getAudioContext();
      const audioBuffer = await decodeRawPcmData(rawBytes, ctx);
      
      // Cache it
      bufferCache.current.set(cacheKey, audioBuffer);
      
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error(error);
      setPlayerState(PlayerState.ERROR);
      setTimeout(() => setPlayerState(PlayerState.IDLE), 3000);
    }
  };

  // Stop audio when switching chapters
  useEffect(() => {
    stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-900/20">
             <BookOpenIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-wide">{BOOK_TITLE}</h1>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Immersive Reader</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <label className="hidden sm:flex items-center gap-2 text-sm text-zinc-400">
             <span>Narrator:</span>
             <select 
               value={selectedVoice}
               onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
               disabled={playerState === PlayerState.PLAYING || playerState === PlayerState.LOADING}
               className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
             >
               <option value="Kore">Kore (Soothing)</option>
               <option value="Fenrir">Fenrir (Deep)</option>
               <option value="Puck">Puck (Playful)</option>
               <option value="Zephyr">Zephyr (Calm)</option>
             </select>
           </label>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (Chapter List) - Hidden on mobile, toggleable or strictly desktop for now to keep it simple */}
        <aside className="hidden md:flex w-72 flex-col border-r border-zinc-800 bg-zinc-950/50 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase mb-4 tracking-widest">Chapters</h3>
            <nav className="space-y-1">
              {CHAPTERS.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => setCurrentChapter(chapter)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    currentChapter.id === chapter.id
                      ? 'bg-zinc-800 text-indigo-400 border-l-2 border-indigo-500'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  {chapter.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative scroll-smooth">
           {/* Mobile Chapter Select */}
           <div className="md:hidden p-4 sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 z-10">
             <select 
               value={currentChapter.id} 
               onChange={(e) => {
                 const ch = CHAPTERS.find(c => c.id === e.target.value);
                 if (ch) setCurrentChapter(ch);
               }}
               className="w-full bg-zinc-900 text-zinc-100 p-3 rounded-lg border border-zinc-800 focus:ring-2 focus:ring-indigo-500 outline-none"
             >
               {CHAPTERS.map(ch => (
                 <option key={ch.id} value={ch.id}>{ch.title}</option>
               ))}
             </select>
           </div>

           <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
              <div className="prose prose-invert prose-lg md:prose-xl prose-zinc max-w-none">
                <h2 className="text-3xl md:text-4xl font-serif font-light text-zinc-100 mb-8 border-b border-zinc-800 pb-4">
                  {currentChapter.title.split(':')[1]}
                  <span className="block text-base font-sans text-indigo-500 mt-2 font-bold uppercase tracking-widest">
                    {currentChapter.title.split(':')[0]}
                  </span>
                </h2>
                
                <div className="font-serif leading-relaxed text-zinc-300 space-y-6 whitespace-pre-wrap">
                  {currentChapter.content}
                </div>
              </div>
              
              {/* Spacer for sticky footer */}
              <div className="h-32"></div>
           </div>
        </main>
      </div>

      {/* Sticky Audio Player */}
      <div className="h-24 border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-lg flex items-center justify-between px-6 md:px-12 absolute bottom-0 w-full z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        
        <div className="flex flex-col">
          <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">Now Reading</span>
          <span className="text-sm md:text-base font-medium text-zinc-100 truncate max-w-[200px] md:max-w-md">
            {currentChapter.title}
          </span>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-6">
          {playerState === PlayerState.ERROR ? (
             <div className="text-red-400 text-sm font-medium bg-red-400/10 px-4 py-2 rounded-full animate-pulse">
               Error Loading Audio
             </div>
          ) : (
            <button 
              onClick={handlePlay}
              disabled={playerState === PlayerState.LOADING}
              className={`
                group relative flex items-center justify-center w-14 h-14 rounded-full 
                bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 
                transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed
              `}
            >
              {playerState === PlayerState.LOADING && (
                <div className="absolute inset-0 border-4 border-indigo-300/30 border-t-white rounded-full animate-spin"></div>
              )}
              
              {playerState === PlayerState.PLAYING ? (
                <PauseIcon className="w-6 h-6 fill-current" />
              ) : (
                <PlayIcon className="w-6 h-6 fill-current ml-1" />
              )}
            </button>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
           {playerState === PlayerState.PLAYING && (
             <div className="flex items-center gap-1 h-6">
               <div className="w-1 bg-indigo-500 animate-[music_1s_ease-in-out_infinite] h-3"></div>
               <div className="w-1 bg-indigo-400 animate-[music_1.2s_ease-in-out_infinite] h-5"></div>
               <div className="w-1 bg-indigo-600 animate-[music_0.8s_ease-in-out_infinite] h-4"></div>
               <div className="w-1 bg-indigo-500 animate-[music_1.1s_ease-in-out_infinite] h-2"></div>
             </div>
           )}
           <AudioWaveIcon className={`w-6 h-6 ${playerState === PlayerState.PLAYING ? 'text-indigo-400' : 'text-zinc-600'}`} />
        </div>
      </div>
      
      {/* Keyframes for visualizer */}
      <style>{`
        @keyframes music {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
};

export default App;