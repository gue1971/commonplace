const state = {
  books: [],
  entries: [],
  route: { screen: "library", bookId: null, entryId: null, query: "" },
  history: [],
  librarySearch: "",
  librarySearchDraft: "",
  librarySort: "updated",
  librarySortDirection: "desc",
  bookSearch: "",
  bookSearchDraft: "",
  globalSearch: "",
  globalSearchDraft: "",
  dataHandle: null,
};

const HANDLE_DB_NAME = "commonplace-fs";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "data-directory";
const appNode = document.querySelector("#app");
const appTitle = document.querySelector("#app-title");
const topbarBackButton = document.querySelector("#topbar-back-button");
const topbarActions = document.querySelector(".topbar-actions");
const loadDataButton = document.querySelector("#load-data-button");
const saveDataButton = document.querySelector("#save-data-button");
const createBookTopButton = document.querySelector("#create-book-top-button");
const openSearchButton = document.querySelector("#open-search-button");
const topbarCreateEntryButton = document.querySelector("#topbar-create-entry-button");
const bookDialog = document.querySelector("#book-dialog");
const bookForm = document.querySelector("#book-form");
const cancelBookButton = document.querySelector("#cancel-book-button");
const clearBookCoverButton = document.querySelector("#clear-book-cover-button");
const bookDialogTitle = document.querySelector("#book-dialog-title");
const submitBookButton = document.querySelector("#submit-book-button");
const bookCoverPreview = document.querySelector("#book-cover-preview");
const entryDialog = document.querySelector("#entry-dialog");
const entryForm = document.querySelector("#entry-form");
const entryDialogTitle = document.querySelector("#entry-dialog-title");
const cancelEntryButton = document.querySelector("#cancel-entry-button");
const deleteEntryButton = document.querySelector("#delete-entry-button");
const entryBookLabel = document.querySelector("#entry-book-label");
const deleteEntryDialog = document.querySelector("#delete-entry-dialog");
const deleteEntryForm = document.querySelector("#delete-entry-form");
const deleteEntrySummary = document.querySelector("#delete-entry-summary");
const cancelDeleteEntryButton = document.querySelector("#cancel-delete-entry-button");
const supportsFileSystemAccess = "showDirectoryPicker" in window;
const bookDialogState = {
  mode: "create",
  bookId: null,
  clearCover: false,
  previewObjectUrl: null,
};
const entryDialogState = {
  bookId: null,
  entryId: null,
};

boot().catch((error) => {
  console.error(error);
  appNode.innerHTML = `<section class="empty-state">起動に失敗しました。コンソールを確認してください。</section>`;
});

async function boot() {
  state.books = await loadBundledJson("./data/books.json");
  state.entries = await loadBundledJson("./data/entries.json");

  wireGlobalEvents();
  syncRouteFromHash();
  render();

  if (supportsFileSystemAccess) {
    restoreDirectoryHandle().then(() => render());
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("SW registration failed", error));
  }
}

