import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { languageForPath } from "./languages";
import { useRemoteCursorStyles } from "./useRemoteCursorStyles";

interface MonacoFileEditorProps {
  path: string;
  doc: Y.Doc;
  provider: WebsocketProvider;
  readOnly: boolean;
  onCursorMove: (line: number, column: number) => void;
}

export function MonacoFileEditor({ path, doc, provider, readOnly, onCursorMove }: MonacoFileEditorProps) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  useRemoteCursorStyles(provider.awareness);

  const handleMount: OnMount = (editor) => {
    const model = editor.getModel();
    if (!model) return;
    bindingRef.current = new MonacoBinding(doc.getText("content"), model, new Set([editor]), provider.awareness);
    editor.onDidChangeCursorPosition((e) => onCursorMove(e.position.lineNumber, e.position.column));
  };

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [path]);

  return (
    <Editor
      key={path}
      path={path}
      defaultLanguage={languageForPath(path)}
      theme="vs-dark"
      options={{
        readOnly,
        minimap: { enabled: true },
        fontSize: 13,
        automaticLayout: true,
      }}
      onMount={handleMount}
    />
  );
}
