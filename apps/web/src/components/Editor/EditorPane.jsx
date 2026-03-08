import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore';
import { useAgentStore } from '../../stores/agentStore';
import { memfs } from '../../services/memfsService';

export default function EditorPane() {
  const { activeFile, markDirty, clearDirty } = useEditorStore();
  const socket = useAgentStore((state) => state.socket);
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const editorRef = useRef(null);

  // Load file content when activeFile changes
  useEffect(() => {
    if (!activeFile) {
      setContent('');
      return;
    }

    const loadContent = async () => {
      try {
        const fileContent = await memfs.readFile(activeFile);
        setContent(fileContent);

        // Simple language detection
        if (activeFile.endsWith('.md')) setLanguage('markdown');
        else if (activeFile.endsWith('.json')) setLanguage('json');
        else if (activeFile.endsWith('.css')) setLanguage('css');
        else if (activeFile.endsWith('.html')) setLanguage('html');
        else if (activeFile.endsWith('.ts') || activeFile.endsWith('.tsx'))
          setLanguage('typescript');
        else setLanguage('javascript');
      } catch (err) {
        console.error(`Failed to load ${activeFile} into editor:`, err);
        setContent(`// Error loading ${activeFile}\n// ${err.message}`);
      }
    };

    loadContent();
  }, [activeFile]);

  // Handle onChange
  const handleEditorChange = useCallback(
    (value) => {
      if (!activeFile) return;
      // 1. Update React state
      setContent(value || '');
      // 2. Mark dirty in UI
      markDirty(activeFile);
      // 3. Write to memfs (Tier 1) silently so AI sees immediate state
      memfs.writeFile(activeFile, value || '').catch((e) => console.error('memfs write err', e));
    },
    [activeFile, markDirty]
  );

  // Handle Ctrl+S / Meta+S
  const handleSave = useCallback(async () => {
    if (!activeFile || !socket) return;

    try {
      // 1. Get exact current value from Monaco/memfs
      const currentVal = editorRef.current?.getValue() || content;

      // 2. Write to real hard drive via socket
      socket.emit('fs:write', { path: activeFile, content: currentVal }, (response) => {
        if (!response.success) {
          console.error(`Failed to save ${activeFile} to disk:`, response.error);
        } else {
          console.log(`Saved ${activeFile} to disk.`);
          // 3. Clear dirty state
          clearDirty(activeFile);
        }
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [activeFile, socket, content, clearDirty]);

  // Bind Monaco instance and keyboard shortcuts
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Add Save Command (Ctrl+S / Cmd+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  };

  if (!activeFile) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080c14',
          color: '#475569',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚛️</div>
        <h2 style={{ fontWeight: 600, color: '#94a3b8' }}>Anti_GV Code Editor</h2>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
          Select a file from the explorer (or tell the AI to create one) to begin editing.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Editor Header (optional breadcrumbs etc) */}
      <div
        style={{
          padding: '4px 16px',
          fontSize: '0.75rem',
          color: '#64748b',
          background: '#0f172a',
        }}
      >
        {activeFile}
      </div>

      {/* Monaco Container */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            formatOnPaste: true,
          }}
        />
      </div>
    </div>
  );
}
