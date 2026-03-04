const state = {
  books: [],
  entries: [],
  route: { screen: "library", bookId: null, entryId: null, query: "" },
  history: [],
  librarySearch: "",
  librarySearchDraft: "",
  librarySort: "updated",
  librarySortDirection: "desc",
  libraryView: "grid",
  bookSearch: "",
  bookSearchDraft: "",
  globalSearch: "",
  globalSearchDraft: "",
};

const DATA_SCHEMA_VERSION = 1;
const appNode = document.querySelector("#app");
const appTitle = document.querySelector("#app-title");
const topbarBackButton = document.querySelector("#topbar-back-button");
const topbarActions = document.querySelector(".topbar-actions");
const toggleLibraryViewButton = document.querySelector("#toggle-library-view-button");
const loadDataButton = document.querySelector("#load-data-button");
const saveDataButton = document.querySelector("#save-data-button");
const createBookTopButton = document.querySelector("#create-book-top-button");
const openSearchButton = document.querySelector("#open-search-button");
const topbarCreateEntryButton = document.querySelector("#topbar-create-entry-button");
const importFileInput = document.querySelector("#import-file-input");
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
const clearEntryImageButton = document.querySelector("#clear-entry-image-button");
const entryImagePreview = document.querySelector("#entry-image-preview");
const entryBookLabel = document.querySelector("#entry-book-label");
const entryViewDialog = document.querySelector("#entry-view-dialog");
const entryViewTitle = document.querySelector("#entry-view-title");
const entryViewBookLabel = document.querySelector("#entry-view-book-label");
const entryViewContent = document.querySelector("#entry-view-content");
const closeEntryViewButton = document.querySelector("#close-entry-view-button");
const editEntryViewButton = document.querySelector("#edit-entry-view-button");
const entryImageDialog = document.querySelector("#entry-image-dialog");
const entryImageDialogTitle = document.querySelector("#entry-image-dialog-title");
const entryImageLightboxImage = document.querySelector("#entry-image-lightbox-image");
const closeEntryImageButton = document.querySelector("#close-entry-image-button");
const deleteEntryDialog = document.querySelector("#delete-entry-dialog");
const deleteEntryForm = document.querySelector("#delete-entry-form");
const deleteEntrySummary = document.querySelector("#delete-entry-summary");
const cancelDeleteEntryButton = document.querySelector("#cancel-delete-entry-button");
const bookDialogState = {
  mode: "create",
  bookId: null,
  clearCover: false,
  previewObjectUrl: null,
};
const entryDialogState = {
  bookId: null,
  entryId: null,
  returnToView: false,
  clearImage: false,
};
const entryViewState = {
  bookId: null,
  entryId: null,
};

boot().catch((error) => {
  console.error(error);
  appNode.innerHTML = `<section class="empty-state">起動に失敗しました。コンソールを確認してください。</section>`;
});

async function boot() {
  const bundledData = await loadBundledJson("./data/commonplace.json");
  hydrateStateFromPayload(bundledData);

  wireGlobalEvents();
  syncRouteFromHash();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("SW registration failed", error));
  }
}

