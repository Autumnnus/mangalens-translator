# MangaLens Translator - React & TypeScript Refactor

MangaLens Translator is a modern, client-side web application for translating manga and comics. It leverages the Gemini AI API for translation and layout preservation.

## 🚀 Key Features

- **Project Management**: Create multiple series/projects, categorize them.
- **AI Translation**: Uses Google Gemini to detect text bubbles, OCR, and translate.
- **In-Painting**: Automatically clears original text bubbles.
- **Typesetting**: Intelligently fits translated text back into bubbles with customizable fonts/colors.
- **Local Privacy**: All images are processed locally or via direct API calls. No images are stored on our servers.
- **Persistence**: Uses IndexedDB for image storage and LocalStorage for metadata.
- **Import/Export**: Full project backup and restore via ZIP.

## 🏗 Architecture (Refactored)

The project has been refactored to follow SOLID principles and a modular React architecture using **Zustand** for state management.

### Directory Structure

```text
src/
├── components/          # UI Components
│   ├── editor/          # Editor Workspace (ImageCard, Validation)
│   ├── layout/          # Layout wrappers (Header, Sidebar)
│   ├── viewer/          # Read-only components (ReaderView)
│   ├── common/          # Reusable UI (Modals, Icons)
│   └── ...
├── hooks/               # Custom Business Logic Hooks
│   ├── useImageProcessor.ts  # Translation engine wrapper
│   ├── useImageUpload.ts     # File handling & PDF extraction
│   ├── useProjectExport.ts   # ZIP generation logic
│   └── useProjectImport.ts   # ZIP parsing & rehydration
├── stores/              # Global State Management (Zustand)
│   ├── useSeriesStore.ts     # Core data (Series, Images, Categories)
│   ├── useSettingsStore.ts   # User preferences (Translation, UI Appearance)
│   └── useUIStore.ts         # Transient UI state (Modals, current selection)
├── services/            # API Services
│   └── gemini.ts             # Google Gemini API interaction
├── utils/               # Helper Functions
│   ├── db.ts                 # IndexedDB wrapper (Image storage)
│   ├── image.ts              # Canvas manipulation & typesetting
│   └── pdf.ts                # PDF.js wrapper
└── App.tsx              # Main Entry & Router/Layout Composer
```

### State Management

We use **Zustand** stores decoupled by domain:

- `useSeriesStore`: Persistent. Handles heavy data.
- `useSettingsStore`: Persistent. Handles configuration.
- `useUIStore`: Ephemeral. Handles modals and temporary states.

### Persistence

- **Metadata**: Persisted to `localStorage` via Zustand middleware.
- **Binary Data (Images)**: Persisted to `IndexedDB` (idb) to bypass storage limits.
- **Rehydration**: Checks for broken Blob URLs on mount and restores them from IndexedDB.

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Icons**: Lucide React, FontAwesome
- **AI**: Google Gemini Pro Vision
- **Utils**: JSZip, FileSaver, PDF.js

## 📦 Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    yarn install
    ```
3.  Run the development server:
    ```bash
    yarn dev
    ```

## 🤝 Contribution

Feel free to open issues or PRs for improvements.