function wireGlobalEvents() {
  window.addEventListener("hashchange", () => {
    syncRouteFromHash();
    render();
  });

  loadDataButton.addEventListener("click", loadDataDirectory);
  saveDataButton.addEventListener("click", saveDataDirectory);
  createBookTopButton.addEventListener("click", () => openBookDialog());
  openSearchButton.addEventListener("click", () => navigateTo({ screen: "search" }));
  topbarBackButton.addEventListener("click", () => {
    if (state.route.screen === "entry" && state.route.bookId) {
      navigateTo({ screen: "book", bookId: state.route.bookId });
      return;
    }

    navigateTo({ screen: "library" });
  });
  topbarCreateEntryButton.addEventListener("click", async () => {
    if (!state.route.bookId) {
      return;
    }

    const entry = createEmptyEntry(state.route.bookId);
    state.entries = [entry, ...state.entries];
    await persistState();
    navigateTo({ screen: "entry", bookId: state.route.bookId, entryId: entry.id });
  });

  cancelBookButton.addEventListener("click", closeBookDialog);
  clearBookCoverButton.addEventListener("click", () => {
    bookDialogState.clearCover = true;
    bookForm.elements.cover_image.value = "";
    bookForm.elements.cover_file.value = "";
    updateBookCoverPreview();
  });
  bookForm.elements.title.addEventListener("input", () => updateBookCoverPreview());
  bookForm.elements.author.addEventListener("input", () => updateBookCoverPreview());
  bookForm.elements.cover_image.addEventListener("input", () => {
    bookDialogState.clearCover = false;
    updateBookCoverPreview();
  });
  bookForm.elements.cover_file.addEventListener("change", () => {
    bookDialogState.clearCover = false;
    updateBookCoverPreview();
  });
  bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(bookForm);
    const file = formData.get("cover_file");
    const uploadedCover = file instanceof File && file.size > 0 ? await readFileAsDataUrl(file) : null;
    const typedCover = normalizeText(formData.get("cover_image"));
    const now = new Date().toISOString();
    const title = normalizeText(formData.get("title"));
    const author = normalizeText(formData.get("author"));
    const existingBook = bookDialogState.bookId ? state.books.find((item) => item.id === bookDialogState.bookId) : null;
    const resolvedCover = resolveBookCoverValue({
      uploadedCover,
      typedCover,
      existingCover: existingBook?.cover_image || "",
      clearCover: bookDialogState.clearCover,
    });

    if (bookDialogState.mode === "edit" && existingBook) {
      state.books = state.books.map((book) =>
        book.id === existingBook.id
          ? {
              ...book,
              title,
              author,
              cover_image: resolvedCover,
              updated_at: getBookUpdatedAt(existingBook),
            }
          : book
      );
      await persistState();
      closeBookDialog();
      if (state.route.screen === "book" && state.route.bookId === existingBook.id) {
        render();
      }
      return;
    }

    const book = {
      id: createId("book"),
      title,
      author,
      cover_image: resolvedCover,
      created_at: now,
      updated_at: now,
    };

    state.books = [book, ...state.books];
    closeBookDialog();
    await persistState();
    navigateTo({ screen: "book", bookId: book.id });
  });

  cancelEntryButton.addEventListener("click", () => closeEntryDialog());
  entryDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryDialog();
  });
  entryForm.addEventListener("submit", saveEntryFromDialog);
  deleteEntryButton.addEventListener("click", openDeleteEntryDialog);
  cancelDeleteEntryButton.addEventListener("click", closeDeleteEntryDialog);
  deleteEntryDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDeleteEntryDialog();
  });
  deleteEntryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await deleteEntryFromDialog();
  });
}

function syncRouteFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const [screen = "library", param] = hash.split("/");

  if (screen === "book" && param) {
    state.route = { screen: "book", bookId: param, entryId: null, query: "" };
    return;
  }

  if (screen === "entry" && param) {
    const [bookId, entryId] = param.split(":");
    state.route = { screen: "entry", bookId, entryId, query: "" };
    return;
  }

  if (screen === "search") {
    state.route = { screen: "search", bookId: null, entryId: null, query: "" };
    return;
  }

  state.route = { screen: "library", bookId: null, entryId: null, query: "" };
}

function navigateTo(route) {
  const currentHash = window.location.hash || "#library";
  if (!state.history.length || state.history[state.history.length - 1] !== currentHash) {
    state.history.push(currentHash);
  }

  if (route.screen === "book") {
    window.location.hash = `book/${route.bookId}`;
    return;
  }

  if (route.screen === "entry") {
    window.location.hash = `entry/${route.bookId}:${route.entryId}`;
    return;
  }

  if (route.screen === "search") {
    window.location.hash = "search";
    return;
  }

  window.location.hash = "library";
}

