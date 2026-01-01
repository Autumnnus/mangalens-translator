
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ProcessedImage, TranslationSettings, TextBubble, UsageMetadata } from './types';
import { GeminiService } from './services/gemini';
import { createTranslatedImage } from './utils/image';
import { extractImagesFromPdf } from './utils/pdf';

declare const JSZip: any;
declare const saveAs: any;

const INPUT_COST_PER_1K = 0.00125;
const OUTPUT_COST_PER_1K = 0.005;

const App: React.FC = () => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [settings, setSettings] = useState<TranslationSettings>({
    targetLanguage: 'Turkish',
    fontSize: 24, // Increased base size, logic will downscale if needed
    fontColor: '#000000', 
    backgroundColor: '#ffffff', 
    strokeColor: '#ffffff' 
  });
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const geminiService = useRef(new GeminiService());

  const totalStats = useMemo(() => {
    return images.reduce((acc, img) => ({
      tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
      cost: acc.cost + (img.cost || 0)
    }), { tokens: 0, cost: 0 });
  }, [images]);

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000) * INPUT_COST_PER_1K;
    const outputCost = (usage.candidatesTokenCount / 1000) * OUTPUT_COST_PER_1K;
    return inputCost + outputCost;
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Error converting URL to Base64:", url, e);
      throw e;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let newImages: ProcessedImage[] = [];
    for (const file of Array.from(files) as File[]) {
      if (file.type === 'application/pdf') {
        try {
          const extracted = await extractImagesFromPdf(file);
          newImages.push(...extracted.map((img) => ({
            id: Math.random().toString(36).substring(2, 11),
            fileName: img.name,
            originalUrl: img.url,
            translatedUrl: null,
            status: 'idle' as const,
            bubbles: []
          })));
        } catch (err) {
          console.error("PDF extraction failed", err);
        }
      } else {
        newImages.push({
          id: Math.random().toString(36).substring(2, 11),
          fileName: file.name,
          originalUrl: URL.createObjectURL(file),
          translatedUrl: null,
          status: 'idle' as const,
          bubbles: []
        });
      }
    }

    setImages(prev => [...prev, ...newImages]);
    e.target.value = '';
  };

  const processImage = async (image: ProcessedImage, retryCount = 0): Promise<boolean> => {
    setImages(prev => prev.map(img => 
      img.id === image.id ? { ...img, status: 'processing' } : img
    ));

    try {
      const base64 = await urlToBase64(image.originalUrl);
      const { bubbles, usage } = await geminiService.current.translateImage(base64, settings.targetLanguage);
      const translatedUrl = await createTranslatedImage(image.originalUrl, bubbles, settings);
      const cost = calculateCost(usage);

      setImages(prev => prev.map(img => 
        img.id === image.id ? { 
          ...img, 
          status: 'completed', 
          bubbles, 
          translatedUrl,
          usage,
          cost
        } : img
      ));
      return true;
    } catch (error: any) {
      const errorStr = (error?.message || '').toLowerCase();
      const isRateLimit = errorStr.includes('429') || errorStr.includes('limit') || errorStr.includes('quota');
      
      if (isRateLimit && retryCount < 8) {
        const backoff = Math.pow(2, retryCount) * 2000;
        console.warn(`Rate limit hit for ${image.fileName}. Retrying in ${backoff/1000}s... (Attempt ${retryCount + 1})`);
        await new Promise(r => setTimeout(r, backoff));
        return processImage(image, retryCount + 1);
      }

      console.error("Processing failed for", image.fileName, error);
      setImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, status: 'error' } : img
      ));
      return false;
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const image of images) {
      if (image.status === 'idle' || image.status === 'error') {
        await processImage(image);
      }
    }
    setIsProcessingAll(false);
  };

  const downloadSingle = async (image: ProcessedImage) => {
    const url = image.translatedUrl || image.originalUrl;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `translated_${image.fileName}`);
    } catch (e) {
      console.error("Single download failed:", e);
    }
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    const newImages = [...images];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
    setImages(newImages);
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder("translated_manga");
    
    const promises = images.map(async (img, idx) => {
      try {
        const targetUrl = img.translatedUrl || img.originalUrl;
        const base64Data = await urlToBase64(targetUrl);
        const extension = img.fileName.split('.').pop() || 'jpg';
        const paddedIndex = (idx + 1).toString().padStart(3, '0');
        folder.file(`${paddedIndex}_${img.fileName.split('.')[0]}.${extension}`, base64Data, { base64: true });
      } catch (e) {
        console.error(`Failed to add ${img.fileName} to ZIP:`, e);
      }
    });

    await Promise.all(promises);
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "mangalens_export.zip");
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const imgToRemove = prev.find(img => img.id === id);
      if (imgToRemove?.originalUrl.startsWith('blob:')) URL.revokeObjectURL(imgToRemove.originalUrl);
      return prev.filter(img => img.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach(img => {
      if (img.originalUrl.startsWith('blob:')) URL.revokeObjectURL(img.originalUrl);
    });
    setImages([]);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans">
      <header className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800 p-4 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-tr from-indigo-600 to-fuchsia-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/30">
              <i className="fas fa-eye-low-vision text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase leading-none italic">
                Manga<span className="text-indigo-400">Lens</span> <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold not-italic">v3.3</span>
              </h1>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Cost</span>
                  <span className="text-[10px] font-black text-emerald-400 font-mono">${totalStats.cost.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tokens</span>
                  <span className="text-[10px] font-black text-indigo-400 font-mono">{totalStats.tokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={processAll}
              disabled={isProcessingAll || images.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl shadow-indigo-500/20 text-xs uppercase tracking-wider"
            >
              {isProcessingAll ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
              {isProcessingAll ? 'Translating...' : 'Translate All'}
            </button>

            {images.length > 0 && (
              <button 
                onClick={downloadAllAsZip}
                className="bg-slate-100 text-slate-900 hover:bg-white px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl text-xs uppercase tracking-wider transition-all"
              >
                <i className="fas fa-archive"></i> Download ZIP
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[65vh] rounded-[4rem] border-4 border-dashed border-slate-800/50 bg-slate-900/10 group transition-all duration-700 hover:border-indigo-500/40">
            <div className="mb-10 relative">
              <div className="absolute inset-0 bg-indigo-500 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center shadow-2xl relative z-10 border border-slate-700 group-hover:scale-110 transition-transform">
                <i className="fas fa-plus text-4xl text-indigo-400"></i>
              </div>
            </div>
            <h2 className="text-4xl font-black mb-4 text-center tracking-tighter">Manga Translator</h2>
            <p className="text-slate-500 mb-10 max-w-sm text-center font-bold leading-relaxed">
              Upload manga panels. v3.3 features auto-font scaling to fit detected bubbles perfectly.
            </p>
            <label className="cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all px-16 py-5 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-500/40">
              <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />
              GET STARTED
            </label>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-end mb-10 px-2">
              <div>
                <h3 className="text-3xl font-black tracking-tighter uppercase mb-2">Editor Workspace</h3>
                <p className="text-slate-500 font-bold text-sm tracking-wide">
                  {images.length} items • Auto-fit geometry protection active.
                </p>
              </div>
              <div className="flex gap-4">
                 <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase flex items-center gap-2">
                  <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFileUpload} />
                  <i className="fas fa-plus-circle"></i> Append More
                </label>
                <button onClick={clearAll} className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all border border-red-500/20 uppercase">
                  Wipe All
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {images.map((image, idx) => (
                <div key={image.id} className="group bg-slate-900/40 rounded-[2rem] border border-slate-800/60 overflow-hidden shadow-2xl flex flex-col hover:border-indigo-500/50 transition-all duration-300">
                  <div className="relative aspect-[3/4] overflow-hidden bg-slate-800">
                    <img 
                      src={image.translatedUrl || image.originalUrl} 
                      alt={image.fileName}
                      onClick={() => setSelectedImageUrl(image.translatedUrl || image.originalUrl)}
                      className="w-full h-full object-contain transition-all duration-500 cursor-zoom-in group-hover:scale-105"
                    />
                    
                    <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md w-10 h-10 flex items-center justify-center rounded-xl font-black text-indigo-400 border border-slate-700 shadow-xl z-10">
                      {idx + 1}
                    </div>

                    <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border z-10 ${
                      image.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                      image.status === 'processing' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {image.status}
                    </div>

                    {image.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="font-black text-[10px] text-indigo-400 uppercase tracking-[0.2em]">Processing Geometry</p>
                      </div>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
                      <button 
                        onClick={(e) => { e.stopPropagation(); downloadSingle(image); }}
                        className="w-16 h-16 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all scale-75 group-hover:scale-100 border border-white/20 pointer-events-auto shadow-2xl"
                        title="Download this page"
                      >
                        <i className="fas fa-download text-2xl"></i>
                      </button>
                    </div>

                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <button onClick={() => moveImage(idx, 'up')} disabled={idx === 0} className="w-10 h-10 bg-slate-800 hover:bg-indigo-600 disabled:bg-slate-900 rounded-xl flex items-center justify-center transition-colors border border-slate-700"><i className="fas fa-chevron-up"></i></button>
                      <button onClick={() => moveImage(idx, 'down')} disabled={idx === images.length - 1} className="w-10 h-10 bg-slate-800 hover:bg-indigo-600 disabled:bg-slate-900 rounded-xl flex items-center justify-center transition-colors border border-slate-700"><i className="fas fa-chevron-down"></i></button>
                    </div>

                    <button 
                      onClick={() => removeImage(image.id)}
                      className="absolute bottom-4 left-4 w-10 h-10 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0 border border-red-500/30"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>

                  <div className="p-5 bg-slate-900/80 border-t border-slate-800 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-black truncate text-slate-300 pr-2">{image.fileName}</p>
                      {image.cost && <span className="text-[10px] font-bold text-emerald-400 font-mono">${image.cost.toFixed(4)}</span>}
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800/50">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">Session</span>
                        <span className="text-[10px] font-bold text-slate-400">{image.usage?.totalTokenCount || 0} tokens</span>
                      </div>
                      {(image.status === 'idle' || image.status === 'error') && (
                        <button onClick={() => processImage(image)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95">
                          {image.status === 'error' ? 'Retry' : 'Run'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/50 p-6 rounded-[2.5rem] shadow-2xl flex items-center gap-12 backdrop-blur-2xl border-t border-t-white/5 max-w-[95vw] overflow-x-auto">
        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">Target</label>
          <select value={settings.targetLanguage} onChange={(e) => setSettings(s => ({ ...s, targetLanguage: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-black focus:ring-2 ring-indigo-500 outline-none text-indigo-300">
            <option value="Turkish">Turkish</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="Japanese">Japanese</option>
            <option value="French">French</option>
            <option value="German">German</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">Max Font Size</label>
          <div className="flex items-center gap-4">
            <input type="range" min="10" max="60" value={settings.fontSize} onChange={(e) => setSettings(s => ({ ...s, fontSize: parseInt(e.target.value) }))} className="w-32 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            <span className="text-xs font-mono font-black text-indigo-400">{settings.fontSize}px</span>
          </div>
        </div>
        
        <div className="h-12 w-[1px] bg-slate-800"></div>

        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">Appearance</label>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <input type="color" value={settings.fontColor} onChange={(e) => setSettings(s => ({ ...s, fontColor: e.target.value }))} className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110" title="Text Color" />
              <span className="text-[8px] uppercase font-black text-slate-500">Font</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input type="color" value={settings.strokeColor === 'transparent' ? '#000000' : settings.strokeColor} onChange={(e) => setSettings(s => ({ ...s, strokeColor: e.target.value }))} className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110" title="Stroke Color" />
              <span className="text-[8px] uppercase font-black text-slate-500">Stroke</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input type="color" value={settings.backgroundColor === 'transparent' ? '#000000' : settings.backgroundColor} onChange={(e) => setSettings(s => ({ ...s, backgroundColor: e.target.value }))} className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110" title="Background Color" />
              <span className="text-[8px] uppercase font-black text-slate-500">Bubble</span>
            </div>
          </div>
        </div>
      </div>

      {selectedImageUrl && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 cursor-zoom-out" onClick={() => setSelectedImageUrl(null)}>
          <div className="relative max-w-full max-h-full animate-in zoom-in-95 duration-300">
            <img src={selectedImageUrl} className="max-w-full max-h-[90vh] rounded-xl shadow-2xl border border-slate-800" alt="Preview" />
            <button className="absolute -top-12 right-0 text-white text-3xl hover:text-indigo-400 transition-colors"><i className="fas fa-times"></i></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
