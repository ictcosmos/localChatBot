"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  FileText,
  Loader2,
  LogOut,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

type Chat = {
  chatId: string;
  title: string;
  activeDocumentId?: string | null;
  lastMessage?: string;
};

type Message = {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  route?: string | null;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
  } | null;
  reasoningTrace?: any;
  documentId?: string | null;
  retrievedChunks?: any[];
};

type DocumentMeta = {
  documentId: string;
  fileName: string;
  embeddingStatus: string;
  summary?: string;
  pageCount?: number;
  fileSize?: number;
};

export default function ChatPage() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { user, idToken, loading, logout } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [activeDocument, setActiveDocument] = useState<DocumentMeta | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [processingText, setProcessingText] = useState("");

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/signin");
      return;
    }

    if (user && idToken) {
      loadChats();
    }
  }, [loading, user, idToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function apiFetch(path: string, options: RequestInit = {}) {
    if (!idToken) throw new Error("Missing Firebase ID token.");

    console.log("API CALL:", `${API_BASE_URL}${path}`);
    console.log("HAS TOKEN:", !!idToken);

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${idToken}`);

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      toast.error("Session expired. Please sign in again.");
      await logout();
      router.push("/signin");
      throw new Error("Unauthorized");
    }

    return res;
  }

  async function loadChats() {
    try {
      setIsLoadingChats(true);
      const res = await apiFetch("/chats");

      if (!res.ok) throw new Error("Failed to load chats.");

      const data = await res.json();
      setChats(data);

      if (data.length > 0 && !activeChatId) {
        setActiveChatId(data[0].chatId);
        await loadMessages(data[0].chatId);
        await loadActiveDocument(data[0]);
      }
    } catch (err: any) {
      console.error("LOAD CHATS ERROR:", err);
      toast.error(
        "Failed to connect to backend. Check FastAPI server and CORS/API URL."
      );
    } finally {
      setIsLoadingChats(false);
    }
  }

  async function loadMessages(chatId: string) {
    try {
      setIsLoadingMessages(true);
      const res = await apiFetch(`/chats/${chatId}/messages`);

      if (!res.ok) throw new Error("Failed to load messages.");

      const data = await res.json();
      setMessages(data);
    } catch (err: any) {
      console.error("LOAD MESSAGES ERROR:", err);
      toast.error(err?.message || "Failed to load messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function loadActiveDocument(chat: Chat) {
    setActiveDocument(null);

    if (!chat.activeDocumentId) return;

    try {
      const res = await apiFetch(`/documents/${chat.activeDocumentId}`);
      if (!res.ok) return;

      const data = await res.json();
      setActiveDocument(data);
    } catch (err) {
      console.error("LOAD ACTIVE DOCUMENT ERROR:", err);
      setActiveDocument(null);
    }
  }

  async function createNewChat() {
    try {
      const res = await apiFetch("/chats", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to create chat.");

      const data = await res.json();

      const newChat: Chat = {
        chatId: data.chatId,
        title: "New Chat",
        activeDocumentId: null,
        lastMessage: "",
      };

      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(data.chatId);
      setMessages([]);
      setActiveDocument(null);
    } catch (err: any) {
      console.error("CREATE CHAT ERROR:", err);
      toast.error(err?.message || "Failed to create chat.");
    }
  }

  async function selectChat(chat: Chat) {
    setActiveChatId(chat.chatId);
    await loadMessages(chat.chatId);
    await loadActiveDocument(chat);
  }

  async function deleteChat(chatId: string) {
    try {
      const res = await apiFetch(`/chats/${chatId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete chat.");

      const remaining = chats.filter((c) => c.chatId !== chatId);
      setChats(remaining);

      if (activeChatId === chatId) {
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].chatId);
          await loadMessages(remaining[0].chatId);
          await loadActiveDocument(remaining[0]);
        } else {
          setActiveChatId(null);
          setMessages([]);
          setActiveDocument(null);
        }
      }

      toast.success("Chat deleted.");
    } catch (err: any) {
      console.error("DELETE CHAT ERROR:", err);
      toast.error(err?.message || "Failed to delete chat.");
    }
  }

  async function ensureChat() {
    if (activeChatId) return activeChatId;

    const res = await apiFetch("/chats", {
      method: "POST",
    });

    if (!res.ok) throw new Error("Failed to create chat.");

    const data = await res.json();

    const newChat: Chat = {
      chatId: data.chatId,
      title: "New Chat",
      activeDocumentId: null,
      lastMessage: "",
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(data.chatId);
    return data.chatId;
  }

  async function sendMessage() {
    const clean = input.trim();
    if (!clean || isSending) return;

    try {
      setIsSending(true);
      const chatId = await ensureChat();

      const tempUserMessage: Message = {
        messageId: `temp-user-${Date.now()}`,
        role: "user",
        content: clean,
      };

      setMessages((prev) => [...prev, tempUserMessage]);
      setInput("");

      const res = await apiFetch("/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId,
          message: clean,
          activeDocumentId: activeDocument?.documentId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Message failed.");
      }

      const data = await res.json();

      const assistantMessage: Message = {
        messageId: data.messageId,
        role: "assistant",
        content: data.answer,
        route: data.route,
        tokenUsage: data.tokenUsage,
        reasoningTrace: data.reasoningTrace,
        documentId: activeDocument?.documentId || null,
        retrievedChunks: data.retrievedChunks || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);

      setChats((prev) =>
        prev.map((chat) =>
          chat.chatId === chatId
            ? {
                ...chat,
                lastMessage: data.answer?.slice(0, 120),
              }
            : chat
        )
      );
    } catch (err: any) {
      console.error("SEND MESSAGE ERROR:", err);
      toast.error(
        err?.message || "Failed to send message. Check backend terminal."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleFileUpload(file: File) {
    try {
      const chatId = await ensureChat();

      const allowed = [".pdf", ".docx", ".txt"];
      const lower = file.name.toLowerCase();

      if (!allowed.some((ext) => lower.endsWith(ext))) {
        toast.error("Only PDF, DOCX, and TXT files are allowed.");
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        toast.error("File must be less than 20 MB.");
        return;
      }

      setIsUploading(true);
      setProcessingText("Uploading document...");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("chatId", chatId);

      const res = await apiFetch("/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Upload failed.");
      }

      const data = await res.json();

      toast.success("Document uploaded. Processing started.");
      setProcessingText("Processing document...");

      const docId = data.documentId;

      setActiveDocument({
        documentId: docId,
        fileName: data.fileName,
        embeddingStatus: "pending",
      });

      setChats((prev) =>
        prev.map((chat) =>
          chat.chatId === chatId
            ? { ...chat, activeDocumentId: docId }
            : chat
        )
      );

      await pollDocument(docId);
    } catch (err: any) {
      console.error("UPLOAD ERROR:", err);
      toast.error(err?.message || "Upload failed.");
    } finally {
      setIsUploading(false);
      setProcessingText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function pollDocument(documentId: string) {
    for (let i = 0; i < 60; i++) {
      const res = await apiFetch(`/documents/${documentId}`);
      if (!res.ok) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const data = await res.json();
      setActiveDocument(data);

      if (data.embeddingStatus === "completed") {
        toast.success("Document is ready for questions.");
        return;
      }

      if (data.embeddingStatus === "failed") {
        toast.error(data.summary || "Document processing failed.");
        return;
      }

      setProcessingText(`Processing document... (${data.embeddingStatus})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    toast.error("Document processing timed out.");
  }

  async function handleLogout() {
    await logout();
    router.push("/signin");
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm text-neutral-600">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-neutral-100 text-neutral-950">
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } hidden shrink-0 overflow-hidden border-r border-neutral-200 bg-white transition-all duration-300 md:block`}
      >
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          isLoadingChats={isLoadingChats}
          onNewChat={createNewChat}
          onSelectChat={selectChat}
          onDeleteChat={deleteChat}
          onLogout={handleLogout}
          user={user}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((value) => !value)}
              className="rounded-xl p-2 hover:bg-neutral-100"
            >
              <Menu size={20} />
            </button>

            <div>
              <h1 className="text-sm font-bold">Local AI Chatbot</h1>
              <p className="text-xs text-neutral-500">
                Gemini + local RAG + Firestore history
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeDocument && (
              <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 sm:flex">
                <FileText size={14} />
                {activeDocument.fileName}
                <span className="text-blue-400">
                  · {activeDocument.embeddingStatus}
                </span>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut size={16} />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-4xl">
            {messages.length === 0 && !isLoadingMessages ? (
              <EmptyState
                onUpload={() => fileInputRef.current?.click()}
                onExample={(text) => setInput(text)}
              />
            ) : null}

            {isLoadingMessages ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-neutral-400" size={28} />
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((message) => (
                  <MessageBubble key={message.messageId} message={message} />
                ))}

                {isSending && (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="animate-spin" size={16} />
                    Thinking...
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-neutral-200 bg-white px-4 py-4">
          <div className="mx-auto max-w-4xl">
            {activeDocument && (
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip size={16} />
                  <span className="truncate">{activeDocument.fileName}</span>
                  <span className="shrink-0 text-xs text-blue-500">
                    {activeDocument.embeddingStatus}
                  </span>
                </div>
                <button
                  onClick={() => setActiveDocument(null)}
                  className="rounded-lg p-1 hover:bg-blue-100"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {processingText && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                <Loader2 className="animate-spin" size={16} />
                {processingText}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-2 shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSending}
                className="rounded-xl p-3 text-neutral-500 hover:bg-white hover:text-neutral-950 disabled:opacity-50"
                title="Upload document"
              >
                {isUploading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Upload size={20} />
                )}
              </button>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  activeDocument
                    ? "Ask from the uploaded document..."
                    : "Ask a technical question..."
                }
                rows={1}
                className="max-h-36 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none"
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() || isSending}
                className="rounded-xl bg-neutral-950 p-3 text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>

            <p className="mt-2 text-center text-xs text-neutral-400">
              Local demo. Uploaded documents are stored on your device.
            </p>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Sidebar({
  chats,
  activeChatId,
  isLoadingChats,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onLogout,
  user,
}: {
  chats: Chat[];
  activeChatId: string | null;
  isLoadingChats: boolean;
  onNewChat: () => void;
  onSelectChat: (chat: Chat) => void;
  onDeleteChat: (chatId: string) => void;
  onLogout: () => void;
  user: any;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">AI Chatbot</p>
            <p className="text-xs text-neutral-500">Local RAG demo</p>
          </div>
        </div>

        <Button className="w-full gap-2" onClick={onNewChat}>
          <MessageSquarePlus size={16} />
          New Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoadingChats ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-xl bg-neutral-100"
              />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">
            No chats yet.
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.chatId}
                className={`group flex items-center gap-2 rounded-xl px-3 py-3 text-sm transition ${
                  activeChatId === chat.chatId
                    ? "bg-neutral-950 text-white"
                    : "hover:bg-neutral-100"
                }`}
              >
                <button
                  onClick={() => onSelectChat(chat)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium">
                    {chat.title || "New Chat"}
                  </p>
                  {chat.lastMessage && (
                    <p
                      className={`truncate text-xs ${
                        activeChatId === chat.chatId
                          ? "text-neutral-300"
                          : "text-neutral-500"
                      }`}
                    >
                      {chat.lastMessage}
                    </p>
                  )}
                </button>

                <button
                  onClick={() => onDeleteChat(chat.chatId)}
                  className={`rounded-lg p-1 opacity-0 transition group-hover:opacity-100 ${
                    activeChatId === chat.chatId
                      ? "hover:bg-white/10"
                      : "hover:bg-red-50 hover:text-red-600"
                  }`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 p-4">
        <div className="mb-3 rounded-2xl bg-neutral-100 p-3">
          <p className="truncate text-sm font-semibold">
            {user.displayName || (user.isAnonymous ? "Guest User" : "User")}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {user.email || "Anonymous Firebase user"}
          </p>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={onLogout}>
          <LogOut size={16} />
          Logout
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  onUpload,
  onExample,
}: {
  onUpload: () => void;
  onExample: (text: string) => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-neutral-950 text-white shadow">
          <Bot size={30} />
        </div>

        <h2 className="mt-6 text-3xl font-black">How can I help?</h2>
        <p className="mt-3 text-neutral-500">
          Ask a general technical question, or upload a document and ask from
          that document using RAG.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => onExample("Explain RAG in simple terms.")}
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="font-semibold">Explain RAG</p>
            <p className="mt-1 text-sm text-neutral-500">
              Ask Gemini a technical question.
            </p>
          </button>

          <button
            onClick={onUpload}
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="font-semibold">Upload document</p>
            <p className="mt-1 text-sm text-neutral-500">
              Ask questions from PDF, DOCX, or TXT.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-3xl px-5 py-4 shadow-sm ${
          isUser
            ? "bg-neutral-950 text-white"
            : "border border-neutral-200 bg-white text-neutral-900"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-6">
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!isUser && (
          <div className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            <div className="flex flex-wrap gap-2">
              {message.route && (
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Route: {message.route}
                </span>
              )}

              {message.tokenUsage && (
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Tokens: {message.tokenUsage.inputTokens || 0} /{" "}
                  {message.tokenUsage.outputTokens || 0} /{" "}
                  {message.tokenUsage.totalTokens || 0}
                </span>
              )}

              {message.tokenUsage?.model && (
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  {message.tokenUsage.model}
                </span>
              )}
            </div>

            {message.reasoningTrace && (
              <details className="mt-3 rounded-2xl bg-neutral-50 p-3">
                <summary className="cursor-pointer font-medium text-neutral-700">
                  Reasoning trace
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-neutral-600">
                  {JSON.stringify(message.reasoningTrace, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