function wireGlobalEvents() {
  window.addEventListener("hashchange", () => {
    syncRouteFromHash();
    render();
  });

  toggleLibraryViewButton.addEventListener("click", () => {
    state.libraryView = state.libraryView === "grid" ? "list" : "grid";
    render();
  });
  loadDataButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", importDataFile);
  saveDataButton.addEventListener("click", exportDataFile);
  createBookTopButton.addEventListener("click", () => openBookDialog());
  openSearchButton.addEventListener("click", () => navigateTo({ screen: "search" }));
  topbarBackButton.addEventListener("click", () => {
    if (state.route.screen === "entry" && state.route.bookId) {
      navigateTo({ screen: "book", bookId: state.route.bookId });
      return;
    }

    if (state.route.screen === "search") {
      backToFallback({ screen: "library" });
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
  closeEntryViewButton.addEventListener("click", () => closeEntryViewDialog());
  editEntryViewButton.addEventListener("click", () => {
    const { bookId, entryId } = entryViewState;
    if (!bookId || !entryId) {
      return;
    }

    closeEntryViewDialog({ skipNavigation: true });
    openEntryDialog(bookId, entryId, { returnToView: true });
  });
  entryViewDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryViewDialog();
  });
  closeEntryImageButton.addEventListener("click", () => closeEntryImageDialog());
  entryImageDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryImageDialog();
  });
  clearEntryImageButton.addEventListener("click", () => {
    entryDialogState.clearImage = true;
    entryForm.elements.context_images.value = "";
    updateEntryImagePreview();
  });
  entryForm.elements.context_images.addEventListener("input", () => {
    entryDialogState.clearImage = false;
    updateEntryImagePreview();
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
  const isSearch = state.route.screen === "search";
  document.body.dataset.screen = isBook ? "book" : state.route.screen;

  openSearchButton.hidden = state.route.screen === "search" || isBook;
  createBookTopButton.hidden = !isLibrary;
  toggleLibraryViewButton.hidden = !isLibrary;
  topbarBackButton.hidden = !(isBook || isSearch);
  topbarCreateEntryButton.hidden = !isBook;
  loadDataButton.hidden = isBook || isSearch;
  saveDataButton.hidden = isBook || isSearch;
  topbarActions.hidden = isSearch;
  appTitle.hidden = false;
  appTitle.textContent = isLibrary ? "Commonplace" : isBook ? "" : "検索";

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
    if (entryViewDialog.open) {
      closeEntryViewDialog({ skipNavigation: true });
    }
    if (entryImageDialog.open) {
      closeEntryImageDialog();
    }
    renderSearchScreen();
    return;
  }

  if (entryDialog.open) {
    closeEntryDialog({ skipNavigation: true });
  }
  if (entryViewDialog.open) {
    closeEntryViewDialog({ skipNavigation: true });
  }
  if (entryImageDialog.open) {
    closeEntryImageDialog();
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
  const gridIcon = toggleLibraryViewButton.querySelector(".icon-glyph-grid");
  const listIcon = toggleLibraryViewButton.querySelector(".icon-glyph-list");

  searchInput.value = state.librarySearchDraft;
  sortSelect.value = state.librarySort;
  sortDirectionButton.textContent = state.librarySortDirection === "desc" ? "↓" : "↑";
  sortDirectionButton.setAttribute(
    "aria-label",
    state.librarySortDirection === "desc" ? "降順で表示中。昇順に切り替え" : "昇順で表示中。降順に切り替え"
  );
  toggleLibraryViewButton.setAttribute(
    "aria-label",
    state.libraryView === "grid" ? "リスト表示に切り替え" : "カード表示に切り替え"
  );
  gridIcon.hidden = state.libraryView !== "grid";
  listIcon.hidden = state.libraryView !== "list";
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
  grid.className = state.libraryView === "list" ? "library-list" : "library-grid";

  if (!books.length) {
    grid.innerHTML = `<div class="empty-state">本が見つかりません。まずは1冊作成してください。</div>`;
  } else {
    const bookMarkup = books
      .map((book) => {
        const coverMarkup = renderBookCoverMarkup(
          book,
          state.libraryView === "list" ? "cover-art library-list-cover-art" : "cover-art"
        );

        if (state.libraryView === "list") {
          const latestEntry = getLatestEntryForBook(book.id);
          const listTagsMarkup = (latestEntry?.tags || [])
            .slice(0, 3)
            .map(
              (tag) =>
                `<button class="tag-pill tag-pill-button library-list-tag" type="button" data-tag-query="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
            )
            .join("");
          return `
            <article class="library-list-item" data-book-id="${book.id}">
              <div class="library-list-cover">${coverMarkup}</div>
              <div class="library-list-body">
                <strong class="library-card-title library-list-title">${escapeHtml(book.title)}</strong>
                <span class="muted-text library-card-author library-list-author">${escapeHtml(book.author || "著者未設定")}</span>
                <div class="library-list-meta">
                  <div class="library-list-tags">${listTagsMarkup}</div>
                  <span class="library-list-updated">${formatDateShort(getBookUpdatedAt(book))}更新</span>
                </div>
              </div>
            </article>
          `;
        }

        return `
          <article class="library-card" data-book-id="${book.id}">
            <button class="library-card-button" type="button" data-book-id="${book.id}">
              ${coverMarkup}
            </button>
          </article>
        `;
      })
      .join("");

    grid.innerHTML = bookMarkup;
    grid.querySelectorAll("[data-book-id]").forEach((button) => {
      button.addEventListener("click", () => navigateTo({ screen: "book", bookId: button.dataset.bookId }));
    });
    grid.querySelectorAll(".library-list-item").forEach((item) => {
      item.addEventListener("click", (event) => {
        if (event.target.closest("[data-tag-query]")) {
          return;
        }
        navigateTo({ screen: "book", bookId: item.dataset.bookId });
      });
    });
    grid.querySelectorAll(".library-list-item [data-tag-query]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const query = button.dataset.tagQuery || "";
        state.globalSearchDraft = query;
        state.globalSearch = query;
        navigateTo({ screen: "search" });
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
          .map(
            (tag) =>
              `<button class="tag-pill tag-pill-button" type="button" data-tag-query="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
          )
          .join("");
        return `
          <article class="entry-card">
            <button class="entry-card-button" type="button" data-entry-id="${entry.id}">
              <div class="entry-core">${escapeHtml(entry.core || "無題のメモ")}</div>
              <div class="quote-preview">${escapeHtml(preview || "引用または要約を追加するとここに表示されます")}</div>
            </button>
            ${tagsMarkup ? `<div class="tag-row entry-tag-row">${tagsMarkup}</div>` : ""}
          </article>
        `;
      })
      .join("");

    list.querySelectorAll("[data-entry-id]").forEach((button) => {
      button.addEventListener("click", () => navigateTo({ screen: "entry", bookId: book.id, entryId: button.dataset.entryId }));
    });
    list.querySelectorAll("[data-tag-query]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const query = button.dataset.tagQuery || "";
        state.globalSearchDraft = query;
        state.globalSearch = query;
        navigateTo({ screen: "search" });
      });
    });
  }

  mount(fragment);

  if (entryId) {
    openEntryViewDialog(book.id, entryId);
    return;
  }

  if (entryDialog.open) {
    closeEntryDialog({ skipNavigation: true });
  }
  if (entryViewDialog.open) {
    closeEntryViewDialog({ skipNavigation: true });
  }
}

