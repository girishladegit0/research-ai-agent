"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Paperclip, X, FileText, Image as ImageIcon, File } from "lucide-react";
import { parseFile, ParsedFile } from "@/lib/engine/file-parser";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: ParsedFile[]) => void;
  isLoading: boolean;
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  isLoading,
}: SearchInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<ParsedFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !isParsing) {
        onSubmit(attachedFiles);
        setAttachedFiles([]);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setIsParsing(true);
    
    const newFiles: ParsedFile[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      const file = e.target.files[i];
      try {
        const parsed = await parseFile(file);
        newFiles.push(parsed);
      } catch (err) {
        console.error("Error parsing file:", err);
        alert(`Failed to parse ${file.name}`);
      }
    }
    
    setAttachedFiles(prev => [...prev, ...newFiles]);
    setIsParsing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.length) {
      setIsParsing(true);
      const newFiles: ParsedFile[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        try {
          const parsed = await parseFile(file);
          newFiles.push(parsed);
        } catch (err) {
          console.error("Error parsing file:", err);
        }
      }
      setAttachedFiles(prev => [...prev, ...newFiles]);
      setIsParsing(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return <ImageIcon className="h-3 w-3" />;
    if (fileType.includes('pdf') || fileType.includes('text')) return <FileText className="h-3 w-3" />;
    return <File className="h-3 w-3" />;
  };

  return (
    <div className="w-full space-y-2">
      {/* File Previews */}
      <AnimatePresence>
        {attachedFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-wrap gap-2 px-1"
          >
            {attachedFiles.map((file, i) => (
              <div key={i} className="glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border border-border/50">
                {getFileIcon(file.fileType)}
                <span className="max-w-[150px] truncate">{file.fileName}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`relative transition-shadow duration-300 ${dragActive ? "border-primary/50 bg-primary/5 rounded-2xl" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={dragActive ? "Drop files here..." : "Ask anything or drop files..."}
          rows={1}
          disabled={isLoading}
          className="w-full resize-none bg-transparent px-10 py-3 pr-14 text-[15px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        
        {/* Upload Button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isParsing}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Attach File"
        >
          {isParsing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={() => {
            if (value.trim() && !isLoading && !isParsing) {
              onSubmit(attachedFiles);
              setAttachedFiles([]);
            }
          }}
          disabled={!value.trim() || isLoading || isParsing}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary to-secondary p-2.5 text-primary-foreground hover:from-secondary hover:to-secondary transition-all hover:glow-sm disabled:opacity-40"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </motion.div>
    </div>
  );
}