function backToFallback(fallback) {
  const previous = state.history.pop();
  if (previous) {
    window.location.hash = previous.replace(/^#/, "");
    return;
  }

  navigateTo(fallback);
}

function render() {
  const isLibrary = state.route.screen === "library";
  const isBook = state.route.screen === "book" || state.route.screen === "entry";
  document.body.dataset.screen = isBook ? "book" : state.route.screen;

  loadDataButton.hidden = !supportsFileSystemAccess;
  saveDataButton.hidden = !supportsFileSystemAccess;
  openSearchButton.hidden = state.route.screen === "search" || isBook;
  createBookTopButton.hidden = !isLibrary;
  topbarBackButton.hidden = !isBook;
  topbarCreateEntryButton.hidden = !isBook;
  loadDataButton.hidden = !supportsFileSystemAccess || isBook;
  saveDataButton.hidden = !supportsFileSystemAccess || isBook;
  topbarActions.hidden = false;
  appTitle.hidden = false;
  appTitle.textContent = isLibrary ? "本棚" : isBook ? "" : "検索";

  if (isBook) {
    const book = state.books.find((item) => item.id === state.route.bookId);
    appTitle.textContent = book?.title || "";
  }

  if (state.route.screen === "book" || state.route.screen === "entry") {
    renderBookScreen(state.route.bookId, state.route.screen === "entry" ? state.route.entryId : null);
    return;
  }

  if (state.route.screen === "search") {
    if (entryDialog.open) {
      closeEntryDialog({ skipNavigation: true });
    }
    renderSearchScreen();
    return;
  }

  if (entryDialog.open) {
    closeEntryDialog({ skipNavigation: true });
  }

  renderLibraryScreen();
}

function renderLibraryScreen() {
  const fragment = cloneTemplate("library-template");
  const searchForm = fragment.querySelector("#library-search-form");
  const searchInput = fragment.querySelector("#library-search-input");
  const sortSelect = fragment.querySelector("#library-sort-select");
  const sortDirectionButton = fragment.querySelector("#library-sort-direction-button");
  const grid = fragment.querySelector("#library-grid");

  searchInput.value = state.librarySearchDraft;
  sortSelect.value = state.librarySort;
  sortDirectionButton.textContent = state.librarySortDirection === "desc" ? "↓" : "↑";
  sortDirectionButton.setAttribute(
    "aria-label",
    state.librarySortDirection === "desc" ? "降順で表示中。昇順に切り替え" : "昇順で表示中。降順に切り替え"
  );
  enableSelectAllOnFocus(searchInput);

  searchInput.addEventListener("input", (event) => {
    state.librarySearchDraft = event.target.value;
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.librarySearch = state.librarySearchDraft;
    renderWithPreservedInput("library-search-input", state.librarySearchDraft);
  });

  sortSelect.addEventListener("change", (event) => {
    state.librarySort = event.target.value;
    renderLibraryScreen();
  });

  sortDirectionButton.addEventListener("click", () => {
    state.librarySortDirection = state.librarySortDirection === "desc" ? "asc" : "desc";
    renderLibraryScreen();
  });

  const books = sortBooks(
    filterBooks(state.books, state.entries, state.librarySearch),
    state.librarySort,
    state.librarySortDirection
  );

  if (!books.length) {
    grid.innerHTML = `<div class="empty-state">本が見つかりません。まずは1冊作成してください。</div>`;
  } else {
    const bookMarkup = books
      .map((book) => {
        const coverMarkup = renderBookCoverMarkup(book, "cover-art");

        return `
          <article class="library-card" data-book-id="${book.id}">
            <button class="library-card-edit" type="button" data-edit-book-id="${book.id}" aria-label="本を編集">✎</button>
            <button class="library-card-button" type="button" data-book-id="${book.id}">
              ${coverMarkup}
              <div class="library-card-body">
                <strong class="library-card-title">${escapeHtml(book.title)}</strong>
                <span class="muted-text library-card-author">${escapeHtml(book.author || "著者未設定")}</span>
              </div>
            </button>
          </article>
        `;
      })
      .join("");

    grid.innerHTML = bookMarkup;
    grid.querySelectorAll("[data-book-id]").forEach((button) => {
      button.addEventListener("click", () => navigateTo({ screen: "book", bookId: button.dataset.bookId }));
    });
    grid.querySelectorAll("[data-edit-book-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const book = state.books.find((item) => item.id === button.dataset.editBookId);
        if (book) {
          openBookDialog(book);
        }
      });
    });
  }

  mount(fragment);
}

