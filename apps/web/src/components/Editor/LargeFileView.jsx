/* eslint-disable no-unused-vars */
/**
 * @file LargeFileView.jsx
 * @description Per V3 ADR #5: files flagged as binary=true bypass Monaco and show this view.
 * Handles images (renders preview), other binaries (shows hash + download).
 */

import React, { useEffect, useState } from 'react';
import { Download, FileImage, File, AlertTriangle } from 'lucide-react';
import { blobStore } from '../../services/blobStore.js';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { memfs } from '../../services/memfsService.js';

const IMAGE_EXTS  = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','ico']);
const AUDIO_EXTS  = new Set(['mp3','wav','ogg','flac','m4a']);
const VIDEO_EXTS  = new Set(['mp4','webm','mov','avi']);

function getExt(path) { return (path || '').split('.').pop().toLowerCase(); }

function humanSize(bytes) {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function LargeFileView({ path }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [blobInfo, setBlobInfo]   = useState(null);
  const [error, setError]         = useState(null);

  const ext        = getExt(path);
  const isImage    = IMAGE_EXTS.has(ext);
  const isAudio    = AUDIO_EXTS.has(ext);
  const isVideo    = VIDEO_EXTS.has(ext);
  const isRenderable = isImage || isAudio || isVideo;

  useEffect(() => {
    if (!path) return;
    let url = null;

    (async () => {
      try {
        // Get FileNode to retrieve blobId
        const loc = memfs._traverse(path);
        if (!loc) { setError('File node not found.'); return; }
        const node = loc.parentNode?.children.get(loc.nodeName);
        if (!node) { setError('File node not found.'); return; }

        const blobId = node.blobId;
        const hash   = node.hash;

        const content = await blobStore.get(blobId);
        const byteLen = typeof content === 'string'
          ? new TextEncoder().encode(content).length
          : content.byteLength;

        setBlobInfo({ blobId, hash, byteLen });

        if (isRenderable) {
          const mimeMap = {
            svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
            jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
            bmp: 'image/bmp', ico: 'image/x-icon',
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
            mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
          };
          const mime = mimeMap[ext] || 'application/octet-stream';
          const blob = content instanceof ArrayBuffer
            ? new Blob([content], { type: mime })
            : new Blob([new TextEncoder().encode(content)], { type: mime });
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      } catch (err) {
        setError(err.message);
      }
    })();

    return () => { if (url) URL.revokeObjectURL(url); };
  }, [path]);

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = path.split('/').pop();
    a.click();
  };

  const filename = path?.split('/').pop() ?? '';

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, gap: 24,
      background: 'var(--panel-bg)',
      color: 'var(--text-secondary)',
      overflowY: 'auto',
    }}>
      {/* Icon */}
      <div style={{ opacity: 0.4 }}>
        {isImage
          ? <FileImage size={64} strokeWidth={1} />
          : <File size={64} strokeWidth={1} />
        }
      </div>

      {/* Filename */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          {filename}
        </div>
        {blobInfo && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {humanSize(blobInfo.byteLen)} · {ext.toUpperCase()}
          </div>
        )}
      </div>

      {/* Image preview */}
      {isImage && objectUrl && (
        <div style={{
          maxWidth: 480, maxHeight: 320, overflow: 'hidden',
          border: '1px solid var(--panel-border)', borderRadius: 10,
          background: 'repeating-conic-gradient(#1a2035 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
        }}>
          <img
            src={objectUrl}
            alt={filename}
            style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}

      {/* Audio player */}
      {isAudio && objectUrl && (
        <audio controls src={objectUrl} style={{ width: 320 }} />
      )}

      {/* Video player */}
      {isVideo && objectUrl && (
        <video controls src={objectUrl} style={{ maxWidth: 480, maxHeight: 280, borderRadius: 8 }} />
      )}

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--red)', fontSize: 13,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px',
        }}>
          <AlertTriangle size={14} strokeWidth={2} />
          {error}
        </div>
      )}

      {/* Hash info */}
      {blobInfo && (
        <div style={{
          background: 'rgba(0,0,0,0.25)', border: '1px solid var(--panel-border)',
          borderRadius: 8, padding: '12px 16px', width: '100%', maxWidth: 480,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Content Hash (SHA-256)
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {blobInfo.hash}
          </div>
        </div>
      )}

      {/* Download button */}
      {objectUrl && (
        <button
          onClick={handleDownload}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--accent-glow)', border: '1px solid var(--accent)',
            color: 'var(--accent)', borderRadius: 8, padding: '9px 20px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(34,211,238,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-glow)')}
        >
          <Download size={14} strokeWidth={2} />
          Download {filename}
        </button>
      )}

      {/* "Cannot edit" notice */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        borderTop: '1px solid var(--panel-border)', paddingTop: 12, textAlign: 'center',
        maxWidth: 360, lineHeight: 1.6,
      }}>
        Binary and large files are not editable in Monaco. Use the download button to save locally.
      </div>
    </div>
  );
}
