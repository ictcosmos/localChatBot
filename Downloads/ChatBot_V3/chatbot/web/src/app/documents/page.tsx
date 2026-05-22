"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, FileText, Trash2, RefreshCw, AlertCircle, CheckCircle, 
  Clock, HardDrive, FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

interface Document {
  documentId: string;
  fileName: string;
  fileUrl?: string;
  storagePath: string;
  uploadedAt: string;
  embeddingStatus: "pending" | "completed" | "failed";
  summary?: string;
  pageCount?: number;
  fileSize?: number;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { user, idToken, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Redirect if not signed in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (idToken) {
      fetchDocuments();
    }
  }, [idToken]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/documents`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load documents.");
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      toast.error("Error fetching uploaded documents.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document? This will remove all its text fragments and searchable embeddings permanently.")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete document.");
      
      setDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
      toast.success("Document successfully deleted.");
    } catch (err: any) {
      toast.error("Failed to delete document.");
    }
  };

  const handleRetry = async (documentId: string) => {
    setRetryingId(documentId);
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${documentId}/retry`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to re-trigger processing.");
      
      toast.success("Ingestion pipeline restarted!");
      
      // Update state to pending
      setDocuments((prev) =>
        prev.map((d) => (d.documentId === documentId ? { ...d, embeddingStatus: "pending" } : d))
      );
      
      // Trigger a polling check or fetch documents
      setTimeout(fetchDocuments, 2000);
    } catch (err: any) {
      toast.error("Failed to retry ingestion.");
    } finally {
      setRetryingId(null);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-100 p-6 md:p-12 overflow-x-hidden">
      {/* Ambient background blur */}
      <div className="absolute top-10 left-1/4 h-96 w-96 rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 h-96 w-96 rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      <div className="max-w-4xl mx-auto w-full z-10">
        {/* Header navigation bar */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-900 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/chat">
              <button className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800">
                <ArrowLeft size={18} />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                My Documents
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Ingest, search, and delete document embeddings</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchDocuments} className="flex items-center gap-1.5 border-slate-800">
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            <span>Sync</span>
          </Button>
        </div>

        {/* Ingested documents list */}
        {isLoading && documents.length === 0 ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800/80 rounded-2xl p-8 backdrop-blur-sm">
            <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <HardDrive size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-300">No documents ingested</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
              Go to the chat workspace and upload PDF, DOCX, or TXT documents using the clip icon.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((doc) => (
              <div 
                key={doc.documentId} 
                className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 hover:border-slate-800 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4 backdrop-blur-sm animate-fadeIn"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-indigo-400 mt-1 flex-shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-bold text-slate-200 truncate">{doc.fileName}</h3>
                    
                    {/* Meta stats banner */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-500" />
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>{formatSize(doc.fileSize)}</span>
                      {doc.pageCount && (
                        <>
                          <span>•</span>
                          <span>{doc.pageCount} pages</span>
                        </>
                      )}
                    </div>

                    {/* summary preview */}
                    {doc.embeddingStatus === "completed" && doc.summary && (
                      <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-900/60 leading-relaxed italic">
                        &ldquo;{doc.summary}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* status / Action elements */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-3 mt-2 md:mt-0 flex-shrink-0">
                  {/* status indicator */}
                  {doc.embeddingStatus === "completed" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle size={12} />
                      <span>Ready</span>
                    </span>
                  )}
                  {doc.embeddingStatus === "pending" && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 animate-pulse">
                      <Clock size={12} className="animate-spin" />
                      <span>Processing</span>
                    </span>
                  )}
                  {doc.embeddingStatus === "failed" && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                      <AlertCircle size={12} />
                      <span>Failed</span>
                    </span>
                  )}

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2">
                    {doc.embeddingStatus === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(doc.documentId)}
                        isLoading={retryingId === doc.documentId}
                        className="py-1 px-2.5 h-auto text-xs border-rose-500/20 text-rose-400 hover:bg-rose-950/20 hover:text-rose-300"
                      >
                        Retry
                      </Button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.documentId)}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg transition-all"
                      title="Delete document"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