function renderBookScreen(bookId, entryId = null) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) {
    navigateTo({ screen: "library" });
    return;
  }

  const fragment = cloneTemplate("book-template");
  const searchForm = fragment.querySelector("#book-subbar-search-form");
  const searchInput = fragment.querySelector("#book-subbar-search-input");
  const updated = fragment.querySelector("#book-subbar-updated");
  const list = fragment.querySelector("#book-entry-list");

  searchInput.value = state.bookSearchDraft;
  updated.textContent = `${formatDateCompact(getBookUpdatedAt(book))}更新`;
  enableSelectAllOnFocus(searchInput);

  searchInput.addEventListener("input", (event) => {
    state.bookSearchDraft = event.target.value;
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.bookSearch = state.bookSearchDraft;
    renderWithPreservedInput("book-subbar-search-input", state.bookSearchDraft);
  });

  const entries = getEntriesForBook(book.id).filter((entry) => matchesEntry(entry, state.bookSearch));
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state">まだEntryがありません。まずは投下してください。</div>`;
  } else {
    list.innerHTML = entries
      .map((entry) => {
        const preview = createPreview(entry.context_quote || entry.context_summary || entry.context_note);
        const tagsMarkup = (entry.tags || [])
          .slice(0, 4)
          .map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`)
          .join("");
        return `
          <article class="entry-card">
            <button class="entry-card-button" type="button" data-entry-id="${entry.id}">
              <div class="entry-core">${escapeHtml(entry.core || "無題のメモ")}</div>
              <div class="quote-preview">${escapeHtml(preview || "引用または要約を追加するとここに表示されます")}</div>
              ${tagsMarkup ? `<div class="tag-row">${tagsMarkup}</div>` : ""}
            </button>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-entry-id]").forEach((button) => {
      button.addEventListener("click", () => navigateTo({ screen: "entry", bookId: book.id, entryId: button.dataset.entryId }));
    });
  }

  mount(fragment);

  if (entryId) {
    openEntryDialog(book.id, entryId);
    return;
  }

  if (entryDialog.open) {
    closeEntryDialog({ skipNavigation: true });
  }
}

function openEntryDialog(bookId, entryId) {
  const book = state.books.find((item) => item.id === bookId);
  const entry = state.entries.find((item) => item.id === entryId);

  if (!book || !entry) {
    navigateTo({ screen: "book", bookId });
    return;
  }

  entryDialogState.bookId = book.id;
  entryDialogState.entryId = entry.id;
  entryDialogTitle.textContent = book.title;
  entryBookLabel.textContent = "";
  entryForm.elements.core.value = entry.core || "";
  entryForm.elements.context_quote.value = entry.context_quote || "";
  entryForm.elements.context_summary.value = entry.context_summary || "";
  entryForm.elements.context_note.value = entry.context_note || "";
  entryForm.elements.tags.value = (entry.tags || []).join(", ");
  entryForm.elements.locator.value = entry.locator || "";
  entryForm.elements.context_link.value = entry.time_meta?.context_link || "";

  if (!entryDialog.open) {
    entryDialog.showModal();
  }
}

async function saveEntryFromDialog(event) {
  event.preventDefault();

  const bookId = entryDialogState.bookId;
  const entryId = entryDialogState.entryId;
  const book = state.books.find((item) => item.id === bookId);
  const entry = state.entries.find((item) => item.id === entryId);
  if (!book || !entry) {
    closeEntryDialog();
    return;
  }

  const now = new Date().toISOString();
  const nextEntry = {
    ...entry,
    core: normalizeText(entryForm.elements.core.value),
    context_quote: normalizeText(entryForm.elements.context_quote.value),
    context_summary: normalizeText(entryForm.elements.context_summary.value),
    context_note: normalizeText(entryForm.elements.context_note.value),
    tags: parseTags(entryForm.elements.tags.value),
    locator: normalizeText(entryForm.elements.locator.value),
    time_meta: {
      ...(entry.time_meta || {}),
      captured_at: entry.time_meta?.captured_at || now,
      context_link: normalizeText(entryForm.elements.context_link.value),
    },
    updated_at: now,
  };

  state.entries = state.entries.map((item) => (item.id === entry.id ? nextEntry : item));
  bumpBookUpdatedAt(book.id, now);
  await persistState();
  closeEntryDialog();
}

async function deleteEntryFromDialog() {
  const bookId = entryDialogState.bookId;
  const entryId = entryDialogState.entryId;
  if (!bookId || !entryId) {
    closeEntryDialog();
    return;
  }

  state.entries = state.entries.filter((item) => item.id !== entryId);
  syncBookUpdatedAt(bookId);
  await persistState();
  closeDeleteEntryDialog();
  closeEntryDialog();
}