function openEntryDialog(bookId, entryId, { returnToView = false } = {}) {
  const book = state.books.find((item) => item.id === bookId);
  const entry = state.entries.find((item) => item.id === entryId);

  if (!book || !entry) {
    navigateTo({ screen: "book", bookId });
    return;
  }

  if (entryViewDialog.open) {
    closeEntryViewDialog({ skipNavigation: true });
  }
  if (entryImageDialog.open) {
    closeEntryImageDialog();
  }

  entryDialogState.bookId = book.id;
  entryDialogState.entryId = entry.id;
  entryDialogState.returnToView = returnToView;
  entryDialogTitle.textContent = book.title;
  entryBookLabel.textContent = "";
  entryForm.elements.core.value = entry.core || "";
  entryForm.elements.context_quote.value = entry.context_quote || "";
  entryForm.elements.context_summary.value = entry.context_summary || "";
  entryForm.elements.context_note.value = entry.context_note || "";
  entryForm.elements.tags.value = (entry.tags || []).join(", ");
  entryForm.elements.locator.value = entry.locator || "";
  entryForm.elements.context_link.value = entry.time_meta?.context_link || "";
  entryForm.elements.context_images.value = getEntryImages(entry).map((image) => getEditableCoverValue(image)).join("\n");
  entryDialogState.clearImage = false;
  updateEntryImagePreview(entry);

  if (!entryDialog.open) {
    entryDialog.showModal();
  }
}

function openEntryViewDialog(bookId, entryId) {
  const book = state.books.find((item) => item.id === bookId);
  const entry = state.entries.find((item) => item.id === entryId);

  if (!book || !entry) {
    navigateTo({ screen: "book", bookId });
    return;
  }

  if (entryDialog.open) {
    closeEntryDialog({ skipNavigation: true });
  }

  entryViewState.bookId = book.id;
  entryViewState.entryId = entry.id;
  entryViewTitle.textContent = entry.core || "無題のメモ";
  entryViewBookLabel.textContent = entry.locator ? `${book.title} / ${entry.locator}` : book.title;
  entryViewContent.innerHTML = renderEntryViewMarkup(entry);

  entryViewContent.querySelectorAll("[data-entry-view-image]").forEach((button) => {
    const imageSrc = button.dataset.entryViewImage || "";
    const openImage = () => openEntryImageDialog(imageSrc, entry.core || book.title);
    button.addEventListener("click", openImage);
    button.addEventListener("dblclick", openImage);
  });
  entryViewContent.querySelectorAll("[data-tag-query]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const query = button.dataset.tagQuery || "";
      state.globalSearchDraft = query;
      state.globalSearch = query;
      closeEntryViewDialog({ skipNavigation: true });
      navigateTo({ screen: "search" });
    });
  });

  if (!entryViewDialog.open) {
    entryViewDialog.showModal();
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
    context_images: resolveEntryImagesValue({
      typedImages: parseImagePaths(entryForm.elements.context_images.value),
      existingImages: getEntryImages(entry),
      clearImage: entryDialogState.clearImage,
    }),
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
  const bookId = entryDialogState.bookId;
  const entryId = entryDialogState.entryId;
  const returnToView = entryDialogState.returnToView;

  if (entryDialog.open) {
    entryDialog.close();
  }

  entryForm.reset();
  entryDialogTitle.textContent = "編集";
  entryDialogState.bookId = null;
  entryDialogState.entryId = null;
  entryDialogState.returnToView = false;
  entryDialogState.clearImage = false;
  updateEntryImagePreview();

  if (!skipNavigation && returnToView && bookId && entryId) {
    openEntryViewDialog(bookId, entryId);
    return;
  }

  if (!skipNavigation && state.route.screen === "entry" && state.route.bookId) {
    navigateTo({ screen: "book", bookId: state.route.bookId });
  }
}

