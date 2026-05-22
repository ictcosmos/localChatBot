"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, LogOut, Menu, Send, Paperclip, MoreVertical, 
  Trash2, Edit, MessageSquare, AlertCircle, X, Check, PanelLeftClose, PanelLeft,
  FileText, Loader2, HardDrive
} from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc, updateDoc, collection } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

import { useAuth } from "@/context/AuthContext";
import { db, storage, API_BASE_URL } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

interface Chat {
  chatId: string;
  title: string;
  activeDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface Message {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  route?: string;
}

interface DocumentInfo {
  documentId: string;
  fileName: string;
  embeddingStatus: string;
}

export default function ChatPage() {
  const router = useRouter();
  const { user, idToken, loading: authLoading, logout } = useAuth();

  // State managers
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("User");
  
  // UI states
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Kebab / Inline edit states
  const [activeKebabMenu, setActiveKebabMenu] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState("");

  // Document states
  const [activeDocument, setActiveDocument] = useState<DocumentInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [isProcessingDoc, setIsProcessingDoc] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect if not signed in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [user, authLoading, router]);

  // Fetch username from Firestore
  useEffect(() => {
    async function fetchUserProfile() {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setUsername(userDoc.data().fullName || "User");
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      }
    }
    fetchUserProfile();
  }, [user]);

  // Fetch Chats on Mount/idToken load
  useEffect(() => {
    if (idToken) {
      fetchChats();
    }
  }, [idToken]);

  // Scroll to bottom when messages load/update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const fetchChats = async () => {
    if (!idToken) return;
    setIsLoadingChats(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chats`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.status === 401) {
        logout();
        router.push("/signin");
        return;
      }
      if (!res.ok) throw new Error("Failed to load chats.");
      const data = await res.json();
      setChats(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch chats.");
    } finally {
      setIsLoadingChats(false);
    }
  };

  const fetchMessages = async (chatId: string) => {
    if (!idToken) return;
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chats/${chatId}/messages`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load messages.");
      const data = await res.json();
      setMessages(data);
    } catch (err: any) {
      toast.error("Error loading chat messages.");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const selectChat = async (chat: Chat) => {
    setActiveChat(chat);
    setMobileSidebarOpen(false);
    fetchMessages(chat.chatId);
    
    // Check if chat has an active document linked
    if (chat.activeDocumentId && user && idToken) {
      try {
        const docRes = await fetch(`${API_BASE_URL}/documents/${chat.activeDocumentId}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        if (docRes.ok) {
          const docData = await docRes.json();
          setActiveDocument({
            documentId: docData.documentId,
            fileName: docData.fileName,
            embeddingStatus: docData.embeddingStatus
          });
        } else {
          setActiveDocument(null);
        }
      } catch {
        setActiveDocument(null);
      }
    } else {
      setActiveDocument(null);
    }
  };

  const handleCreateChat = async () => {
    if (!idToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/chats`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (!res.ok) throw new Error("Failed to create chat.");
      const newChat: Chat = await res.json();
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat);
      setMessages([]);
      setActiveDocument(null);
      toast.success("New chat created!");
    } catch (err: any) {
      toast.error("Failed to create a new chat session.");
    }
  };

  const handleStartRename = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.chatId);
    setEditTitleInput(chat.title);
    setActiveKebabMenu(null);
  };

  const handleSaveRename = async (chatId: string, e: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!idToken || !editTitleInput.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/chats/${chatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: editTitleInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename chat.");
      const updatedChat = await res.json();
      
      setChats((prev) =>
        prev.map((c) => (c.chatId === chatId ? { ...c, title: updatedChat.title } : c))
      );
      if (activeChat?.chatId === chatId) {
        setActiveChat((prev) => (prev ? { ...prev, title: updatedChat.title } : null));
      }
      setEditingChatId(null);
      toast.success("Chat renamed.");
    } catch (err: any) {
      toast.error("Error renaming chat session.");
    }
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!idToken) return;

    try {
      const res = await fetch(`${API_BASE_URL}/chats/${chatId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to delete chat.");

      setChats((prev) => prev.filter((c) => c.chatId !== chatId));
      if (activeChat?.chatId === chatId) {
        setActiveChat(null);
        setMessages([]);
        setActiveDocument(null);
      }
      setActiveKebabMenu(null);
      toast.success("Chat deleted.");
    } catch (err: any) {
      toast.error("Error deleting chat session.");
    }
  };

  // --- Document Upload & Status Polling Pipeline ---

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !idToken || !activeChat) return;

    // 1. Client-side extension validation
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "txt"].includes(ext)) {
      toast.error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
      return;
    }

    // 2. Client-side size validation (20 MB limit)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File is too large. Maximum size allowed is 20 MB.");
      return;
    }

    // Proactively reset states
    setIsUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(0);

    try {
      // 3. Generate a client-side documentId
      const tempDocRef = doc(collection(db, "temp"));
      const documentId = tempDocRef.id;

      // 4. Set storage path
      const storagePath = `users/${user.uid}/documents/${documentId}/${file.name}`;
      const fileRef = ref(storage, storagePath);

      // 5. Trigger resumable Storage upload
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Storage upload error:", error);
          toast.error("Failed to upload file to storage.");
          setIsUploading(false);
        },
        async () => {
          // Upload complete!
          setIsUploading(false);
          setIsProcessingDoc(true);
          setProcessingStatusText("Processing");

          // 6. Call process endpoint on backend
          try {
            const processRes = await fetch(`${API_BASE_URL}/documents/process`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                documentId,
                fileName: file.name,
                storagePath,
                chatId: activeChat.chatId,
              }),
            });

            if (!processRes.ok) {
              const errData = await processRes.json();
              throw new Error(errData.detail || "Ingestion trigger failed.");
            }

            // Start polling status
            startPollingDocumentStatus(documentId);
          } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Could not register file ingestion.");
            setIsProcessingDoc(false);
          }
        }
      );
    } catch (err: any) {
      console.error(err);
      toast.error("An error occurred during file upload.");
      setIsUploading(false);
    }
  };

  const startPollingDocumentStatus = (docId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      if (!idToken || !activeChat) return;

      try {
        const res = await fetch(`${API_BASE_URL}/documents/${docId}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!res.ok) throw new Error();

        const docData = await res.json();
        
        if (docData.embeddingStatus === "completed") {
          // Success! Clear interval
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setIsProcessingDoc(false);
          toast.success(`"${docData.fileName}" is vectorized and ready for RAG!`);

          // Update active chat's document ID link in Firestore
          const chatDocRef = doc(db, "users", user!.uid, "chats", activeChat.chatId);
          await updateDoc(chatDocRef, {
            activeDocumentId: docId
          });

          // Sync local state
          setActiveDocument({
            documentId: docData.documentId,
            fileName: docData.fileName,
            embeddingStatus: "completed"
          });
          
          setChats((prev) =>
            prev.map((c) => (c.chatId === activeChat.chatId ? { ...c, activeDocumentId: docId } : c))
          );
          setActiveChat((prev) => (prev ? { ...prev, activeDocumentId: docId } : null));

        } else if (docData.embeddingStatus === "failed") {
          // Failed! Clear interval
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setIsProcessingDoc(false);
          toast.error(`Ingestion failed for "${docData.fileName}": Scanned PDFs are not supported.`);
        }
      } catch (err) {
        console.error("Error polling document status:", err);
      }
    }, 2000);
  };

  const handleClearActiveDocument = async () => {
    if (!activeChat || !user) return;
    try {
      const chatDocRef = doc(db, "users", user.uid, "chats", activeChat.chatId);
      await updateDoc(chatDocRef, {
        activeDocumentId: null
      });
      setActiveDocument(null);
      setChats((prev) =>
        prev.map((c) => (c.chatId === activeChat.chatId ? { ...c, activeDocumentId: null } : c))
      );
      setActiveChat((prev) => (prev ? { ...prev, activeDocumentId: null } : null));
      toast.success("Active document cleared from session.");
    } catch {
      toast.error("Failed to clear active document.");
    }
  };

  // --- End of Document logic ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChat || !idToken || isSending) return;

    const messageText = input.trim();
    setInput("");
    setIsSending(true);

    // Optimistically render the User's Message
    const tempUserMessage: Message = {
      messageId: `temp-user-${Date.now()}`,
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      // Call Phase 1 Echo endpoint
      const res = await fetch(`${API_BASE_URL}/chat/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          chatId: activeChat.chatId,
          message: messageText,
          activeDocumentId: activeDocument?.documentId || null,
        }),
      });

      if (!res.ok) throw new Error("API encountered an issue.");
      const echoedMessage = await res.json();

      // Render the backend response message
      setMessages((prev) => [
        ...prev.filter((m) => m.messageId !== tempUserMessage.messageId),
        {
          messageId: tempUserMessage.messageId,
          role: "user",
          content: messageText,
          createdAt: tempUserMessage.createdAt,
        },
        {
          messageId: echoedMessage.messageId,
          role: "assistant",
          content: echoedMessage.content,
          createdAt: echoedMessage.createdAt,
          route: echoedMessage.route,
        },
      ]);

      // Refresh chat list list to update latest messages
      fetchChats();
    } catch (err: any) {
      toast.error(err.message || "Failed to deliver message.");
      setMessages((prev) => prev.filter((m) => m.messageId !== tempUserMessage.messageId));
    } finally {
      setIsSending(false);
    }
  };

  const handleSignOut = () => {
    logout();
    router.push("/signin");
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 relative">
      {/* Background ambient glowing blurs */}
      <div className="absolute top-10 left-10 h-72 w-72 rounded-full bg-indigo-600/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-violet-600/5 blur-[100px] pointer-events-none" />

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.docx,.txt"
        className="hidden"
      />

      {/* --- DESKTOP SIDEBAR --- */}
      <div
        className={`hidden md:flex flex-col border-r border-slate-900 bg-slate-950/70 backdrop-blur-md transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-900/60 flex items-center justify-between">
          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            Antigravity Chat
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 h-auto text-slate-400 hover:text-slate-200"
          >
            <PanelLeftClose size={18} />
          </Button>
        </div>

        {/* New Chat Area */}
        <div className="p-4 flex gap-2">
          <Button variant="primary" onClick={handleCreateChat} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs">
            <Plus size={14} />
            <span>New Chat</span>
          </Button>
          <Link href="/documents">
            <Button variant="outline" className="p-2 border-slate-800" title="My Documents">
              <HardDrive size={15} className="text-slate-400" />
            </Button>
          </Link>
        </div>

        {/* Chats History list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {isLoadingChats ? (
            <div className="flex justify-center p-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : chats.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">No chat history</p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.chatId}
                onClick={() => selectChat(chat)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 relative ${
                  activeChat?.chatId === chat.chatId
                    ? "bg-slate-900 text-slate-100 font-medium"
                    : "hover:bg-slate-900/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                {editingChatId === chat.chatId ? (
                  <form
                    onSubmit={(e) => handleSaveRename(chat.chatId, e)}
                    className="flex items-center gap-1 w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      value={editTitleInput}
                      onChange={(e) => setEditTitleInput(e.target.value)}
                      className="bg-slate-800 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-slate-100 outline-none w-full"
                      autoFocus
                    />
                    <button type="submit" className="p-1 hover:text-green-500 text-slate-400">
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingChatId(null)}
                      className="p-1 hover:text-rose-500 text-slate-400"
                    >
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <MessageSquare size={15} className="flex-shrink-0 text-slate-500 group-hover:text-indigo-400" />
                      <span className="text-xs truncate block">{chat.title}</span>
                    </div>

                    {/* kebab action context */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() =>
                          setActiveKebabMenu(
                            activeKebabMenu === chat.chatId ? null : chat.chatId
                          )
                        }
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-300 rounded transition-opacity"
                      >
                        <MoreVertical size={14} />
                      </button>

                      {activeKebabMenu === chat.chatId && (
                        <div className="absolute right-0 top-6 z-20 w-28 bg-slate-900 border border-slate-800 rounded-md shadow-lg py-1">
                          <button
                            onClick={(e) => handleStartRename(chat, e)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 w-full text-left"
                          >
                            <Edit size={12} />
                            <span>Rename</span>
                          </button>
                          <button
                            onClick={(e) => handleDeleteChat(chat.chatId, e)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-800 hover:text-rose-300 w-full text-left"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Sidebar Footer / User logout */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold truncate text-slate-200">{username}</span>
            <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* --- DESKTOP CLOSED SIDEBAR TOGGLE --- */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="hidden md:flex absolute left-4 top-4 z-30 p-2 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800"
        >
          <PanelLeft size={18} />
        </button>
      )}

      {/* --- MOBILE DRAWER SIDEBAR --- */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative flex flex-col w-4/5 max-w-sm bg-slate-950 border-r border-slate-900 h-full p-4 animate-slideIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-900">
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                Antigravity Chat
              </span>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={handleCreateChat} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs">
                <Plus size={14} />
                <span>New Chat</span>
              </Button>
              <Link href="/documents">
                <Button variant="outline" className="p-2 border-slate-850" onClick={() => setMobileSidebarOpen(false)}>
                  <HardDrive size={15} />
                </Button>
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 space-y-1">
              {chats.map((chat) => (
                <div
                  key={chat.chatId}
                  onClick={() => selectChat(chat)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                    activeChat?.chatId === chat.chatId ? "bg-slate-900 text-white" : "text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare size={15} className="text-slate-500" />
                    <span className="text-xs truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(chat.chatId, e)}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-900 mt-auto flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold truncate text-slate-200">{username}</span>
                <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
              </div>
              <button onClick={handleSignOut} className="p-2 text-slate-400 hover:text-rose-400">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN CHAT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Workspace Header */}
        <header className="h-16 border-b border-slate-900 bg-slate-950/40 backdrop-blur-md flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold text-slate-200 truncate">
                {activeChat ? activeChat.title : "Workspace"}
              </h2>
              {activeChat && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Session Mode
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400 font-medium bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-full">
            <span>Hi, {username}</span>
          </div>
        </header>

        {/* Message Zone */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {!activeChat ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 mb-4 shadow-lg shadow-indigo-500/5 animate-pulse">
                <MessageSquare size={26} />
              </div>
              <h3 className="text-lg font-bold text-slate-200">Start a new conversation</h3>
              <p className="mt-1.5 text-sm text-slate-500 max-w-sm">
                Create a new chat session to interact with Gemini, retrieve facts from documents, or search the web.
              </p>
              <Button onClick={handleCreateChat} variant="outline" className="mt-5 flex items-center gap-2 border-indigo-500/30 text-indigo-400 hover:bg-indigo-950/20 hover:text-indigo-300">
                <Plus size={15} />
                <span>New Session</span>
              </Button>
            </div>
          ) : messages.length === 0 ? (
            /* Selected Empty Session State */
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-4 animate-bounce">
                <Send size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-300">New Chat Session</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Write a message below to start communicating. Your changes will be saved automatically.
              </p>
            </div>
          ) : (
            /* Messaging History List */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.messageId}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`rounded-xl px-4 py-3 text-sm max-w-[85%] shadow-sm ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-none"
                        : "bg-slate-900 border border-slate-800/80 text-slate-100 rounded-bl-none"
                    }`}
                  >
                    {msg.content}
                  </div>
                  
                  {/* Meta Details */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 mt-1.5 ml-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      <span>route: {msg.route || "gemini"}</span>
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex flex-col items-start">
                  <div className="rounded-xl px-4 py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-bl-none flex items-center gap-2 text-sm max-w-[85%] shadow-sm">
                    <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Dock Panel */}
        {activeChat && (
          <div className="p-4 border-t border-slate-900 bg-slate-950/20">
            <div className="max-w-3xl mx-auto">
              
              {/* --- Document Processing status panel / bar --- */}
              {isUploading && (
                <div className="bg-slate-900/80 border border-indigo-500/20 rounded-lg p-3 mb-3 flex flex-col gap-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1.5 font-medium truncate">
                      <Loader2 size={13} className="animate-spin text-indigo-400" />
                      Uploading &ldquo;{uploadFileName}&rdquo;...
                    </span>
                    <span className="font-semibold text-indigo-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {isProcessingDoc && (
                <div className="bg-slate-900/80 border border-amber-500/20 rounded-lg p-3 mb-3 flex items-center justify-between text-xs text-slate-300 animate-fadeIn">
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    <Loader2 size={13} className="animate-spin text-amber-400" />
                    Vectorizing text structures for &ldquo;{uploadFileName}&rdquo;...
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full animate-pulse">
                    Ingesting
                  </span>
                </div>
              )}

              {/* --- Active Ingested Document Pill --- */}
              {activeDocument && (
                <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-3 py-2 rounded-lg text-xs w-fit mb-3 shadow-md shadow-indigo-950/20 animate-fadeIn">
                  <div className="flex items-center gap-2 font-medium">
                    <Paperclip size={13} />
                    <span className="truncate max-w-[200px]">{activeDocument.fileName}</span>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-400 px-1.5 py-0.2 bg-indigo-950 border border-indigo-500/30 rounded">
                      RAG Context
                    </span>
                  </div>
                  <button 
                    onClick={handleClearActiveDocument} 
                    className="ml-3 p-0.5 text-indigo-400 hover:text-indigo-200 hover:bg-indigo-950 rounded-full transition-all"
                    title="Clear active context"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                {/* File Upload Trigger */}
                <button
                  type="button"
                  onClick={triggerFileUpload}
                  disabled={isUploading || isProcessingDoc || isSending}
                  className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Paperclip size={18} />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    activeDocument 
                      ? `Ask a question about ${activeDocument.fileName}...` 
                      : "Ask general knowledge or technical queries..."
                  }
                  disabled={isSending}
                  rows={1}
                  className="flex-1 bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm rounded-lg px-4 py-3 outline-none resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />

                <Button
                  type="submit"
                  disabled={!input.trim() || isSending}
                  className="p-3 h-auto rounded-lg"
                >
                  <Send size={18} />
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