function closeEntryDialog({ skipNavigation = false } = {}) {
  if (entryDialog.open) {
    entryDialog.close();
  }

  entryForm.reset();
  entryDialogTitle.textContent = "編集";
  entryDialogState.bookId = null;
  entryDialogState.entryId = null;

  if (!skipNavigation && state.route.screen === "entry" && state.route.bookId) {
    navigateTo({ screen: "book", bookId: state.route.bookId });
  }
}

function openDeleteEntryDialog() {
  const entryId = entryDialogState.entryId;
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  deleteEntrySummary.textContent = entry.core || "無題のメモ";
  if (!deleteEntryDialog.open) {
    deleteEntryDialog.showModal();
  }
}

function closeDeleteEntryDialog() {
  if (deleteEntryDialog.open) {
    deleteEntryDialog.close();
  }
  deleteEntrySummary.textContent = "";
}

function renderSearchScreen() {
  const fragment = cloneTemplate("search-template");
  const backButton = fragment.querySelector("#search-back-button");
  const searchForm = fragment.querySelector("#global-search-form");
  const input = fragment.querySelector("#global-search-input");
  const results = fragment.querySelector("#search-results");

  input.value = state.globalSearchDraft;
  enableSelectAllOnFocus(input);
  input.addEventListener("input", (event) => {
    state.globalSearchDraft = event.target.value;
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.globalSearch = state.globalSearchDraft;
    renderWithPreservedInput("global-search-input", state.globalSearchDraft);
  });

  backButton.addEventListener("click", () => backToFallback({ screen: "library" }));

  const matches = state.globalSearch
    ? state.entries.filter((entry) => {
        const book = state.books.find((item) => item.id === entry.book_id);
        return matchesEntryWithBook(entry, book, state.globalSearch);
      })
    : state.entries;

  if (!matches.length) {
    results.innerHTML = `<div class="empty-state">一致するEntryがありません。</div>`;
  } else {
    results.innerHTML = matches
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map((entry) => {
        const book = state.books.find((item) => item.id === entry.book_id);
        const preview = createPreview(entry.context_quote || entry.context_summary || entry.context_note);
        return `
          <article class="search-card">
            <button class="search-card-button" type="button" data-book-id="${entry.book_id}" data-entry-id="${entry.id}">
              <div class="meta-row">
                <span class="meta-pill">${escapeHtml(book?.title || "未分類")}</span>
              </div>
              <div class="search-core">${escapeHtml(entry.core || "無題のメモ")}</div>
              <div class="search-preview">${escapeHtml(preview || "プレビューなし")}</div>
            </button>
          </article>
        `;
      })
      .join("");

    results.querySelectorAll("[data-entry-id]").forEach((button) => {
      button.addEventListener("click", () =>
        navigateTo({ screen: "entry", bookId: button.dataset.bookId, entryId: button.dataset.entryId })
      );
    });
  }

  mount(fragment);
}

function openBookDialog(book = null) {
  bookDialogState.mode = book ? "edit" : "create";
  bookDialogState.bookId = book?.id || null;
  bookDialogState.clearCover = false;

  bookDialogTitle.textContent = book ? "本を編集" : "新しい本";
  submitBookButton.textContent = book ? "更新" : "作成";
  bookForm.elements.title.value = book?.title || "";
  bookForm.elements.author.value = book?.author || "";
  bookForm.elements.cover_image.value = getEditableCoverValue(book?.cover_image || "");
  bookForm.elements.cover_file.value = "";
  updateBookCoverPreview(book);
  bookDialog.showModal();
}

function closeBookDialog() {
  clearBookPreviewObjectUrl();
  bookDialog.close();
  bookForm.reset();
  bookDialogState.mode = "create";
  bookDialogState.bookId = null;
  bookDialogState.clearCover = false;
  bookDialogTitle.textContent = "新しい本";
  submitBookButton.textContent = "保存";
  updateBookCoverPreview();
}