function closeEntryViewDialog({ skipNavigation = false } = {}) {
  if (entryImageDialog.open) {
    closeEntryImageDialog();
  }

  if (entryViewDialog.open) {
    entryViewDialog.close();
  }

  entryViewTitle.textContent = "メモ";
  entryViewBookLabel.textContent = "";
  entryViewContent.innerHTML = "";
  entryViewState.bookId = null;
  entryViewState.entryId = null;

  if (!skipNavigation && state.route.screen === "entry" && state.route.bookId) {
    navigateTo({ screen: "book", bookId: state.route.bookId });
  }
}

function openEntryImageDialog(imageSrc, title) {
  if (!imageSrc) {
    return;
  }

  entryImageDialogTitle.textContent = title || "画像";
  entryImageLightboxImage.src = imageSrc;
  entryImageLightboxImage.alt = title || "画像";
  if (!entryImageDialog.open) {
    entryImageDialog.showModal();
  }
}

function closeEntryImageDialog() {
  if (entryImageDialog.open) {
    entryImageDialog.close();
  }

  entryImageDialogTitle.textContent = "画像";
  entryImageLightboxImage.removeAttribute("src");
  entryImageLightboxImage.alt = "";
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
            <div class="meta-row">
              <button class="meta-pill search-book-chip" type="button" data-search-book-id="${entry.book_id}">${escapeHtml(
                book?.title || "未分類"
              )}</button>
            </div>
            <button class="search-card-button" type="button" data-book-id="${entry.book_id}" data-entry-id="${entry.id}">
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
    results.querySelectorAll("[data-search-book-id]").forEach((button) => {
      button.addEventListener("click", () => navigateTo({ screen: "book", bookId: button.dataset.searchBookId }));
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

async function persistState() {
  render();
}

function createPersistedPayload() {
  return {
    schema_version: DATA_SCHEMA_VERSION,
    books: state.books,
    entries: state.entries,
  };
}

function hydrateStateFromPayload(payload) {
  state.books = Array.isArray(payload?.books) ? payload.books : [];
  state.entries = Array.isArray(payload?.entries) ? payload.entries : [];
}

async function importDataFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    hydrateStateFromPayload(payload);
    state.librarySearch = "";
    state.librarySearchDraft = "";
    state.bookSearch = "";
    state.bookSearchDraft = "";
    state.globalSearch = "";
    state.globalSearchDraft = "";
    navigateTo({ screen: "library" });
  } catch (error) {
    console.error(error);
  } finally {
    importFileInput.value = "";
  }
}

function exportDataFile() {
  const payload = JSON.stringify(createPersistedPayload(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createExportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createExportFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `cmp_${year}-${month}-${day}-${hours}-${minutes}.json`;
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
  return sortEntriesForReading(state.entries.filter((entry) => entry.book_id === bookId));
}

function getLatestEntryForBook(bookId) {
  return state.entries
    .filter((entry) => entry.book_id === bookId)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
}

function getBookUpdatedAt(book) {
  const latestEntry = getLatestEntryForBook(book.id);
  return latestEntry?.updated_at || book.updated_at || book.created_at;
}

function sortEntriesForReading(entries) {
  return [...entries].sort((left, right) => compareReadingOrder(left, right));
}

function compareReadingOrder(left, right) {
  const leftKey = createReadingOrderKey(left);
  const rightKey = createReadingOrderKey(right);
  const limit = Math.max(leftKey.length, rightKey.length);

  for (let index = 0; index < limit; index += 1) {
    const leftValue = leftKey[index] ?? Number.MAX_SAFE_INTEGER;
    const rightValue = rightKey[index] ?? Number.MAX_SAFE_INTEGER;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  if (left.created_at !== right.created_at) {
    return left.created_at.localeCompare(right.created_at);
  }

  return left.id.localeCompare(right.id, "ja");
}

function createReadingOrderKey(entry) {
  const locator = normalizeText(entry.locator);
  if (!locator) {
    return [Number.MAX_SAFE_INTEGER - 2];
  }

  const key = [];
  const chapterMatch = locator.match(/第([0-9]+|[一二三四五六七八九十百〇零]+)(章|部)/);
  if (chapterMatch) {
    key.push(toSectionNumber(chapterMatch[1]));
  }

  const numericMatches = [...locator.matchAll(/([0-9]+)/g)].map((match) => Number(match[1]));
  if (numericMatches.length) {
    key.push(...numericMatches);
  }

  const kindleMatch = locator.match(/location\s*([0-9]+)/i);
  if (kindleMatch && !numericMatches.length) {
    key.push(Number(kindleMatch[1]));
  }

  if (!key.length) {
    return [Number.MAX_SAFE_INTEGER - 1];
  }

  return key;
}

function toSectionNumber(value) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const digits = {
    "〇": 0,
    "零": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };
  let total = 0;
  let current = 0;

  for (const char of value) {
    if (char === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }

    if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }

    current = digits[char] ?? current;
  }

  return total + current;
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
    context_images: [],
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

  const latestEntry = getLatestEntryForBook(bookId);
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

function formatDateShort(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function renderEntryViewMarkup(entry) {
  const sections = [
    renderEntryViewImages(getEntryImages(entry), entry.core || "メモ画像"),
    renderEntryViewSection("引用・抜粋", entry.context_quote),
    renderEntryViewSection("要約", entry.context_summary),
    renderEntryViewSection("メモ・考え", entry.context_note),
    renderEntryViewSection("位置情報", entry.locator),
    renderEntryViewTags(entry.tags || []),
    renderEntryViewLink("関連リンク", entry.time_meta?.context_link),
  ].filter(Boolean);

  return sections.join("");
}

function renderEntryViewImages(images, title) {
  if (!images.length) {
    return "";
  }

  const imagesMarkup = images
    .map(
      (imageSrc, index) => `
        <button class="entry-view-image-button" type="button" data-entry-view-image="${escapeHtml(imageSrc)}" aria-label="画像${index + 1}を拡大">
          <img class="entry-view-image" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" />
        </button>
      `
    )
    .join("");

  return `
    <section class="entry-view-section">
      <h4>画像</h4>
      <div class="entry-view-image-stack">${imagesMarkup}</div>
    </section>
  `;
}

function renderEntryViewSection(label, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return `
    <section class="entry-view-section">
      <h4>${escapeHtml(label)}</h4>
      <p>${escapeHtml(normalized).replaceAll("\n", "<br />")}</p>
    </section>
  `;
}

function renderEntryViewLink(label, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return `
    <section class="entry-view-section">
      <h4>${escapeHtml(label)}</h4>
      <a class="entry-view-link" href="${escapeHtml(normalized)}" target="_blank" rel="noreferrer noopener">${escapeHtml(normalized)}</a>
    </section>
  `;
}

function renderEntryViewTags(tags) {
  if (!tags.length) {
    return "";
  }

  const tagsMarkup = tags
    .map((tag) => `<button class="tag-pill tag-pill-button" type="button" data-tag-query="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join("");

  return `
    <section class="entry-view-section">
      <h4>タグ</h4>
      <div class="tag-row">${tagsMarkup}</div>
    </section>
  `;
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

function updateEntryImagePreview(entry = null) {
  const previewEntry = entry || state.entries.find((item) => item.id === entryDialogState.entryId) || {
    core: normalizeText(entryForm.elements.core.value) || "画像プレビュー",
    context_images: [],
  };

  const images = entryDialogState.clearImage
    ? []
    : parseImagePaths(entryForm.elements.context_images.value).length
      ? parseImagePaths(entryForm.elements.context_images.value)
      : getEntryImages(previewEntry);

  if (!images.length) {
    entryImagePreview.innerHTML = `<div class="empty-state">画像はまだありません。</div>`;
    return;
  }

  entryImagePreview.innerHTML = images
    .map(
      (imageSrc) =>
        `<img class="entry-image-preview-image" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(previewEntry.core || "メモ画像")}" />`
    )
    .join("");
}

function resolveEntryImagesValue({ typedImages, existingImages, clearImage }) {
  if (typedImages.length) {
    return typedImages;
  }

  if (clearImage) {
    return [];
  }

  return existingImages;
}

function getEntryImages(entry) {
  if (Array.isArray(entry?.context_images) && entry.context_images.length) {
    return entry.context_images.filter(Boolean);
  }

  if (entry?.context_image) {
    return [entry.context_image];
  }

  return [];
}

function parseImagePaths(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
