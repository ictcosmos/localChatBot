# Antigravity Chat: Local Hybrid AI Chatbot

A high-fidelity hybrid AI chatbot featuring Firebase Authentication, Cloud Firestore database, Cloud Storage, Google Gemini LLM reasoning, Custom Web Search (Google CSE), and localized RAG (Retrieval-Augmented Generation) with a persistent Chroma vector store.

---

## 🛠️ Prerequisites

Ensure you have the following installed on your local computer:
- **Node.js**: Version 20.0 or higher
- **Python**: Version 3.11.x (highly recommended)
- **Firebase Project**: An active Firebase account to configure authentication, database, and storage.

---

## 🚀 Local Development Setup

### 1. Vector Database
The chatbot leverages a local **Chroma DB** client running in persistent in-process mode. No Docker is required!
It creates and stores indices inside `chatbot/api/chroma_data` (which is gitignored).

### 2. Backend Service (FastAPI)
1. Open a terminal in `chatbot/api/`.
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create `chatbot/api/.env` based on `chatbot/api/.env.example`.
5. Place your downloaded Firebase `service-account.json` file inside `chatbot/api/` (refer to the checklist below).
6. Spin up the backend:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend will run on [http://localhost:8000](http://localhost:8000).

### 3. Frontend App (Next.js)
1. Open a terminal in `chatbot/web/`.
2. Install client dependencies:
   ```bash
   npm install
   ```
3. Create `chatbot/web/.env.local` based on `chatbot/web/.env.example`.
4. Spin up the dev workspace:
   ```bash
   npm run dev
   ```
   The application will run on [http://localhost:3000](http://localhost:3000).

---

## 🔑 Environment Variables Breakdown

### Frontend (`web/.env.local`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Client Web API key for authentication.
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: Domain for Auth redirects (e.g. `your-project.firebaseapp.com`).
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: The unique ID of your Firebase project.
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Storage bucket URL (e.g. `your-project.appspot.com`).
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: Unique Firebase sender id.
- `NEXT_PUBLIC_FIREBASE_APP_ID`: Web App ID config token.
- `NEXT_PUBLIC_API_BASE_URL`: Pointer to the running FastAPI backend (`http://localhost:8000`).

### Backend (`api/.env`)
- `GEMINI_API_KEY`: API Key for Google Gemini (obtained from Google AI Studio).
- `GOOGLE_CSE_ID`: Custom Search Engine ID for web searching.
- `GOOGLE_CSE_KEY`: Programmable Custom Search API Key.
- `FIREBASE_STORAGE_BUCKET`: Cloud Storage bucket URL for documents (matches frontend).

---

## 🔥 Firebase Setup Checklist
Follow these steps to configure your Firebase backend:
1. **Create Firebase Project**: Navigate to the [Firebase Console](https://console.firebase.google.com/) and register a new project.
2. **Enable Authentication**: Under Build, click **Authentication**, select Sign-in Method, and enable **Email/Password** (with standard settings).
3. **Initialize Firestore**: Navigate to **Cloud Firestore**, select **Create Database**, and select **Native Mode**. Set up initial rules using `chatbot/infra/firestore.rules`.
4. **Initialize Cloud Storage**: Navigate to **Storage**, click **Get Started**, choose your server region, and write the security rules using `chatbot/infra/storage.rules`.
5. **Get Web Config**: In Project Settings, click **Add App** (choose Web `</>`), register your app, and copy the config details into your `web/.env.local`.
6. **Generate Admin SDK Credentials**: In Project Settings under **Service Accounts**, click **Generate New Private Key**. Save this file as `chatbot/api/service-account.json`. Ensure this file is never committed (it is already in `.gitignore`).

---

## 🔍 Testing Checklist

Run these manual checks locally to verify system compliance:

### 1. Authentication
- [ ] **Signup**: Attempt registration with brand new details. Verify it creates the account, saves user details to `users/{uid}`, and redirects to `/chat`.
- [ ] **Duplicate Username**: Attempt signup with a username that already exists. Verify it gets rejected proactively with a clear warning.
- [ ] **Signin (Email)**: Log out and sign in using your registered email.
- [ ] **Signin (Username)**: Sign in using your custom username instead of email. Verify it resolves to email and logs you in successfully.
- [ ] **Password Enforcement**: Input an incorrect password. Verify it throws a toast warning: `"Incorrect email/username or password."`

### 2. Chat Shell & Sessions
- [ ] **Sessions**: Create 3 different chat sessions. Verify they are listed in the sidebar.
- [ ] **Rename**: Edit a session title via the kebab inline-editing input. Verify the title updates.
- [ ] **Delete**: Delete a session. Verify the chat list and all stored Firestore messages are cleared.
- [ ] **History Persistence**: Send a message, reload the page, and check if history displays.

### 3. Document Processing (Phase 2)
- [ ] **Upload**: Upload a PDF, a DOCX, and a TXT document. Verify the progress indicator transitions from Uploading to Processing, and finally to Ready.
- [ ] **Limit Guards**: Attempt uploading a file over 20 MB. Verify it fails immediately.
- [ ] **Scanned Document Check**: Upload a scanned PDF containing no characters. Verify it gets flagged with `embeddingStatus: "failed"` and reason `"scanned PDF not supported"`.
- [ ] **Delete Sync**: Delete an ingested document. Verify it is removed from Firestore, Storage, and Chroma.

### 4. Hybrid RAG (Phase 2 & 3)
- [ ] **Answering from Context**: Select a document and ask a specific fact from it. Verify it quotes the supporting details and cites the page like `[p.3]`.
- [ ] **Refusal String**: Ask a general question not contained in the document. Verify it refuses exactly with:
  `"I could not find this information in the uploaded document."`
- [ ] **Follow-ups**: Ask a short question referring to previous context ("what else does it say?"). Verify it remembers the context.

### 5. Web Searching (Phase 3)
- [ ] **Recency Routing**: Query `"what is the weather in Kathmandu today"`. Verify the classification routes to `google_search`, fetches live data, and cites sources.

### 6. Streaming Connection
- [ ] **Incremental Rendering**: Send a chat request and ensure text outputs render incrementally character-by-character.
- [ ] **Tab Closure resilience**: Close the browser tab mid-stream. Ensure it doesn't cause errors or corrupt stored logs on backend.

### 7. Token Tracking & Security Isolation (Phase 4)
- [ ] **Usage Audit**: Ask a query, then view `/usage`. Ensure total token usage counts match the sum of individual logs.
- [ ] **Cross-user Isolation**:
  - Open two separate browser profiles (or an Incognito window).
  - Log in to Account A on one and Account B on the other.
  - Attempt to fetch Account A's chats or documents by crafting endpoints. Verify that Firebase Auth security rules throw 403 / 401 exceptions.

---

## 💡 What to Build Next (Out of Scope for MVP)
- **OCR Engine Integration**: Incorporating `pytesseract` or Google Cloud Vision to support image-based and scanned PDFs.
- **Hybrid Keyword + Vector Search**: Implementing BM25 keyword rankings alongside Chroma embeddings to boost query precision.
- **Shared Read-Only Sessions**: Generating unique shareable links for conversations.
- **Export Formats**: Downloading histories as Markdown or JSON structures.