function updateBookCoverPreview(book = null) {
  const previewBook = book || state.books.find((item) => item.id === bookDialogState.bookId) || {
    title: normalizeText(bookForm.elements.title.value) || "タイトル未設定",
    author: normalizeText(bookForm.elements.author.value) || "",
    cover_image: "",
  };

  const file = bookForm.elements.cover_file.files?.[0];
  clearBookPreviewObjectUrl();
  if (file) {
    bookDialogState.previewObjectUrl = URL.createObjectURL(file);
  }

  const typedCover = normalizeText(bookForm.elements.cover_image.value);
  const coverImage = bookDialogState.clearCover
    ? ""
    : bookDialogState.previewObjectUrl || typedCover || previewBook.cover_image || "";
  bookCoverPreview.innerHTML = renderBookCoverMarkup(
    {
      ...previewBook,
      cover_image: coverImage,
      title: normalizeText(bookForm.elements.title.value) || previewBook.title,
      author: normalizeText(bookForm.elements.author.value) || previewBook.author,
    },
    "book-cover-preview-image"
  );
}

function clearBookPreviewObjectUrl() {
  if (bookDialogState.previewObjectUrl) {
    URL.revokeObjectURL(bookDialogState.previewObjectUrl);
    bookDialogState.previewObjectUrl = null;
  }
}

function mount(fragment) {
  appNode.replaceChildren(fragment);
}

function renderWithPreservedInput(inputId, value) {
  render();
  const input = document.querySelector(`#${inputId}`);
  if (!input) {
    return;
  }

  input.focus();
  const caret = String(value || "").length;
  input.setSelectionRange(caret, caret);
}

function enableSelectAllOnFocus(input) {
  input.addEventListener("focus", () => {
    queueMicrotask(() => input.select());
  });
}

function cloneTemplate(id) {
  return document.querySelector(`#${id}`).content.cloneNode(true);
}

async function loadBundledJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return response.json();
}

async function restoreDirectoryHandle() {
  const handle = await loadPersistedDirectoryHandle();
  if (!handle) {
    return;
  }

  try {
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      return;
    }

    await hydrateStateFromDirectory(handle);
    state.dataHandle = handle;
  } catch (error) {
    console.warn("Directory handle restore skipped", error);
  }
}

async function pickDataDirectory() {
  if (!supportsFileSystemAccess) {
    return null;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.dataHandle = handle;
    await persistDirectoryHandle(handle);
    return handle;
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
    }
    return null;
  }
}

async function loadDataDirectory() {
  const handle = await pickDataDirectory();
  if (!handle) {
    return;
  }

  try {
    await ensureDataFiles(handle);
    await hydrateStateFromDirectory(handle);
    render();
  } catch (error) {
    console.error(error);
  }
}

async function saveDataDirectory() {
  let handle = state.dataHandle;
  if (!handle) {
    handle = await pickDataDirectory();
  }

  if (!handle) {
    return;
  }

  try {
    await ensureDataFiles(handle);
    await writeJsonAtomic(handle, "books.json", state.books);
    await writeJsonAtomic(handle, "entries.json", state.entries);
    render();
  } catch (error) {
    console.error(error);
  }
}

async function persistState() {
  if (!state.dataHandle) {
    render();
    return;
  }

  try {
    await writeJsonAtomic(state.dataHandle, "books.json", state.books);
    await writeJsonAtomic(state.dataHandle, "entries.json", state.entries);
  } catch (error) {
    console.error(error);
  } finally {
    render();
  }
}

async function ensureDataFiles(handle) {
  await writeJsonIfMissing(handle, "books.json", state.books);
  await writeJsonIfMissing(handle, "entries.json", state.entries);
}

async function writeJsonIfMissing(handle, filename, fallbackData) {
  try {
    await handle.getFileHandle(filename, { create: false });
  } catch {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(fallbackData, null, 2));
    await writable.close();
  }
}

async function hydrateStateFromDirectory(handle) {
  const books = await readJsonFromHandle(handle, "books.json");
  const entries = await readJsonFromHandle(handle, "entries.json");
  state.books = Array.isArray(books) ? books : [];
  state.entries = Array.isArray(entries) ? entries : [];
}

async function readJsonFromHandle(handle, filename) {
  const fileHandle = await handle.getFileHandle(filename, { create: false });
  const file = await fileHandle.getFile();
  return JSON.parse(await file.text());
}


function resolveBookCoverValue({ uploadedCover, typedCover, existingCover, clearCover }) {
  if (uploadedCover) {
    return uploadedCover;
  }

  if (typedCover) {
    return typedCover;
  }

  if (clearCover) {
    return "";
  }

  return existingCover;
}

function getEditableCoverValue(coverValue) {
  return coverValue.startsWith("data:image/") ? "" : coverValue;
}

async function writeJsonAtomic(handle, filename, payload) {
  const tempHandle = await handle.getFileHandle(`${filename}.tmp`, { create: true });
  const tempWriter = await tempHandle.createWritable();
  await tempWriter.write(JSON.stringify(payload, null, 2));
  await tempWriter.close();

  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writer = await fileHandle.createWritable();
  await writer.write(JSON.stringify(payload, null, 2));
  await writer.close();

  try {
    await handle.removeEntry(`${filename}.tmp`);
  } catch (error) {
    console.warn("Failed to remove temp file", error);
  }
}

function filterBooks(books, entries, query) {
  const normalized = normalizeText(query).toLowerCase();
  if (!normalized) {
    return books;
  }

  return books.filter((book) => {
    const bookMatch = [book.title, book.author]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized));

    if (bookMatch) {
      return true;
    }

    return entries
      .filter((entry) => entry.book_id === book.id)
      .some((entry) => matchesEntry(entry, normalized));
  });
}

function sortBooks(books, mode, direction = "desc") {
  const copy = [...books];
  if (mode === "title") {
    copy.sort((left, right) => left.title.localeCompare(right.title, "ja"));
    return direction === "asc" ? copy : copy.reverse();
  }

  if (mode === "created") {
    copy.sort((left, right) => left.created_at.localeCompare(right.created_at));
    return direction === "asc" ? copy : copy.reverse();
  }

  copy.sort((left, right) => getBookUpdatedAt(left).localeCompare(getBookUpdatedAt(right)));
  return direction === "asc" ? copy : copy.reverse();
}

function getEntriesForBook(bookId) {
  return state.entries
    .filter((entry) => entry.book_id === bookId)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function getBookUpdatedAt(book) {
  const latestEntry = getEntriesForBook(book.id)[0];
  return latestEntry?.updated_at || book.updated_at || book.created_at;
}

function createEmptyEntry(bookId) {
  const now = new Date().toISOString();
  const entry = {
    id: createId("entry"),
    book_id: bookId,
    core: "",
    context_quote: "",
    context_summary: "",
    context_note: "",
    tags: [],
    locator: "",
    time_meta: {
      captured_at: now,
      context_link: "",
    },
    created_at: now,
    updated_at: now,
  };

  bumpBookUpdatedAt(bookId, now);
  return entry;
}

function bumpBookUpdatedAt(bookId, value) {
  state.books = state.books.map((book) => {
    if (book.id !== bookId) {
      return book;
    }

    return { ...book, updated_at: value };
  });
}

function syncBookUpdatedAt(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) {
    return;
  }

  const latestEntry = getEntriesForBook(bookId)[0];
  bumpBookUpdatedAt(bookId, latestEntry?.updated_at || book.created_at);
}

function matchesEntry(entry, rawQuery) {
  const query = normalizeText(rawQuery).toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    entry.core,
    entry.context_quote,
    entry.context_summary,
    entry.context_note,
    entry.locator,
    ...(entry.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesEntryWithBook(entry, book, rawQuery) {
  const query = normalizeText(rawQuery).toLowerCase();
  if (!query) {
    return true;
  }

  if (matchesEntry(entry, query)) {
    return true;
  }

  return [book?.title, book?.author]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

function createPreview(value) {
  return normalizeText(value).replace(/\s+/g, " ").slice(0, 160);
}

function parseTags(value) {
  return normalizeText(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createId(prefix) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}_${stamp}_${random}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateCompact(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderBookCoverMarkup(book, imageClassName) {
  return `
    <div class="book-cover-frame" aria-hidden="true">
      <div class="book-cover-surface cover-faux"></div>
      ${
        book.cover_image
          ? `<img class="book-cover-overlay ${imageClassName}" src="${escapeHtml(book.cover_image)}" alt="${escapeHtml(book.title)}" />`
          : ""
      }
    </div>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function persistDirectoryHandle(handle) {
  const db = await openHandleDatabase();
  await promisifyRequest(db.transaction(HANDLE_STORE_NAME, "readwrite").objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY));
}

async function loadPersistedDirectoryHandle() {
  const db = await openHandleDatabase();
  return promisifyRequest(db.transaction(HANDLE_STORE_NAME, "readonly").objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY));
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
