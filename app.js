import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { generateSTLThumbnail, extract3MFThumbnail, extract3MFCoverOptions, parse3MFGeometry } from './thumbnail-generator.js';
import { enrichFromMakerOnline } from './threemf-extras.js';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { parseSTL } from './stl-parser.js';
import { initAuth, getAuthenticatedUser } from './auth.js';
import { startUsageTracking } from './usage-tracker.js';
import { initSlicerPicker, isSlicerChoiceSupported, slicerSplitHtml, openSlicerMenu, getDefaultSlicerName, getSlicerState, onSlicersChanged, getSlicerNames, getLastSlicer, setLastSlicer, slicerIconHtml } from './slicer-picker.js';

// Estado global da aplicação
const state = {
  models: [],
  folders: [], // Array de { id, name, handle, count }
  activeFolderId: null, // ID da pasta conectada ativa para filtro ou null (todas)
  activeSubfolderPath: null, // Caminho relativo da subpasta ativa ou null (toda a pasta)
  collapsedFolders: new Set(), // Set com chaves de pastas/subpastas recolhidas
  activeFilter: 'all', // 'all', 'stl', '3mf', 'duplicates'
  activeSection: 'all', // 'all', 'projects', 'favorites', 'duplicates'
  searchQuery: '',
  modalScene: null,
  modalCamera: null,
  modalRenderer: null,
  modalControls: null,
  modalMesh: null,
  modalAnimId: null,
  isAutoRotating: true,
  isWireframe: false,
  activeModel: null,
  activePlateId: 1,
  activePlate: null,
  activeProject: null,
  currentViewerMode: '3d',
  isMeshLoaded: false,
  pageSize: (function() {
    try {
      const saved = parseInt(localStorage.getItem('antigravity_page_size'), 10);
      return [50, 100, 150].includes(saved) ? saved : 50;
    } catch (e) {
      return 50;
    }
  })(),
  currentPage: 1,
  filteredModelsCount: 0,
  currentPageModelIds: new Set(),
  folderDiskPaths: (() => {
    try {
      const saved = localStorage.getItem('vault3d_folder_disk_paths');
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  })(),
  isSelectionMode: false,
  selectedModelIds: new Set(),
  selectedCoverKey: null,
  selectedCustomCoverUrl: null,
  sortOrder: (function() {
    try {
      const saved = localStorage.getItem('antigravity_sort_order');
      const valid = ['date_desc', 'date_asc', 'name_asc', 'name_desc', 'size_desc', 'size_asc'];
      return valid.includes(saved) ? saved : 'date_desc';
    } catch (e) {
      return 'date_desc';
    }
  })(),
  customProjects: (() => {
    try {
      const saved = localStorage.getItem('antigravity_custom_projects');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  })()
};

// Elementos DOM da Sidebar & Dashboard
const appSidebar = document.getElementById('appSidebar');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const btnSelectFolder = document.getElementById('btnSelectFolder');
const folderInputFallback = document.getElementById('folderInputFallback');
const navAllModels = document.getElementById('navAllModels');
const navProjects = document.getElementById('navProjects');
const navFavorites = document.getElementById('navFavorites');
const navTrending = document.getElementById('navTrending');
const navDuplicates = document.getElementById('navDuplicates');
const sidebarAllCountBadge = document.getElementById('sidebarAllCountBadge');
const sidebarProjectsCountBadge = document.getElementById('sidebarProjectsCountBadge');
const sidebarFavoritesCountBadge = document.getElementById('sidebarFavoritesCountBadge');
const sidebarDuplicatesCountBadge = document.getElementById('sidebarDuplicatesCountBadge');
const sidebarFoldersList = document.getElementById('sidebarFoldersList');
const sidebarFoldersCountBadge = document.getElementById('sidebarFoldersCountBadge');
const sidebarFoldersEmpty = document.getElementById('sidebarFoldersEmpty');
const sidebarAllFoldersWrap = document.getElementById('sidebarAllFoldersWrap');
const btnShowAllFolders = document.getElementById('btnShowAllFolders');
const allFoldersBadge = document.getElementById('allFoldersBadge');
const fileCountBadge = document.getElementById('fileCountBadge');
const sidebarStlCountBadge = document.getElementById('sidebarStlCountBadge');
const sidebar3mfCountBadge = document.getElementById('sidebar3mfCountBadge');
const statsScopeLabel = document.getElementById('statsScopeLabel');
const statsDuplicatesCount = document.getElementById('statsDuplicatesCount');
const statsDuplicatesCell = document.getElementById('statsDuplicatesCell');
const btnStatsReviewDuplicates = document.getElementById('btnStatsReviewDuplicates');

// Elementos DOM do Topbar & Filtros
const currentViewTitle = document.getElementById('currentViewTitle');
const currentViewSub = document.getElementById('currentViewSub');
const shellSubtitle = document.getElementById('shellSubtitle');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.sidebar-format-btn, .pill-btn');
const btnRefreshFolders = document.getElementById('btnRefreshFolders');
const btnRefreshTrending = document.getElementById('btnRefreshTrending');
const trendingRangeGroup = document.getElementById('trendingRangeGroup');
const trendingUpdatedLabel = document.getElementById('trendingUpdatedLabel');
const sortControlWrap = document.getElementById('sortControlWrap');
const selectSortOrder = document.getElementById('selectSortOrder');

// Elementos DOM de Paginação
const paginationBar = document.getElementById('paginationBar');
const paginationInfo = document.getElementById('paginationInfo');
const paginationRange = document.getElementById('paginationRange');
const paginationTotal = document.getElementById('paginationTotal');
const paginationNav = document.getElementById('paginationNav');
const btnPagePrev = document.getElementById('btnPagePrev');
const btnPageNext = document.getElementById('btnPageNext');
const paginationNumbers = document.getElementById('paginationNumbers');
const topPageSizeWrap = document.getElementById('topPageSizeWrap');
const topPageSizeButtons = document.getElementById('topPageSizeButtons');
const bottomPageSizeButtons = document.getElementById('bottomPageSizeButtons');
const btnModeProjects = document.getElementById('btnModeProjects');
const btnModeFiles = document.getElementById('btnModeFiles');

// Elementos DOM da Galeria & Área Principal
const dropZone = document.getElementById('dropZone');
const btnEmptySelectFolder = document.getElementById('btnEmptySelectFolder');
const btnLoadSample = document.getElementById('btnLoadSample');
const savedFoldersCard = document.getElementById('savedFoldersCard');
const savedFoldersCount = document.getElementById('savedFoldersCount');
const savedFoldersPreviewList = document.getElementById('savedFoldersPreviewList');
const btnReconnectAllFolders = document.getElementById('btnReconnectAllFolders');
const btnClearSavedFolders = document.getElementById('btnClearSavedFolders');
const galleryContainer = document.getElementById('galleryContainer');
const trendingContainer = document.getElementById('trendingContainer');
const trendingUnifiedGrid = document.getElementById('trendingUnifiedGrid');
const trendingMakerWorldGrid = document.getElementById('trendingMakerWorldGrid');
const trendingMakerOnlineGrid = document.getElementById('trendingMakerOnlineGrid');
const favoritesSection = document.getElementById('favoritesSection');
const favoritesGrid = document.getElementById('favoritesGrid');
const favoritesCountBadge = document.getElementById('favoritesCountBadge');
const allSection = document.getElementById('allSection');
const allSectionHeader = document.getElementById('allSectionHeader');
const allCountBadge = document.getElementById('allCountBadge');
const modelsGrid = document.getElementById('modelsGrid');

// Modal DOM
const viewerModal = document.getElementById('viewerModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const btnModalOpenSlicer = document.getElementById('btnModalOpenSlicer');
const modalFileName = document.getElementById('modalFileName');
const modalBadge = document.getElementById('modalBadge');
const modalDuplicateBadge = document.getElementById('modalDuplicateBadge');
const modalCanvas = document.getElementById('modalCanvas');
const btnResetView = document.getElementById('btnResetView');
const btnToggleRotate = document.getElementById('btnToggleRotate');
const btnToggleWireframe = document.getElementById('btnToggleWireframe');

// Elementos de Mesas de Impressão (Plates) e Modos de Visualização
const btnOpen3DView = document.getElementById('btnOpen3DView');
const btnBackToPlate = document.getElementById('btnBackToPlate');
const modalPlateImg = document.getElementById('modalPlateImg');
const viewerLoadingOverlay = document.getElementById('viewerLoadingOverlay');
const viewerLoadingText = document.getElementById('viewerLoadingText');
const viewerControlsBar = document.getElementById('viewerControlsBar');
const modalSidebar = document.getElementById('modalSidebar');
const platesSection = document.getElementById('platesSection');
const platesCount = document.getElementById('platesCount');
const platesList = document.getElementById('platesList');
const modalPathFolder = document.getElementById('modalPathFolder');
const modalPathName = document.getElementById('modalPathName');
const modalSidebarInfo = document.getElementById('modalSidebarInfo');
const modalInfoSize = document.getElementById('modalInfoSize');
const modalInfoDimensions = document.getElementById('modalInfoDimensions');
const modalInfoDimensionsWrap = document.getElementById('modalInfoDimensionsWrap');
const modalInfoTriangles = document.getElementById('modalInfoTriangles');
const modalInfoTrianglesWrap = document.getElementById('modalInfoTrianglesWrap');
const viewerModeSeg = document.getElementById('viewerModeSeg');
const viewerSegPhotoLabel = document.getElementById('viewerSegPhotoLabel');
const viewerPlateLabel = document.getElementById('viewerPlateLabel');
const platesHeading = document.getElementById('platesHeading');
const modalSlicedChip = document.getElementById('modalSlicedChip');
const btnModalFavorite = document.getElementById('btnModalFavorite');
const btnModalTrash = document.getElementById('btnModalTrash');
const btnTrashSelection = document.getElementById('btnTrashSelection');
const trashConfirmModal = document.getElementById('trashConfirmModal');
const trashConfirmDesc = document.getElementById('trashConfirmDesc');
const trashConfirmList = document.getElementById('trashConfirmList');
const btnConfirmTrash = document.getElementById('btnConfirmTrash');
const btnCancelTrash = document.getElementById('btnCancelTrash');
const trashConfirmBackdrop = document.getElementById('trashConfirmBackdrop');
const btnModalMove = document.getElementById('btnModalMove');
const btnMoveSelection = document.getElementById('btnMoveSelection');
const moveModal = document.getElementById('moveModal');
const moveConflictModal = document.getElementById('moveConflictModal');
const btnModalPrev = document.getElementById('btnModalPrev');
const btnModalNext = document.getElementById('btnModalNext');
const modalNavCounter = document.getElementById('modalNavCounter');
const btnCopyModalPath = document.getElementById('btnCopyModalPath');
const btnOpenModalSlicer = document.getElementById('btnOpenModalSlicer');

// Seleção Múltipla & Projetos Manuais DOM
const btnToggleSelect = document.getElementById('btnToggleSelect');
const selectionActionBar = document.getElementById('selectionActionBar');
const selectionCountBadge = document.getElementById('selectionCountBadge');
const selectionCountText = document.getElementById('selectionCountText');
const btnSelectAllVisible = document.getElementById('btnSelectAllVisible');
const btnOpenCreateProjectModal = document.getElementById('btnOpenCreateProjectModal');
const btnCancelSelection = document.getElementById('btnCancelSelection');
const createProjectModal = document.getElementById('createProjectModal');
const createProjectBackdrop = document.getElementById('createProjectBackdrop');
const btnCloseCreateProjectModal = document.getElementById('btnCloseCreateProjectModal');
const inputProjectName = document.getElementById('inputProjectName');
const projectModalCount = document.getElementById('projectModalCount');
const projectModalSize = document.getElementById('projectModalSize');
const projectModalPartsList = document.getElementById('projectModalPartsList');
const projectCoverSection = document.getElementById('projectCoverSection');
const projectCoverHint = document.getElementById('projectCoverHint');
const projectCoverGrid = document.getElementById('projectCoverGrid');
const btnCancelProjectCreation = document.getElementById('btnCancelProjectCreation');
const btnConfirmProjectCreation = document.getElementById('btnConfirmProjectCreation');

/**
 * Configuração de atualizações automáticas em segundo plano para o app Desktop (Electron)
 */
function setupDesktopUpdater() {
  if (!window.electronAPI || typeof window.electronAPI.onUpdateStatus !== 'function') return;

  const banner = document.getElementById('desktopUpdateBanner');
  const updateText = document.getElementById('desktopUpdateText');
  const updateIcon = document.getElementById('desktopUpdateIcon');
  const btnRestart = document.getElementById('btnRestartUpdate');
  const btnClose = document.getElementById('btnCloseUpdateBanner');

  if (btnClose && banner) {
    btnClose.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }

  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      if (!window.electronAPI.restartAndInstallUpdate) return;
      showUpdateInstallingOverlay();
      // Dá tempo do aviso aparecer antes do app fechar para instalar em segundo plano
      setTimeout(() => window.electronAPI.restartAndInstallUpdate(), 1200);
    });
  }

  window.electronAPI.onUpdateStatus((data) => {
    if (!banner || !updateText) return;

    if (data.status === 'available') {
      banner.style.display = 'flex';
      if (updateIcon) updateIcon.textContent = '📥';
      updateText.textContent = `Nova versão ${data.version || ''} encontrada! Baixando atualização...`;
      if (btnRestart) btnRestart.style.display = 'none';
    } else if (data.status === 'downloading') {
      banner.style.display = 'flex';
      if (updateIcon) updateIcon.textContent = '⏳';
      updateText.textContent = `Baixando atualização: ${data.percent || 0}% concluído...`;
      if (btnRestart) btnRestart.style.display = 'none';
    } else if (data.status === 'downloaded') {
      banner.style.display = 'flex';
      if (updateIcon) updateIcon.textContent = '🚀';
      updateText.textContent = `Versão ${data.version || ''} pronta para instalar!`;
      if (btnRestart) btnRestart.style.display = 'inline-block';
    } else if (data.status === 'error') {
      console.warn('Auto-updater desktop:', data.message);
    }
  });
}

function showUpdateInstallingOverlay() {
  if (document.getElementById('updateInstallingOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'updateInstallingOverlay';
  overlay.className = 'update-installing';
  overlay.innerHTML = `
    <div class="update-installing-card">
      <span class="update-installing-title">Atualizando o Vault3D</span>
      <div class="update-installing-bar"><span></span></div>
      <span class="update-installing-sub">O app vai fechar e reabrir sozinho em alguns segundos.</span>
    </div>`;
  document.body.appendChild(overlay);
}

// Inicialização de Eventos
function init() {
  // Monitorar atualizações automáticas no modo Desktop
  setupDesktopUpdater();

  // Exclusão de arquivos (Lixeira do Windows) no modo Desktop
  setupTrashFeature();

  // Mover arquivos entre as pastas conectadas no modo Desktop
  setupMoveFeature();

  // Edição de nome e foto de capa de arquivos e projetos
  setupEditCardFeature();

  if (btnSelectFolder) btnSelectFolder.addEventListener('click', handleChooseFolder);
  if (btnEmptySelectFolder) btnEmptySelectFolder.addEventListener('click', handleChooseFolder);
  if (folderInputFallback) folderInputFallback.addEventListener('change', handleFallbackFileSelect);
  if (btnLoadSample) btnLoadSample.addEventListener('click', loadSampleModels);
  if (btnRefreshFolders) {
    btnRefreshFolders.addEventListener('click', () => {
      refreshConnectedFolders();
    });
  }
  if (btnRefreshTrending) {
    btnRefreshTrending.addEventListener('click', () => {
      loadAndRenderTrending(true);
    });
  }
  if (trendingRangeGroup) {
    trendingRangeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.trending-range-btn');
      if (!btn || !btn.dataset.range) return;
      setTrendingRange(btn.dataset.range);
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (state.activeSection === 'trending') {
        e.preventDefault();
        loadAndRenderTrending(true);
      } else if (state.folders.length > 0) {
        e.preventDefault();
        refreshConnectedFolders();
      }
    }
  });

  // Navegação da Barra Lateral (Todos / Projetos / Favoritos / Em Alta / Duplicados)
  [navAllModels, navProjects, navFavorites, navTrending, navDuplicates].forEach(navBtn => {
    if (!navBtn) return;
    navBtn.addEventListener('click', () => {
      const section = navBtn.dataset.section || 'all';
      setNavSection(section);
    });
  });

  // Links externos de plataforma dentro da seção Em Alta
  document.querySelectorAll('.trending-platform-ext-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
        e.preventDefault();
        window.electronAPI.openExternalUrl(href);
      }
    });
  });

  // Chamada secundária: Exibir todas as pastas conectadas
  if (btnShowAllFolders) {
    btnShowAllFolders.addEventListener('click', () => {
      resetFolderFilter();
    });
  }

  // Busca e Filtros
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      state.currentPage = 1;
      renderGallery();
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter || 'all';
      state.currentPage = 1;
      renderGallery();
    });
  });

  // Controles de Tamanho de Página (50, 100, 150)
  [topPageSizeButtons, bottomPageSizeButtons].forEach(container => {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-size-btn');
      if (!btn) return;
      const newSize = parseInt(btn.dataset.size, 10);
      if ([50, 100, 150].includes(newSize)) {
        setPageSize(newSize);
      }
    });
  });

  // Seletor de Ordenação (Data, Nome, Tamanho)
  if (selectSortOrder) {
    selectSortOrder.value = state.sortOrder;
    selectSortOrder.addEventListener('change', (e) => {
      setSortOrder(e.target.value);
    });
  }


  if (btnSelectAllVisible) {
    btnSelectAllVisible.addEventListener('click', toggleSelectAllVisible);
  }

  const btnUploadProjectCover = document.getElementById('btnUploadProjectCover');
  const inputCustomCoverFile = document.getElementById('inputCustomCoverFile');
  if (btnUploadProjectCover && inputCustomCoverFile) {
    btnUploadProjectCover.addEventListener('click', () => {
      inputCustomCoverFile.click();
    });
    inputCustomCoverFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const customUrl = ev.target.result;
        state.selectedCustomCoverUrl = customUrl;
        state.selectedCoverKey = '__custom__';
        addCustomCoverCardToPicker(customUrl, file.name);
        showToast(`Foto "${file.name}" carregada para a capa do projeto! 🖼️`, 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnOpenCreateProjectModal) {
    btnOpenCreateProjectModal.addEventListener('click', openCreateProjectModal);
  }

  if (btnCancelSelection) {
    btnCancelSelection.addEventListener('click', clearSelection);
  }

  if (btnCloseCreateProjectModal) {
    btnCloseCreateProjectModal.addEventListener('click', closeCreateProjectModal);
  }

  if (btnCancelProjectCreation) {
    btnCancelProjectCreation.addEventListener('click', closeCreateProjectModal);
  }

  if (createProjectBackdrop) {
    createProjectBackdrop.addEventListener('click', closeCreateProjectModal);
  }

  if (btnConfirmProjectCreation) {
    btnConfirmProjectCreation.addEventListener('click', confirmCreateProject);
  }

  if (inputProjectName) {
    inputProjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmCreateProject();
      } else if (e.key === 'Escape') {
        closeCreateProjectModal();
      }
    });
  }

  // Navegação de Páginas
  if (btnPagePrev) {
    btnPagePrev.addEventListener('click', () => {
      if (state.currentPage > 1) {
        goToPage(state.currentPage - 1);
      }
    });
  }

  if (btnPageNext) {
    btnPageNext.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredModelsCount / state.pageSize));
      if (state.currentPage < totalPages) {
        goToPage(state.currentPage + 1);
      }
    });
  }

  if (paginationNumbers) {
    paginationNumbers.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-num-btn:not(.ellipsis)');
      if (!btn) return;
      const page = parseInt(btn.dataset.page, 10);
      if (page && page !== state.currentPage) {
        goToPage(page);
      }
    });
  }

  updatePageSizeButtonsUI();

  // Drag & Drop na Dropzone e na página
  setupDragAndDrop();

  // Modal Controls
  modalCloseBtn.addEventListener('click', closeViewerModal);
  if (btnModalOpenSlicer) {
    // Rótulo do botão principal conforme o ambiente (desktop abre no fatiador; web copia o caminho)
    const footerCfg = getSlicerButtonConfig();
    btnModalOpenSlicer.title = footerCfg.title;
    btnModalOpenSlicer.innerHTML = `${footerCfg.icon}<span>${escapeHtml(footerCfg.text)}</span>`;

    setupModelDraggable(btnModalOpenSlicer, () => {
      return (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover ? state.activePlate.model : null)
        || (state.activeProject ? (state.activeProject.primaryPart || (state.activeProject.parts && state.activeProject.parts[0])) : null)
        || state.activeModel;
    });

    btnModalOpenSlicer.addEventListener('click', () => {
      const modelToOpen = (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover ? state.activePlate.model : null)
        || (state.activeProject ? (state.activeProject.primaryPart || (state.activeProject.parts && state.activeProject.parts[0])) : null)
        || state.activeModel;
      if (modelToOpen) {
        openModelInSlicer(modelToOpen, btnModalOpenSlicer);
      }
    });

    // Setinha ao lado do botão para abrir em outro fatiador
    if (isSlicerChoiceSupported()) {
      const split = document.createElement('div');
      split.className = 'slicer-split slicer-split-modal';
      btnModalOpenSlicer.parentNode.insertBefore(split, btnModalOpenSlicer);
      split.appendChild(btnModalOpenSlicer);
      split.insertAdjacentHTML('beforeend', `<button class="btn-slicer-caret" type="button" title="Abrir em outro fatiador" aria-label="Abrir em outro fatiador" aria-haspopup="menu"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>`);
      wireSlicerCaret(split.querySelector('.btn-slicer-caret'), getModalSlicerTarget, btnModalOpenSlicer);
    }
  }
  initSlicerPicker();
  // Os botões mostram o último fatiador usado em cada arquivo (ou o padrão escolhido)
  onSlicersChanged(() => refreshSlicerLabels());
  if (modalPlateImg) {
    setupModelDraggable(modalPlateImg, () => {
      return (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover ? state.activePlate.model : null)
        || state.activeModel;
    });
  }
  viewerModal.addEventListener('click', (e) => {
    if (e.target === viewerModal) closeViewerModal();
  });
  window.addEventListener('keydown', (e) => {
    if (!viewerModal.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeViewerModal();
      return;
    }
    // Setas trocam de modelo, exceto quando o foco está num campo de texto
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing) return;
      e.preventDefault();
      navigateViewerModal(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  if (modalPathFolder) {
    new MutationObserver(syncModalPathShort).observe(modalPathFolder, { childList: true, characterData: true, subtree: true });
  }
  const btnPlatesPrev = document.getElementById('btnPlatesPrev');
  const btnPlatesNext = document.getElementById('btnPlatesNext');
  if (btnPlatesPrev) btnPlatesPrev.addEventListener('click', () => scrollPlates(-1));
  if (btnPlatesNext) btnPlatesNext.addEventListener('click', () => scrollPlates(1));
  if (platesList) {
    platesList.addEventListener('scroll', updatePlatesNav, { passive: true });
    // Roda do mouse sobre a faixa também passa as mesas
    platesList.addEventListener('wheel', (e) => {
      if (platesList.scrollWidth <= platesList.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        platesList.scrollBy({ left: e.deltaY });
      }
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(updatePlatesNav).observe(platesList);
  }
  if (btnModalPrev) btnModalPrev.addEventListener('click', () => navigateViewerModal(-1));
  if (btnModalNext) btnModalNext.addEventListener('click', () => navigateViewerModal(1));
  if (btnModalFavorite) {
    btnModalFavorite.addEventListener('click', () => {
      const item = state.modalItem;
      if (!item) return;
      toggleFavorite(item);
      updateModalHeaderExtras();
    });
  }

  btnResetView.addEventListener('click', resetModalCamera);
  btnToggleRotate.addEventListener('click', () => {
    state.isAutoRotating = !state.isAutoRotating;
    btnToggleRotate.style.color = state.isAutoRotating ? '#38bdf8' : 'var(--text-secondary)';
  });
  btnToggleWireframe.addEventListener('click', () => {
    if (state.modalMesh) {
      state.isWireframe = !state.isWireframe;
      state.modalMesh.material.wireframe = state.isWireframe;
      btnToggleWireframe.style.color = state.isWireframe ? '#38bdf8' : 'var(--text-secondary)';
    }
  });

  // Botões flutuantes: Abrir 3D e Retornar à foto da mesa
  if (btnOpen3DView) {
    btnOpen3DView.addEventListener('click', () => setViewerMode('3d'));
  }
  if (btnBackToPlate) {
    btnBackToPlate.addEventListener('click', () => setViewerMode('plate'));
  }
  if (modalPlateImg) {
    modalPlateImg.addEventListener('error', () => {
      const currentSrc = modalPlateImg.getAttribute('src');
      if (!currentSrc || currentSrc === '') return;
      if (state.activeModel && state.activeModel.thumbnailUrl && modalPlateImg.src !== state.activeModel.thumbnailUrl) {
        modalPlateImg.src = state.activeModel.thumbnailUrl;
      } else {
        modalPlateImg.style.display = 'none';
      }
    });
  }

  // Botões de reconexão de pastas salvas do IndexedDB
  if (btnReconnectAllFolders) {
    btnReconnectAllFolders.addEventListener('click', reconnectAllSavedFolders);
  }
  if (btnClearSavedFolders) {
    btnClearSavedFolders.addEventListener('click', async () => {
      await clearAllFoldersFromDB();
      if (savedFoldersCard) savedFoldersCard.style.display = 'none';
      showToast('Histórico de pastas salvas limpo com sucesso.');
    });
  }

  // Copiar caminho completo do arquivo ao clicar no botão ou no título
  if (btnCopyModalPath) {
    btnCopyModalPath.addEventListener('click', (e) => {
      e.stopPropagation();
      copyModalFullPath();
    });
  }

  // Abrir no Fatiador diretamente a partir do Modal 3D
  if (btnOpenModalSlicer) {
    if (window.electronAPI && window.electronAPI.isElectron) {
      btnOpenModalSlicer.style.display = 'inline-flex';
    }
    btnOpenModalSlicer.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentModel = (state.activePlate && state.activePlate.model) || state.activeModel;
      if (currentModel) {
        openModelInSlicer(currentModel, btnOpenModalSlicer);
      }
    });
  }


  // Inicializar Autenticação com Supabase / Magic Link
  initAuth((user) => {
    // Restaurar biblioteca salva apenas quando usuário estiver autenticado
    checkAndRestoreSavedFolders();

    // Estatísticas de uso: só abertura/fechamento do app, nenhum dado de arquivo
    startUsageTracking(user);

    // Pré-aquecer silenciosamente o cache da seção Em Alta em background
    setTimeout(() => {
      prefetchTrendingSilent();
    }, 3500);
  });

  // Resetar estado e visualização da biblioteca ao desconectar
  window.addEventListener('app:reset-library', () => {
    state.models = [];
    state.folders = [];
    state.currentPage = 1;
    state.activeSection = 'all';
    if (trendingContainer) trendingContainer.style.display = 'none';
    if (trendingRangeGroup) trendingRangeGroup.style.display = 'none';
    if (btnRefreshTrending) btnRefreshTrending.style.display = 'none';
    if (trendingUpdatedLabel) trendingUpdatedLabel.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (galleryContainer) galleryContainer.style.display = 'none';
    if (topPageSizeWrap) topPageSizeWrap.style.display = 'none';
    if (sortControlWrap) sortControlWrap.style.display = 'none';
    if (favoritesGrid) favoritesGrid.innerHTML = '';
    if (modelsGrid) modelsGrid.innerHTML = '';
    renderFolderChips();
    updateStatsBadge();
    updateDuplicatesFilterButton(0);
  });
}

/**
 * Copia o caminho completo do arquivo no disco para a área de transferência
 */
function copyModalFullPath() {
  if (!state.activeModel) return;
  const folderText = modalPathFolder ? modalPathFolder.textContent : '';
  const nameText = modalPathName ? modalPathName.textContent : state.activeModel.name;
  const fullPath = state.activeModel.fullDiskPath || `${folderText}${nameText}`;
  if (fullPath) {
    navigator.clipboard.writeText(fullPath).then(() => {
      showToast('Caminho copiado para a área de transferência! 📋', 'success');
    }).catch(() => {
      showToast(fullPath, 'info');
    });
  }
}

/**
 * Alterna a seção ativa da biblioteca (Todos os Modelos, Projetos, Favoritos, Em Alta, Duplicados)
 */
function setNavSection(section) {
  state.activeSection = section;
  state.currentPage = 1;

  [navAllModels, navProjects, navFavorites, navTrending, navDuplicates].forEach(btn => {
    if (btn) btn.classList.toggle('active', btn.dataset.section === section);
  });

  if (section === 'trending') {
    if (currentViewTitle) currentViewTitle.textContent = 'Em Alta';
    updateTrendingRangeUI();
    if (dropZone) dropZone.style.display = 'none';
    if (galleryContainer) galleryContainer.style.display = 'none';
    if (sortControlWrap) sortControlWrap.style.display = 'none';
    if (topPageSizeWrap) topPageSizeWrap.style.display = 'none';
    if (btnRefreshFolders) btnRefreshFolders.style.display = 'none';
    if (selectionActionBar) selectionActionBar.style.display = 'none';
    if (trendingContainer) trendingContainer.style.display = 'flex';
    if (trendingRangeGroup) trendingRangeGroup.style.display = 'inline-flex';
    if (btnRefreshTrending) btnRefreshTrending.style.display = 'inline-flex';
    loadAndRenderTrending(false);
    return;
  }

  if (trendingContainer) trendingContainer.style.display = 'none';
  if (trendingRangeGroup) trendingRangeGroup.style.display = 'none';
  if (btnRefreshTrending) btnRefreshTrending.style.display = 'none';
  if (trendingUpdatedLabel) trendingUpdatedLabel.style.display = 'none';
  if (shellSubtitle) {
    shellSubtitle.textContent = 'Seus arquivos STL e 3MF, lidos direto do seu computador.';
  }
  if (btnRefreshFolders) {
    btnRefreshFolders.style.display = state.folders.length > 0 ? 'inline-flex' : 'none';
  }
  if (state.models.length === 0) {
    if (dropZone) dropZone.style.display = 'block';
    if (galleryContainer) galleryContainer.style.display = 'none';
  } else {
    if (dropZone) dropZone.style.display = 'none';
    if (galleryContainer) galleryContainer.style.display = 'block';
  }

  if (currentViewTitle) {
    if (section === 'projects') {
      currentViewTitle.textContent = 'Projetos Multi-mesas';
      if (currentViewSub) currentViewSub.textContent = 'Modelos organizados em projetos com múltiplas peças e mesas';
    } else if (section === 'favorites') {
      currentViewTitle.textContent = 'Favoritos';
      if (currentViewSub) currentViewSub.textContent = 'Modelos marcados com estrela';
    } else if (section === 'duplicates') {
      currentViewTitle.textContent = 'Arquivos Duplicados';
      if (currentViewSub) currentViewSub.textContent = 'Modelos com conteúdo idêntico na biblioteca';
    } else {
      currentViewTitle.textContent = 'Todos os Modelos';
      if (currentViewSub) currentViewSub.textContent = 'Visualização de galeria';
    }
  }

  renderGallery();
}

/**
 * Ponto de entrada ao clicar em "Adicionar Pasta"
 * Abre diretamente o seletor nativo de pasta do Windows
 */
async function handleChooseFolder() {
  proceedWithDirectoryPicker();
}

/**
 * Executa a seleção da pasta no navegador
 */
async function proceedWithDirectoryPicker() {
  if (window.electronAPI && typeof window.electronAPI.selectFolderDialog === 'function') {
    try {
      const res = await window.electronAPI.selectFolderDialog();
      if (!res.canceled && res.folderPath) {
        if (state.folders.some(f => f.name.toLowerCase() === res.folderName.toLowerCase())) {
          showToast(`A pasta "${res.folderName}" já está na biblioteca.`, 'warning');
          return;
        }
        const scanRes = await window.electronAPI.scanFolderDisk(res.folderPath);
        if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
          const files = scanRes.files.map(item => ({
            file: createDesktopFileProxy(item.fullDiskPath, item.name, item.size, item.lastModified),
            name: item.name,
            size: item.size,
            lastModified: item.lastModified,
            type: item.type,
            path: item.path,
            fullDiskPath: item.fullDiskPath,
            fullFolderDirectory: scanRes.folderPath + '\\',
            handle: null,
            parentHandle: null
          }));
          state.folderDiskPaths[res.folderName] = res.folderPath;
          saveFolderDiskPaths();
          await addFilesToLibrary(files, res.folderName, null, true);
        } else {
          showToast(`Nenhum arquivo 3D (.STL ou .3MF) foi encontrado em "${res.folderName}".`, 'warning');
        }
      }
      return;
    } catch (e) {
      console.warn('Erro ao selecionar pasta via diálogo nativo:', e);
    }
  }

  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      if (state.folders.some(f => f.name.toLowerCase() === dirHandle.name.toLowerCase())) {
        showToast(`A pasta "${dirHandle.name}" já está na biblioteca.`, 'warning');
        return;
      }
      const files = await scanDirectoryHandle(dirHandle);
      addFilesToLibrary(files, dirHandle.name, dirHandle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Erro ao abrir pasta com showDirectoryPicker, tentando fallback:', err);
        folderInputFallback.click();
      }
    }
  } else {
    folderInputFallback.click();
  }
}

/**
 * Varre recursivamente diretórios com a File System Access API
 */
async function scanDirectoryHandle(dirHandle, path = '') {
  let results = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (ext === 'stl' || ext === '3mf') {
        const file = await entry.getFile();
        results.push({
          file,
          name: entry.name,
          size: file.size,
          lastModified: file.lastModified || Date.now(),
          type: ext,
          path: path ? `${path}/${entry.name}` : entry.name,
          handle: entry,
          parentHandle: dirHandle
        });
      }
    } else if (entry.kind === 'directory') {
      try {
        const subFiles = await scanDirectoryHandle(entry, path ? `${path}/${entry.name}` : entry.name);
        results = results.concat(subFiles);
      } catch (e) {
        console.warn('Não foi possível ler subpasta:', entry.name, e);
      }
    }
  }
  return results;
}

/**
 * Trata seleção via input fallback (webkitdirectory)
 */
function handleFallbackFileSelect(e) {
  const fileList = Array.from(e.target.files);
  const validFiles = fileList
    .filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ext === 'stl' || ext === '3mf';
    })
    .map(file => ({
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || Date.now(),
      type: file.name.split('.').pop().toLowerCase(),
      path: file.webkitRelativePath || file.name
    }));

  const rootName = fileList[0]?.webkitRelativePath?.split('/')[0] || 'Pasta Selecionada';
  if (state.folders.some(f => f.name === rootName)) {
    showToast(`A pasta "${rootName}" já está na biblioteca.`, 'warning');
    e.target.value = '';
    return;
  }
  addFilesToLibrary(validFiles, rootName);
  e.target.value = '';
}

/**
 * Configura suporte a arrastar e soltar pastas
 */
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, (e) => {
      // Card arrastado para mover: só as pastas da barra lateral aceitam
      if (moveDrag) return;
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (moveDrag) return;
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const files = [];
    let rootName = 'Arquivos Arrastados';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle();
        if (handle.kind === 'directory') {
          rootName = handle.name;
          const scanned = await scanDirectoryHandle(handle);
          files.push(...scanned);
        } else if (handle.kind === 'file') {
          const ext = handle.name.split('.').pop().toLowerCase();
          if (ext === 'stl' || ext === '3mf') {
            const f = await handle.getFile();
            files.push({
              file: f,
              name: handle.name,
              size: f.size,
              lastModified: f.lastModified || Date.now(),
              type: ext,
              path: handle.name,
              handle
            });
          }
        }
      } else {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          rootName = entry.name;
          await scanWebkitEntry(entry, files);
        }
      }
    }

    if (files.length > 0) {
      if (state.folders.some(f => f.name === rootName)) {
        showToast(`A pasta "${rootName}" já está na biblioteca.`, 'warning');
        return;
      }
      addFilesToLibrary(files, rootName);
    }
  });
}

async function scanWebkitEntry(entry, results, path = '') {
  if (entry.isFile) {
    const ext = entry.name.split('.').pop().toLowerCase();
    if (ext === 'stl' || ext === '3mf') {
      const file = await new Promise(resolve => entry.file(resolve));
      results.push({
        file,
        name: entry.name,
        size: file.size,
        lastModified: file.lastModified || Date.now(),
        type: ext,
        path: path ? `${path}/${entry.name}` : entry.name
      });
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(resolve => reader.readEntries(resolve));
    for (const sub of entries) {
      await scanWebkitEntry(sub, results, path ? `${path}/${entry.name}` : entry.name);
    }
  }
}

/**
 * Carrega os modelos de exemplo incluídos para teste imediato
 */
async function loadSampleModels(persistToDB = true) {
  if (btnLoadSample) {
    btnLoadSample.disabled = true;
    btnLoadSample.textContent = 'Carregando exemplos...';
  }

  try {
    const sampleBaseTime = Date.now() - 3600000;
    const samples = [
      { name: 'cubo_calibracao_20mm.stl', url: './sample_models/cubo_calibracao_20mm.stl', type: 'stl', lastModified: sampleBaseTime },
      { name: 'piramide_teste.stl', url: './sample_models/piramide_teste.stl', type: 'stl', lastModified: sampleBaseTime - 60000 },
      { name: 'caixa_organizadora_fatiada.3mf', url: './sample_models/caixa_organizadora_fatiada.3mf', type: '3mf', lastModified: sampleBaseTime - 120000 }
    ];

    const loadedFiles = [];
    for (const sample of samples) {
      const res = await fetch(sample.url);
      const blob = await res.blob();
      const file = new File([blob], sample.name);
      loadedFiles.push({
        file,
        name: sample.name,
        size: blob.size,
        lastModified: sample.lastModified,
        type: sample.type,
        path: sample.name
      });
    }

    const sampleFolderName = 'Modelos de Exemplo (sample_models)';
    if (state.folders.some(f => f.name === sampleFolderName)) {
      showToast(`A pasta de exemplos já está na biblioteca.`, 'info');
      return;
    }
    await addFilesToLibrary(loadedFiles, sampleFolderName, null, persistToDB, 'sample-models');
  } catch (err) {
    alert('Erro ao carregar arquivos de exemplo: ' + err.message);
  } finally {
    if (btnLoadSample) {
      btnLoadSample.disabled = false;
      btnLoadSample.innerHTML = '✨ Testar com Modelos de Exemplo';
    }
  }
}

/**
 * Determina o grupo de ordenação de um nome de arquivo:
 * Grupo 0: Alfabeto padrão ocidental/latino (A-Z, números 0-9, caracteres acentuados usuais pt/en/fr/es)
 * Grupo 1: Escritas e alfabetos não-padrão (Kanji, ideogramas chineses, hiragana, katakana, hangul, etc.)
 */
function getSortGroup(filename) {
  const dotIdx = filename.lastIndexOf('.');
  const baseName = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;

  // Busca a primeira letra ou caractere alfabético no nome do arquivo
  const match = baseName.match(/\p{L}/u);
  if (match) {
    const firstLetter = match[0];
    // Se pertencer ao alfabeto latino (A-Z, a-z, acentuações como á, é, ç, etc.)
    if (/\p{Script=Latin}/u.test(firstLetter)) {
      return 0; // Padrão ocidental
    }
    // Caso seja Kanji, Chinês, Japonês, Coreano, etc.
    return 1; // Fim da lista
  }

  // Se não contiver letras (ex: apenas números '009', '1126' ou símbolos)
  // Verifica se há caracteres CJK ou ideogramas presentes
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(baseName)) {
    return 1;
  }

  // Números e símbolos convencionais pertencem ao grupo padrão
  return 0;
}

/**
 * Comparador alfabético: coloca alfabetos ocidentais (A-Z, números) primeiro
 * e alfabetos com kanjis, ideogramas e desenhos no final da lista.
 */
function compareModelNames(nameA, nameB) {
  const groupA = getSortGroup(nameA);
  const groupB = getSortGroup(nameB);

  // Se estiverem em grupos diferentes, o grupo 0 (padrão) vem antes do 1 (não-padrão)
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  // Dentro do mesmo grupo, aplica ordenação alfabética natural (sensível a números e case-insensitive)
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Altera o critério de ordenação da galeria, atualiza o select e persiste no localStorage
 */
function setSortOrder(newOrder) {
  const valid = ['date_desc', 'date_asc', 'name_asc', 'name_desc', 'size_desc', 'size_asc'];
  if (!valid.includes(newOrder)) return;

  state.sortOrder = newOrder;
  try {
    localStorage.setItem('antigravity_sort_order', newOrder);
  } catch (e) {}

  if (selectSortOrder && selectSortOrder.value !== newOrder) {
    selectSortOrder.value = newOrder;
  }

  state.currentPage = 1;
  renderGallery();

  const labels = {
    date_desc: 'Mais recentes primeiro 📅',
    date_asc: 'Mais antigos primeiro 📅',
    name_asc: 'Nome (A → Z) 🔤',
    name_desc: 'Nome (Z → A) 🔤',
    size_desc: 'Maior tamanho primeiro 📦',
    size_asc: 'Menor tamanho primeiro 📦'
  };
  showToast(`Ordenado por: ${labels[newOrder] || newOrder}`, 'info');
}

/**
 * Ordena a lista de modelos de acordo com o critério ativo no state.sortOrder
 */
function sortModels(items, sortOrder = state.sortOrder) {
  return items.slice().sort((a, b) => {
    switch (sortOrder) {
      case 'date_asc': { // Mais antigos primeiro
        const dateA = a.lastModified || (a.file && a.file.lastModified) || 0;
        const dateB = b.lastModified || (b.file && b.file.lastModified) || 0;
        if (dateA !== dateB) return dateA - dateB;
        return compareModelNames(a.name, b.name);
      }
      case 'date_desc': { // Mais recentes primeiro (Padrão)
        const dateA = a.lastModified || (a.file && a.file.lastModified) || 0;
        const dateB = b.lastModified || (b.file && b.file.lastModified) || 0;
        if (dateA !== dateB) return dateB - dateA;
        return compareModelNames(a.name, b.name);
      }
      case 'name_desc': { // Z -> A
        return compareModelNames(b.name, a.name);
      }
      case 'size_desc': { // Maior tamanho primeiro
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        if (sizeA !== sizeB) return sizeB - sizeA;
        return compareModelNames(a.name, b.name);
      }
      case 'size_asc': { // Menor tamanho primeiro
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        if (sizeA !== sizeB) return sizeA - sizeB;
        return compareModelNames(a.name, b.name);
      }
      case 'name_asc': // A -> Z
      default:
        return compareModelNames(a.name, b.name);
    }
  });
}

const FAVORITES_STORAGE_KEY = 'antigravity_3d_library_favorites';

/**
 * Carrega a lista de nomes/identificadores de favoritos do localStorage
 */
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    console.warn('Erro ao carregar favoritos do localStorage:', e);
    return new Set();
  }
}

/**
 * Salva a lista de favoritos no localStorage
 */
function saveFavorites(favSet) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favSet)));
  } catch (e) {
    console.warn('Erro ao salvar favoritos no localStorage:', e);
  }
}

/**
 * Salva o mapa de caminhos de pastas do disco no localStorage
 */
function saveFolderDiskPaths() {
  try {
    localStorage.setItem('vault3d_folder_disk_paths', JSON.stringify(state.folderDiskPaths || {}));
  } catch (e) {
    console.warn('Erro ao salvar caminhos de pasta no localStorage:', e);
  }
}

/**
 * Alterna o estado de favorito de um modelo
 */
function toggleFavorite(model) {
  const favs = loadFavorites();
  const key = model.name;
  if (model.isProject) {
    const isFav = favs.has(key);
    if (isFav) {
      favs.delete(key);
      model.isFavorite = false;
      if (model.parts) {
        model.parts.forEach(p => { favs.delete(p.name); p.isFavorite = false; });
      }
      showToast(`Projeto "${model.name}" removido dos favoritos.`);
    } else {
      favs.add(key);
      model.isFavorite = true;
      if (model.parts) {
        model.parts.forEach(p => { favs.add(p.name); p.isFavorite = true; });
      }
      showToast(`Projeto "${model.name}" adicionado aos favoritos! ⭐`, 'success');
    }
  } else {
    if (favs.has(key)) {
      favs.delete(key);
      model.isFavorite = false;
      showToast(`"${model.name}" removido dos favoritos.`);
    } else {
      favs.add(key);
      model.isFavorite = true;
      showToast(`"${model.name}" adicionado aos favoritos! ⭐`, 'success');
    }
  }
  saveFavorites(favs);
  renderGallery();
}

/**
 * Gera uma impressão digital única (fingerprint SHA-256) do arquivo.
 * Para arquivos pequenos (<= 2MB), processa o buffer completo.
 * Para arquivos grandes (> 2MB), usa amostragem ultra-rápida: tamanho + 64KB início + 64KB meio + 64KB fim.
 */
async function computeFileFingerprint(file) {
  if (!file) return null;
  try {
    const CHUNK_SIZE = 64 * 1024; // 64 KB
    let bufferToHash;

    if (file.size <= 2 * 1024 * 1024) {
      bufferToHash = await file.arrayBuffer();
    } else {
      const slice1 = file.slice(0, CHUNK_SIZE);
      const mid = Math.floor(file.size / 2);
      const slice2 = file.slice(mid, mid + CHUNK_SIZE);
      const slice3 = file.slice(file.size - CHUNK_SIZE, file.size);

      const [buf1, buf2, buf3] = await Promise.all([
        slice1.arrayBuffer(),
        slice2.arrayBuffer(),
        slice3.arrayBuffer()
      ]);

      const sizeBuf = new ArrayBuffer(8);
      new DataView(sizeBuf).setBigUint64(0, BigInt(file.size), false);

      const totalLen = 8 + buf1.byteLength + buf2.byteLength + buf3.byteLength;
      const combined = new Uint8Array(totalLen);
      combined.set(new Uint8Array(sizeBuf), 0);
      combined.set(new Uint8Array(buf1), 8);
      combined.set(new Uint8Array(buf2), 8 + buf1.byteLength);
      combined.set(new Uint8Array(buf3), 8 + buf1.byteLength + buf2.byteLength);

      bufferToHash = combined.buffer;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', bufferToHash);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('Erro ao calcular fingerprint do arquivo:', file.name, err);
    return `fallback-${file.size}-${file.name}`;
  }
}

/**
 * Atualiza o status de arquivos duplicados em toda a coleção
 */
async function updateDuplicatesState() {
  const hashMap = new Map();

  // 1. Garantir que todos os modelos tenham seu fingerprint calculado
  for (const model of state.models) {
    if (!model.fingerprint && model.file) {
      model.fingerprint = await computeFileFingerprint(model.file);
    }
    if (model.fingerprint) {
      if (!hashMap.has(model.fingerprint)) {
        hashMap.set(model.fingerprint, []);
      }
      hashMap.get(model.fingerprint).push(model);
    }
  }

  // 2. Marcar quais modelos são cópias duplicadas
  let totalDuplicatesCount = 0;
  for (const model of state.models) {
    const list = model.fingerprint ? hashMap.get(model.fingerprint) : [];
    if (list && list.length > 1) {
      model.isDuplicate = true;
      const others = list.filter(m => m.id !== model.id);
      model.duplicatesCount = others.length;
      model.duplicateOrigins = others.map(m => `${m.folderName} / ${m.name}`).join(', ');
      totalDuplicatesCount++;
    } else {
      model.isDuplicate = false;
      model.duplicatesCount = 0;
      model.duplicateOrigins = '';
    }
  }

  // 3. Atualizar botão do filtro de duplicados na barra de ferramentas
  updateDuplicatesFilterButton(totalDuplicatesCount);

  // 4. Re-renderizar galeria para refletir selos e filtros
  renderGallery();
}

/**
 * Atualiza a visibilidade e o contador de duplicados na navegação da sidebar
 */
function updateDuplicatesFilterButton(duplicatesCount) {
  if (sidebarDuplicatesCountBadge) sidebarDuplicatesCountBadge.textContent = duplicatesCount;
  if (navDuplicates) {
    navDuplicates.style.display = duplicatesCount > 0 ? 'flex' : 'none';
  }
  if (duplicatesCount === 0 && state.activeSection === 'duplicates') {
    setNavSection('all');
  }
  // Mantém o bloco de duplicados da faixa de resumo em dia após a varredura
  updateStatsBadge();
}

// ==========================================
// Persistência de Pastas e Cache de Thumbnails com IndexedDB
// ==========================================
const DB_NAME = 'antigravity_3d_db';
const DB_VERSION = 2;
const STORE_FOLDERS = 'folders';
const STORE_THUMBS = 'thumbnails_cache';

function openFoldersDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBS)) {
        db.createObjectStore(STORE_THUMBS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gera uma chave única e determinística para o arquivo no cache do IndexedDB
 */
function getModelCacheKey(model) {
  const lastMod = model.file?.lastModified || 0;
  // 3MF ganhou leitura de tempo/filamento, autor, impressora e anexos: prefixo força uma nova leitura uma única vez
  const version = model.type === '3mf' ? 's4:' : '';
  return `${version}${model.folderName || ''}:${model.path || model.name}:${model.size}:${lastMod}`;
}

/**
 * Recupera miniatura e metadados persistidos do IndexedDB
 */
async function getCachedThumbnail(key) {
  if (!key) return null;
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return null;
    const tx = db.transaction(STORE_THUMBS, 'readonly');
    const store = tx.objectStore(STORE_THUMBS);
    const req = store.get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Erro ao ler thumbnail do cache IndexedDB:', err);
    return null;
  }
}

/**
 * Salva miniatura e metadados no cache persistente do IndexedDB
 */
async function saveCachedThumbnail(key, data) {
  if (!key || !data || !data.thumbnailUrl) return false;
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return false;
    const tx = db.transaction(STORE_THUMBS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBS);
    store.put({
      key,
      thumbnailUrl: data.thumbnailUrl,
      defaultThumbnailUrl: data.defaultThumbnailUrl || data.thumbnailUrl || null,
      coverSource: data.coverSource || 'auto',
      customCoverUrl: data.customCoverUrl || null,
      metadata: data.metadata || null,
      slicerData: data.slicerData || null,
      plates: data.plates || [],
      extras: data.extras || null,
      cachedAt: Date.now()
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao salvar thumbnail no cache IndexedDB:', err);
    return false;
  }
}

/**
 * Limpa todo o cache de miniaturas do IndexedDB
 */
async function clearThumbnailCache() {
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return true;
    const tx = db.transaction(STORE_THUMBS, 'readwrite');
    tx.objectStore(STORE_THUMBS).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao limpar cache de thumbnails:', err);
    return false;
  }
}

async function saveFolderToDB(folderData) {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    const store = tx.objectStore(STORE_FOLDERS);

    // Evitar duplicar registros para o mesmo nome de pasta
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const all = getAllReq.result || [];
      for (const item of all) {
        if (item.name && folderData.name && item.name.toLowerCase() === folderData.name.toLowerCase() && item.id !== folderData.id) {
          store.delete(item.id);
        }
      }
      store.put({
        id: folderData.id,
        name: folderData.name,
        handle: folderData.handle || null,
        count: folderData.count || 0,
        isSample: !!folderData.isSample,
        diskPath: folderData.diskPath || (state.folderDiskPaths && state.folderDiskPaths[folderData.name]) || null,
        savedAt: Date.now()
      });
    };

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao salvar pasta no IndexedDB:', err);
    return false;
  }
}

async function removeFolderFromDB(folderId) {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    const store = tx.objectStore(STORE_FOLDERS);
    store.delete(folderId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao remover pasta do IndexedDB:', err);
    return false;
  }
}

async function clearAllFoldersFromDB() {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    tx.objectStore(STORE_FOLDERS).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao limpar pastas no IndexedDB:', err);
    return false;
  }
}

async function getAllFoldersFromDB() {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readonly');
    const store = tx.objectStore(STORE_FOLDERS);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const raw = req.result || [];
        // Deduplicar pastas salvas por nome
        const unique = [];
        const seenNames = new Set();
        for (const item of raw) {
          const key = (item.name || '').trim().toLowerCase();
          if (key && !seenNames.has(key)) {
            seenNames.add(key);
            unique.push(item);
          }
        }
        resolve(unique);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Erro ao ler pastas do IndexedDB:', err);
    return [];
  }
}

/**
 * Cria um objeto compatível com a interface Web File para arquivos no modo Desktop (Electron)
 * Permite leitura sob demanda (lazy) sem carregar gigabytes de arquivos na memória RAM.
 */
function createDesktopFileProxy(fullDiskPath, name, size, lastModified) {
  return {
    name,
    size: size || 0,
    lastModified: lastModified || Date.now(),
    fullDiskPath,
    async arrayBuffer() {
      if (window.electronAPI && typeof window.electronAPI.readFile === 'function') {
        const raw = await window.electronAPI.readFile(fullDiskPath);
        if (raw instanceof ArrayBuffer) return raw;
        if (raw && raw.buffer instanceof ArrayBuffer) {
          return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        }
        return raw;
      }
      const res = await fetch('file:///' + fullDiskPath.replace(/\\/g, '/'));
      return await res.arrayBuffer();
    },
    slice(start = 0, end = size) {
      const targetStart = Math.max(0, start);
      const targetEnd = Math.min(size, end !== undefined ? end : size);
      const chunkLength = Math.max(0, targetEnd - targetStart);
      return {
        size: chunkLength,
        async arrayBuffer() {
          if (window.electronAPI && typeof window.electronAPI.readFileChunk === 'function') {
            const raw = await window.electronAPI.readFileChunk(fullDiskPath, targetStart, chunkLength);
            if (raw instanceof ArrayBuffer) return raw;
            if (raw && raw.buffer instanceof ArrayBuffer) {
              return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
            }
            return raw;
          }
          const fullBuf = await this.arrayBuffer();
          return fullBuf.slice(targetStart, targetEnd);
        }
      };
    },
    async getBlob() {
      const buf = await this.arrayBuffer();
      return new Blob([buf], { type: 'application/octet-stream' });
    }
  };
}

let isRestoringSavedFolders = false;

/**
 * Verifica no IndexedDB se há pastas salvas de sessões anteriores
 * e tenta restaurá-las automaticamente ou exibe o card de reconexão.
 */
async function checkAndRestoreSavedFolders() {
  if (isRestoringSavedFolders) return;
  isRestoringSavedFolders = true;

  try {
    const savedFolders = await getAllFoldersFromDB();
    if (!savedFolders || savedFolders.length === 0) {
      if (savedFoldersCard) savedFoldersCard.style.display = 'none';
      return;
    }

    const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);

    // Filtrar pastas válidas (no desktop, suporta handle OU caminho no disco)
    const validSaved = savedFolders.filter(f => 
      f.isSample || 
      (f.handle && typeof f.handle.queryPermission === 'function') ||
      (isElectron && (f.diskPath || state.folderDiskPaths?.[f.name] || f.name))
    );
    if (validSaved.length === 0) {
      if (savedFoldersCard) savedFoldersCard.style.display = 'none';
      return;
    }

    // Se todas as pastas salvas já estão na memória e os modelos já foram carregados, não duplicar!
    const allAlreadyLoaded = validSaved.every(f => 
      state.folders.some(sf => sf.id === f.id || (sf.name && sf.name.toLowerCase() === f.name.toLowerCase()))
    );
    if (allAlreadyLoaded && state.models.length > 0) {
      if (savedFoldersCard) savedFoldersCard.style.display = 'none';
      return;
    }

    // 1. MODO DESKTOP (ELECTRON): Restauração nativa direta e silenciosa!
    // Sem prompts de permissão, abrindo a biblioteca instantaneamente ao iniciar o app.
    if (isElectron) {
      let restoredCount = 0;
      for (const f of validSaved) {
        if (state.folders.some(sf => sf.id === f.id || (sf.name && sf.name.toLowerCase() === f.name.toLowerCase()))) {
          continue;
        }

        if (f.isSample) {
          await loadSampleModels(false);
          restoredCount++;
          continue;
        }

        const diskPathCandidate = f.diskPath || state.folderDiskPaths?.[f.name] || f.name;
        try {
          const scanRes = await window.electronAPI.scanFolderDisk(diskPathCandidate);
          if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
            const files = scanRes.files.map(item => ({
              file: createDesktopFileProxy(item.fullDiskPath, item.name, item.size, item.lastModified),
              name: item.name,
              size: item.size,
              lastModified: item.lastModified,
              type: item.type,
              path: item.path,
              fullDiskPath: item.fullDiskPath,
              fullFolderDirectory: scanRes.folderPath + '\\',
              handle: f.handle || null,
              parentHandle: null
            }));

            state.folderDiskPaths[f.name] = scanRes.folderPath;
            saveFolderDiskPaths();

            await addFilesToLibrary(files, f.name, f.handle, false, f.id);
            restoredCount++;
          }
        } catch (err) {
          console.warn('Falha na restauração nativa da pasta salva:', f.name, err);
        }
      }

      if (restoredCount > 0 || state.folders.length > 0) {
        if (savedFoldersCard) savedFoldersCard.style.display = 'none';
        showToast(`Biblioteca restaurada com ${state.folders.length} pasta(s) salva(s)! 📂`, 'success');
        return;
      }
    }

    // 2. MODO WEB (File System Access API): Verificar se permissão já está concedida
    let allGranted = true;
    for (const f of validSaved) {
      if (!f.isSample && f.handle) {
        try {
          const perm = await f.handle.queryPermission({ mode: 'read' });
          if (perm !== 'granted') {
            allGranted = false;
          }
        } catch (_) {
          allGranted = false;
        }
      }
    }

    // Se todas já tiverem permissão concedida
    if (allGranted) {
      for (const f of validSaved) {
        // Pular se a pasta já estiver carregada no estado
        if (state.folders.some(sf => sf.id === f.id || (sf.name && sf.name.toLowerCase() === f.name.toLowerCase()))) {
          continue;
        }

        if (f.isSample) {
          await loadSampleModels(false);
        } else if (f.handle) {
          try {
            const files = await scanDirectoryHandle(f.handle);
            await addFilesToLibrary(files, f.name, f.handle, false, f.id);
          } catch (err) {
            console.warn('Erro ao restaurar pasta salva:', f.name, err);
          }
        }
      }
      if (state.folders.length > 0) {
        if (savedFoldersCard) savedFoldersCard.style.display = 'none';
        showToast(`Biblioteca restaurada com ${state.folders.length} pasta(s) salva(s)! 📂`, 'success');
        return;
      }
    }

    // Se precisar de gesto do usuário para solicitar permissão, exibe o card de reconexão
    renderSavedFoldersCard(validSaved);
  } finally {
    isRestoringSavedFolders = false;
  }
}

function renderSavedFoldersCard(savedFolders) {
  if (!savedFoldersCard) return;
  savedFoldersCard.style.display = 'block';
  if (savedFoldersCount) savedFoldersCount.textContent = savedFolders.length;

  if (savedFoldersPreviewList) {
    savedFoldersPreviewList.innerHTML = '';
    savedFolders.forEach(f => {
      const item = document.createElement('div');
      item.className = 'saved-folder-preview-item';
      item.innerHTML = `
        <span class="saved-folder-name">
          <span>📁</span>
          <span>${escapeHtml(f.name)}</span>
        </span>
        <span class="saved-folder-meta">${f.count ? `~${f.count} modelos` : 'Pasta local'}</span>
      `;
      savedFoldersPreviewList.appendChild(item);
    });
  }
}

async function reconnectAllSavedFolders() {
  const savedFolders = await getAllFoldersFromDB();
  if (!savedFolders || savedFolders.length === 0) return;

  btnReconnectAllFolders.disabled = true;
  btnReconnectAllFolders.innerHTML = '<span>Reconectando...</span>';

  let reconnectedCount = 0;

  for (const f of savedFolders) {
    // Pular se já estiver conectada
    if (state.folders.some(sf => sf.id === f.id || (sf.name && sf.name.toLowerCase() === f.name.toLowerCase()))) {
      continue;
    }
    if (f.isSample) {
      await loadSampleModels(false);
      reconnectedCount++;
      continue;
    }

    // No desktop, tenta primeiro via varredura nativa do disco
    if (window.electronAPI && typeof window.electronAPI.scanFolderDisk === 'function') {
      try {
        const diskPathCandidate = f.diskPath || state.folderDiskPaths?.[f.name] || f.name;
        const scanRes = await window.electronAPI.scanFolderDisk(diskPathCandidate);
        if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
          const files = scanRes.files.map(item => ({
            file: createDesktopFileProxy(item.fullDiskPath, item.name, item.size, item.lastModified),
            name: item.name,
            size: item.size,
            lastModified: item.lastModified,
            type: item.type,
            path: item.path,
            fullDiskPath: item.fullDiskPath,
            fullFolderDirectory: scanRes.folderPath + '\\',
            handle: f.handle || null,
            parentHandle: null
          }));
          state.folderDiskPaths[f.name] = scanRes.folderPath;
          saveFolderDiskPaths();
          await addFilesToLibrary(files, f.name, f.handle, false, f.id);
          reconnectedCount++;
          continue;
        }
      } catch (errN) {
        console.warn('Falha na reconexão nativa:', f.name, errN);
      }
    }

    // Fallback Web com File System Access Handle
    if (f.handle) {
      try {
        let perm = await f.handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          perm = await f.handle.requestPermission({ mode: 'read' });
        }
        if (perm === 'granted') {
          const files = await scanDirectoryHandle(f.handle);
          await addFilesToLibrary(files, f.name, f.handle, false, f.id);
          reconnectedCount++;
        } else {
          showToast(`Permissão não concedida para "${f.name}".`, 'warning');
        }
      } catch (err) {
        console.warn('Erro ao reconectar pasta:', f.name, err);
        showToast(`Não foi possível abrir "${f.name}": ${err.message}`, 'error');
      }
    }
  }

  btnReconnectAllFolders.disabled = false;
  btnReconnectAllFolders.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
    </svg>
    <span>Reconectar Pastas Salvas</span>
  `;

  if (reconnectedCount > 0) {
    if (savedFoldersCard) savedFoldersCard.style.display = 'none';
    showToast(`Biblioteca restaurada com ${reconnectedCount} pasta(s)! ⭐`, 'success');
  }
}

/**
 * Adiciona uma pasta e seus arquivos 3D à biblioteca existente (suporte a múltiplas pastas)
 */
async function addFilesToLibrary(files, folderName, dirHandle = null, persistToDB = true, existingFolderId = null) {
  if (!files || files.length === 0) {
    showToast(`Nenhum arquivo 3D (.STL ou .3MF) foi encontrado em "${folderName}".`, 'warning');
    return;
  }

  const folderId = existingFolderId || ('folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
  const savedFavs = loadFavorites();

  const newModels = files.map((item, index) => ({
    id: `model-${folderId}-${index}-${Date.now()}`,
    folderId,
    folderName,
    file: item.file,
    name: item.name,
    size: item.size,
    lastModified: item.lastModified || (item.file && item.file.lastModified) || Date.now(),
    type: item.type,
    path: item.path,
    handle: item.handle || null,
    parentHandle: item.parentHandle || null,
    isFavorite: savedFavs.has(item.name) || (item.path && savedFavs.has(item.path)),
    thumbnailUrl: null,
    metadata: null,
    slicerData: null,
    plates: [],
    loadingThumbnail: false,
    fingerprint: null,
    isDuplicate: false,
    duplicatesCount: 0,
    duplicateOrigins: ''
  }));

  // Pré-determinar o caminho base da pasta no disco
  const rootBase = (state.folderDiskPaths && state.folderDiskPaths[folderName]) || (
    folderName.includes('sample_models')
      ? 'C:\\Users\\eustudio\\Desktop\\Projeto\\sample_models'
      : `C:\\Users\\eustudio\\Downloads\\${folderName}`
  );

  if (!state.folderDiskPaths[folderName]) {
    state.folderDiskPaths[folderName] = rootBase;
    saveFolderDiskPaths();
  }

  // Pré-calcular o caminho completo em disco para cada modelo
  newModels.forEach(m => {
    let sub = (m.path || m.name).replace(/\//g, '\\');
    if (sub.toLowerCase().startsWith(folderName.toLowerCase() + '\\')) {
      sub = sub.substring(folderName.length + 1);
    }
    m.fullFolderDirectory = rootBase + '\\';
    m.fullDiskPath = `${rootBase}\\${sub}`.replace(/\\\\+/g, '\\');
  });

  // Evitar duplicar pasta se já existir com o mesmo nome ou ID
  const existingFolderIndex = state.folders.findIndex(f => 
    (existingFolderId && f.id === existingFolderId) || 
    (f.name && f.name.toLowerCase() === folderName.toLowerCase())
  );

  if (existingFolderIndex !== -1) {
    const existing = state.folders[existingFolderIndex];
    // Limpar modelos antigos dessa pasta para evitar duplicatas em memória
    state.models = state.models.filter(m => m.folderId !== existing.id);
    state.folders.splice(existingFolderIndex, 1);
  }

  // Registrar a pasta no estado
  state.folders.push({
    id: folderId,
    name: folderName,
    handle: dirHandle,
    count: newModels.length
  });

  // Pré-resolver caminho no disco iniciando em C:\ para agilizar a exibição e tooltips
  if (files[0]) {
    const handleResolvedPath = (data) => {
      if (data && data.rootFolder) {
        state.folderDiskPaths[folderName] = data.rootFolder;
        saveFolderDiskPaths();
        updateFolderTooltip(folderName, data.rootFolder);
      }
    };

    if (window.electronAPI && typeof window.electronAPI.resolveDiskPath === 'function') {
      window.electronAPI.resolveDiskPath(folderName, files[0].path || files[0].name)
        .then(handleResolvedPath)
        .catch(() => {});
    } else {
      const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const localBase = isLocalHost ? '' : 'http://127.0.0.1:3000';
      fetch(`${localBase}/api/resolve-path?folder=${encodeURIComponent(folderName)}&path=${encodeURIComponent(files[0].path || files[0].name)}`)
        .then(res => res.ok ? res.json() : null)
        .then(handleResolvedPath)
        .catch(() => {});
    }
  }

  // Salvar no IndexedDB se solicitado
  if (persistToDB) {
    await saveFolderToDB({
      id: folderId,
      name: folderName,
      handle: dirHandle,
      count: newModels.length,
      isSample: folderName.includes('sample_models'),
      diskPath: state.folderDiskPaths?.[folderName] || null
    });
  }

  // Acrescentar modelos ao acervo global
  state.models.push(...newModels);

  // Ordenar todos os modelos alfabeticamente (A-Z ocidentais primeiro, Kanjis/CJK ao final)
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  // Atualizar visualização para exibir a galeria (exceto se o usuário estiver na aba Em Alta)
  if (state.activeSection !== 'trending') {
    dropZone.style.display = 'none';
    galleryContainer.style.display = 'block';
  }

  renderFolderChips();
  updateStatsBadge();
  if (state.activeSection !== 'trending') {
    renderGallery();
  }

  // Calcular impressões digitais e detectar duplicatas em background
  updateDuplicatesState();

  showToast(`Pasta "${folderName}" adicionada com ${newModels.length} modelo(s)!`, 'success');
}

let isRefreshingFolders = false;

/**
 * Re-escaneia incrementalmente todas as pastas conectadas para detectar novos arquivos
 * ou arquivos removidos/atualizados sem perder miniaturas já carregadas nem filtros ativos.
 */
async function refreshConnectedFolders() {
  if (isRefreshingFolders) return;
  if (!state.folders || state.folders.length === 0) {
    showToast('Nenhuma pasta conectada para atualizar.', 'info');
    return;
  }

  isRefreshingFolders = true;
  const labelSpan = btnRefreshFolders ? btnRefreshFolders.querySelector('span') : null;
  if (btnRefreshFolders) {
    btnRefreshFolders.disabled = true;
    btnRefreshFolders.classList.add('is-refreshing');
  }
  if (labelSpan) labelSpan.textContent = 'Atualizando...';

  const normRelKey = (p, fName) => {
    let rel = (p || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (fName && rel.toLowerCase().startsWith(fName.toLowerCase() + '/')) {
      rel = rel.substring(fName.length + 1);
    }
    return rel.toLowerCase();
  };

  try {
    const savedFolders = await getAllFoldersFromDB();
    const savedFavs = loadFavorites();

    let totalAdded = 0;
    let totalRemoved = 0;
    let totalUpdated = 0;

    for (const folder of [...state.folders]) {
      if (folder.name && folder.name.includes('sample_models')) continue;

      const savedEntry = (savedFolders || []).find(
        sf => sf.id === folder.id || (sf.name && folder.name && sf.name.toLowerCase() === folder.name.toLowerCase())
      );

      let scannedFiles = null;
      let resolvedRootPath = null;

      // 1. Modo Desktop (Electron): varredura nativa direta no disco
      if (window.electronAPI && typeof window.electronAPI.scanFolderDisk === 'function') {
        const diskPathCandidate = getFolderRootPath(folder)
          || (savedEntry && savedEntry.diskPath)
          || (state.folderDiskPaths && state.folderDiskPaths[folder.name])
          || folder.name;

        if (diskPathCandidate) {
          try {
            const scanRes = await window.electronAPI.scanFolderDisk(diskPathCandidate);
            if (scanRes && scanRes.success && Array.isArray(scanRes.files)) {
              resolvedRootPath = scanRes.folderPath || diskPathCandidate;
              state.folderDiskPaths[folder.name] = resolvedRootPath;
              saveFolderDiskPaths();
              scannedFiles = scanRes.files.map(item => ({
                file: createDesktopFileProxy(item.fullDiskPath, item.name, item.size, item.lastModified),
                name: item.name,
                size: item.size,
                lastModified: item.lastModified,
                type: item.type,
                path: item.path,
                fullDiskPath: item.fullDiskPath,
                fullFolderDirectory: resolvedRootPath + '\\',
                handle: null,
                parentHandle: null
              }));
            }
          } catch (errScan) {
            console.warn('Falha ao atualizar pasta no disco:', folder.name, errScan);
          }
        }
      }

      // 2. Fallback Web: FileSystemDirectoryHandle
      const dirHandle = folder.handle || (savedEntry && savedEntry.handle);
      if (scannedFiles === null && dirHandle) {
        try {
          let perm = await dirHandle.queryPermission({ mode: 'read' });
          if (perm !== 'granted') {
            perm = await dirHandle.requestPermission({ mode: 'read' });
          }
          if (perm === 'granted') {
            scannedFiles = await scanDirectoryHandle(dirHandle);
          }
        } catch (errWeb) {
          console.warn('Falha ao atualizar pasta via handle web:', folder.name, errWeb);
        }
      }

      if (!Array.isArray(scannedFiles)) continue;

      const existingModels = state.models.filter(m => m.folderId === folder.id);
      const existingByKey = new Map();
      existingModels.forEach(m => {
        existingByKey.set(normRelKey(m.path || m.name, folder.name), m);
      });

      const seenKeys = new Set();
      const rootBase = resolvedRootPath
        || getFolderRootPath(folder)
        || (state.folderDiskPaths && state.folderDiskPaths[folder.name])
        || `C:\\Users\\eustudio\\Downloads\\${folder.name}`;

      scannedFiles.forEach((item, index) => {
        const key = normRelKey(item.path || item.name, folder.name);
        seenKeys.add(key);
        const existing = existingByKey.get(key);

        if (existing) {
          const itemLastMod = item.lastModified || (item.file && item.file.lastModified) || 0;
          const sizeChanged = typeof item.size === 'number' && existing.size !== item.size;
          const timeChanged = itemLastMod > 0 && existing.lastModified > 0 && existing.lastModified !== itemLastMod;

          if (sizeChanged || timeChanged) {
            existing.size = item.size;
            existing.lastModified = itemLastMod || existing.lastModified;
            existing.file = item.file;
            existing.thumbnailUrl = null;
            existing.defaultThumbnailUrl = null;
            existing.metadata = null;
            existing.slicerData = null;
            existing.plates = [];
            existing.extras = undefined;
            existing.fingerprint = null;
            totalUpdated++;
          }
        } else {
          let sub = (item.path || item.name).replace(/\//g, '\\');
          if (sub.toLowerCase().startsWith(folder.name.toLowerCase() + '\\')) {
            sub = sub.substring(folder.name.length + 1);
          }
          const newModel = {
            id: `model-${folder.id}-sync-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`,
            folderId: folder.id,
            folderName: folder.name,
            file: item.file,
            name: item.name,
            size: item.size,
            lastModified: item.lastModified || (item.file && item.file.lastModified) || Date.now(),
            type: item.type,
            path: item.path,
            handle: item.handle || null,
            parentHandle: item.parentHandle || null,
            isFavorite: savedFavs.has(item.name) || Boolean(item.path && savedFavs.has(item.path)),
            thumbnailUrl: null,
            metadata: null,
            slicerData: null,
            plates: [],
            loadingThumbnail: false,
            fingerprint: null,
            isDuplicate: false,
            duplicatesCount: 0,
            duplicateOrigins: '',
            fullFolderDirectory: rootBase + '\\',
            fullDiskPath: item.fullDiskPath || `${rootBase}\\${sub}`.replace(/\\\\+/g, '\\')
          };
          state.models.push(newModel);
          totalAdded++;
        }
      });

      // Remover modelos que foram deletados ou movidos para fora da pasta pelo Explorer
      const removedIds = new Set();
      existingByKey.forEach((model, key) => {
        if (!seenKeys.has(key)) {
          removedIds.add(model.id);
          state.selectedModelIds.delete(model.id);
          if (state.activeModel && state.activeModel.id === model.id) {
            closeViewerModal();
          }
          totalRemoved++;
        }
      });

      if (removedIds.size > 0) {
        state.models = state.models.filter(m => !removedIds.has(m.id));
      }

      folder.count = state.models.filter(m => m.folderId === folder.id).length;
      await saveFolderToDB({
        id: folder.id,
        name: folder.name,
        handle: dirHandle || null,
        count: folder.count,
        isSample: false,
        diskPath: resolvedRootPath || (savedEntry && savedEntry.diskPath) || state.folderDiskPaths?.[folder.name] || null
      });
    }

    if (totalAdded > 0 || totalRemoved > 0 || totalUpdated > 0) {
      state.models.sort((a, b) => compareModelNames(a.name, b.name));
      renderFolderChips();
      updateStatsBadge();
      renderGallery();
      updateDuplicatesState();

      if (totalAdded > 0 && totalRemoved === 0) {
        showToast(
          totalAdded === 1
            ? '✨ 1 novo arquivo encontrado e adicionado à galeria!'
            : `✨ ${totalAdded} novos arquivos encontrados e adicionados à galeria!`,
          'success'
        );
      } else if (totalAdded === 0 && totalRemoved > 0) {
        showToast(
          totalRemoved === 1
            ? '1 arquivo que não está mais na pasta foi removido da galeria.'
            : `${totalRemoved} arquivos que não estão mais na pasta foram removidos da galeria.`,
          'info'
        );
      } else if (totalAdded > 0 && totalRemoved > 0) {
        showToast(`✨ Biblioteca atualizada: +${totalAdded} novo(s), -${totalRemoved} removido(s).`, 'success');
      } else {
        showToast(`🔄 ${totalUpdated} arquivo(s) modificado(s) atualizado(s)!`, 'success');
      }
    } else {
      renderFolderChips();
      updateStatsBadge();
      showToast('Tudo em dia! Nenhum arquivo novo encontrado nas pastas.', 'info');
    }
  } catch (err) {
    console.error('Erro ao atualizar pastas conectadas:', err);
    showToast('Erro ao atualizar pastas: ' + err.message, 'error');
  } finally {
    isRefreshingFolders = false;
    if (btnRefreshFolders) {
      btnRefreshFolders.disabled = false;
      btnRefreshFolders.classList.remove('is-refreshing');
    }
    if (labelSpan) labelSpan.textContent = 'Atualizar';
  }
}

/**
 * Remove uma pasta específica e todos os seus modelos associados da biblioteca
 */
async function removeFolder(folderId) {
  const folderIndex = state.folders.findIndex(f => f.id === folderId);
  if (folderIndex === -1) return;

  const folderName = state.folders[folderIndex].name;

  // Revogar URLs de miniaturas criadas para os modelos dessa pasta
  const modelsToRemove = state.models.filter(m => m.folderId === folderId);
  modelsToRemove.forEach(m => {
    if (m.thumbnailUrl && m.thumbnailUrl.startsWith('blob:')) {
      URL.revokeObjectURL(m.thumbnailUrl);
    }
  });

  // Remover pasta e modelos do estado
  state.folders.splice(folderIndex, 1);
  state.models = state.models.filter(m => m.folderId !== folderId);

  // Se a pasta ativa ou suas subpastas pertenciam a essa pasta, resetar filtro
  if (state.activeFolderId === folderId) {
    state.activeFolderId = null;
    state.activeSubfolderPath = null;
  }
  // Limpar chaves dessa pasta das pastas recolhidas
  for (const key of Array.from(state.collapsedFolders)) {
    if (key === folderId || key.startsWith(`${folderId}::`)) {
      state.collapsedFolders.delete(key);
    }
  }

  // Remover do IndexedDB
  await removeFolderFromDB(folderId);

  // Se o modelo ativo no modal pertencia a essa pasta, fechar modal
  if (state.activeModel && state.activeModel.folderId === folderId) {
    closeViewerModal();
  }

  showToast(`Pasta "${folderName}" removida da biblioteca.`);

  // Se não houver mais pastas conectadas, volta para a tela inicial vazia
  if (state.folders.length === 0) {
    state.activeFolderId = null;
    state.activeSubfolderPath = null;
    state.collapsedFolders.clear();
    dropZone.style.display = 'block';
    galleryContainer.style.display = 'none';
    if (topPageSizeWrap) topPageSizeWrap.style.display = 'none';
    if (sortControlWrap) sortControlWrap.style.display = 'none';
    favoritesGrid.innerHTML = '';
    modelsGrid.innerHTML = '';
    renderFolderChips();
    updateStatsBadge();
    updateDuplicatesFilterButton(0);

    const remainingSaved = await getAllFoldersFromDB();
    if (remainingSaved.length > 0) {
      renderSavedFoldersCard(remainingSaved);
    } else if (savedFoldersCard) {
      savedFoldersCard.style.display = 'none';
    }
    return;
  }

  renderFolderChips();
  updateStatsBadge();
  renderGallery();
  updateDuplicatesState();
}

/**
 * Normaliza o caminho relativo de um modelo excluindo o prefixo do nome da pasta raiz (se houver)
 */
function getModelRelativePath(model, folderName) {
  let p = (model.path || model.name || '').replace(/\\/g, '/');
  if (folderName) {
    const fn = folderName.replace(/\\/g, '/');
    if (p.toLowerCase().startsWith(fn.toLowerCase() + '/')) {
      p = p.substring(fn.length + 1);
    }
  }
  return p;
}

/**
 * Extrai recursivamente a árvore de subpastas de uma pasta conectada
 */
function extractFolderTree(folder, models) {
  const folderModels = models.filter(m => m.folderId === folder.id);
  const subfolderMap = new Map(); // path -> { path, name, level, parentPath, count }

  folderModels.forEach(m => {
    const relPath = getModelRelativePath(m, folder.name);
    const parts = relPath.split('/').filter(Boolean);

    if (parts.length > 1) {
      const dirParts = parts.slice(0, -1);
      let currentPath = '';
      let parentPath = null;

      for (let i = 0; i < dirParts.length; i++) {
        const seg = dirParts[i];
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;
        const level = i + 1;

        if (!subfolderMap.has(currentPath)) {
          subfolderMap.set(currentPath, {
            path: currentPath,
            name: seg,
            level: level,
            parentPath: parentPath,
            count: 0
          });
        }
        subfolderMap.get(currentPath).count++;
        parentPath = currentPath;
      }
    }
  });

  return Array.from(subfolderMap.values()).sort((a, b) => {
    return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Verifica se um modelo pertence ao filtro de pasta/subpasta ativo
 */
function isModelInFolderFilter(model, folderId, subfolderPath) {
  if (!folderId) return true;
  if (model.folderId !== folderId) return false;
  if (!subfolderPath) return true; // Pasta raiz completa

  const relPath = getModelRelativePath(model, model.folderName);
  const normalizedSubfolder = subfolderPath.replace(/\\/g, '/').toLowerCase();
  const normalizedRel = relPath.toLowerCase();

  return normalizedRel.startsWith(normalizedSubfolder + '/');
}

/**
 * Define o filtro de pasta/subpasta ativa e atualiza a galeria
 */
function selectFolder(folderId, subfolderPath = null) {
  state.activeFolderId = folderId;
  state.activeSubfolderPath = subfolderPath;
  state.currentPage = 1;
  updateFolderSelectionUI();
  updateStatsBadge();
  if (state.activeSection === 'trending') {
    setNavSection('all');
    return;
  }
  renderGallery();
}

/**
 * Reseta o filtro de pastas exibindo modelos de todas as pastas conectadas
 */
function resetFolderFilter() {
  state.activeFolderId = null;
  state.activeSubfolderPath = null;
  state.currentPage = 1;
  updateFolderSelectionUI();
  updateStatsBadge();
  if (state.activeSection === 'trending') {
    setNavSection('all');
    return;
  }
  renderGallery();
}

/**
 * Atualiza o destaque visual ativo dos itens de pastas e botão 'Exibir todas as pastas'
 */
function updateFolderSelectionUI() {
  if (btnShowAllFolders) {
    btnShowAllFolders.classList.toggle('active', !state.activeFolderId);
  }
  if (!sidebarFoldersList) return;
  const items = sidebarFoldersList.querySelectorAll('.sidebar-folder-item');
  items.forEach(el => {
    const fId = el.dataset.folderId;
    const sPath = el.dataset.subfolderPath || null;
    const isActive = (state.activeFolderId === fId && (state.activeSubfolderPath || null) === sPath);
    el.classList.toggle('active', isActive);
  });
}

/**
 * Renderiza a lista de pastas conectadas na barra lateral com suporte a subpastas hierárquicas e expansão
 */
function renderFolderChips() {
  if (!sidebarFoldersList) return;
  sidebarFoldersList.innerHTML = '';

  const totalFolders = state.folders.length;
  if (sidebarFoldersCountBadge) {
    sidebarFoldersCountBadge.textContent = totalFolders;
  }

  if (sidebarAllFoldersWrap) {
    sidebarAllFoldersWrap.style.display = totalFolders > 0 ? 'block' : 'none';
  }

  if (allFoldersBadge) {
    allFoldersBadge.textContent = totalFolders > 0 ? `(${state.models.length})` : '';
  }

  if (btnShowAllFolders) {
    btnShowAllFolders.classList.toggle('active', !state.activeFolderId);
  }

  if (totalFolders === 0) {
    sidebarFoldersList.innerHTML = '<div class="sidebar-folders-empty" id="sidebarFoldersEmpty">Nenhuma pasta conectada</div>';
    return;
  }

  state.folders.forEach(folder => {
    const subfolders = extractFolderTree(folder, state.models);
    const hasSubfolders = subfolders.length > 0;
    const isRootCollapsed = state.collapsedFolders.has(folder.id);
    const isRootActive = state.activeFolderId === folder.id && !state.activeSubfolderPath;

    // Elemento da pasta raiz conectada
    const item = document.createElement('div');
    item.className = `sidebar-folder-item ${isRootActive ? 'active' : ''}`;
    item.dataset.folderId = folder.id;
    item.dataset.subfolderPath = '';
    item.title = `${folder.name} (${folder.count} arquivos)`;

    const chevronHtml = hasSubfolders
      ? `<button class="btn-folder-toggle ${isRootCollapsed ? 'collapsed' : ''}" type="button" title="${isRootCollapsed ? 'Expandir subpastas' : 'Recolher subpastas'}" aria-label="Expandir ou recolher subpastas">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>`
      : `<span class="btn-folder-toggle-spacer"></span>`;

    item.innerHTML = `
      <div class="sidebar-folder-left">
        ${chevronHtml}
        <span class="folder-item-icon">📁</span>
        <span class="sidebar-folder-name">${escapeHtml(folder.name)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
        <span class="sidebar-folder-count">(${folder.count})</span>
        <button class="btn-remove-sidebar-folder" title="Remover pasta '${escapeHtml(folder.name)}' da biblioteca" aria-label="Remover pasta">
          &times;
        </button>
      </div>
    `;

    // Toggle expandir / recolher
    if (hasSubfolders) {
      const btnToggle = item.querySelector('.btn-folder-toggle');
      if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.collapsedFolders.has(folder.id)) {
            state.collapsedFolders.delete(folder.id);
          } else {
            state.collapsedFolders.add(folder.id);
          }
          renderFolderChips();
        });
      }
    }

    // Clique no item para filtrar
    item.addEventListener('click', () => {
      selectFolder(folder.id, null);
    });
    setupFolderDropTarget(item, folder.id, '');

    // Botão remover pasta
    const btnRemove = item.querySelector('.btn-remove-sidebar-folder');
    if (btnRemove) {
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFolder(folder.id);
      });
    }

    sidebarFoldersList.appendChild(item);

    // Se a pasta raiz não estiver recolhida, renderiza subpastas
    if (!isRootCollapsed && hasSubfolders) {
      subfolders.forEach(sub => {
        // Verificar se algum ancestral direto está recolhido
        const pathSegments = sub.path.split('/');
        let ancestorCollapsed = false;
        let runningPath = '';
        for (let s = 0; s < pathSegments.length - 1; s++) {
          runningPath = runningPath ? `${runningPath}/${pathSegments[s]}` : pathSegments[s];
          if (state.collapsedFolders.has(`${folder.id}::${runningPath}`)) {
            ancestorCollapsed = true;
            break;
          }
        }
        if (ancestorCollapsed) return;

        const hasSubChildren = subfolders.some(s => s.parentPath === sub.path);
        const subKey = `${folder.id}::${sub.path}`;
        const isSubCollapsed = state.collapsedFolders.has(subKey);
        const isSubActive = (state.activeFolderId === folder.id && state.activeSubfolderPath === sub.path);

        const subItem = document.createElement('div');
        subItem.className = `sidebar-folder-item is-subfolder ${isSubActive ? 'active' : ''}`;
        subItem.style.setProperty('--subfolder-level', sub.level);
        subItem.dataset.folderId = folder.id;
        subItem.dataset.subfolderPath = sub.path;
        subItem.title = `${sub.path} (${sub.count} arquivo${sub.count === 1 ? '' : 's'})`;

        const subChevronHtml = hasSubChildren
          ? `<button class="btn-folder-toggle ${isSubCollapsed ? 'collapsed' : ''}" type="button" title="${isSubCollapsed ? 'Expandir subpastas' : 'Recolher subpastas'}" aria-label="Expandir ou recolher subpastas">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>`
          : `<span class="btn-folder-toggle-spacer"></span>`;

        subItem.innerHTML = `
          <div class="sidebar-folder-left">
            <span class="subfolder-tree-guide">└</span>
            ${subChevronHtml}
            <span class="folder-item-icon">📁</span>
            <span class="sidebar-folder-name">${escapeHtml(sub.name)}</span>
          </div>
          <span class="sidebar-folder-count">(${sub.count})</span>
        `;

        if (hasSubChildren) {
          const btnSubToggle = subItem.querySelector('.btn-folder-toggle');
          if (btnSubToggle) {
            btnSubToggle.addEventListener('click', (e) => {
              e.stopPropagation();
              if (state.collapsedFolders.has(subKey)) {
                state.collapsedFolders.delete(subKey);
              } else {
                state.collapsedFolders.add(subKey);
              }
              renderFolderChips();
            });
          }
        }

        subItem.addEventListener('click', () => {
          selectFolder(folder.id, sub.path);
        });
        setupFolderDropTarget(subItem, folder.id, sub.path);

        sidebarFoldersList.appendChild(subItem);
      });
    }
  });
}

/**
 * Atualiza todos os contadores e estatísticas da barra lateral e rodapé
 */
function updateStatsBadge() {
  const displayItems = applyCustomProjects(state.models);
  const totalItems = displayItems.length;
  const projectCount = displayItems.filter(m => m.isProject).length;
  const totalFiles = state.models.length;
  const favCount = displayItems.filter(m => m.isFavorite).length;
  const dupCount = state.models.filter(m => m.isDuplicate).length;
  const foldersCount = state.folders.length;

  if (sidebarAllCountBadge) sidebarAllCountBadge.textContent = totalItems;
  if (sidebarProjectsCountBadge) sidebarProjectsCountBadge.textContent = projectCount;
  if (sidebarFavoritesCountBadge) sidebarFavoritesCountBadge.textContent = favCount;
  if (sidebarDuplicatesCountBadge) sidebarDuplicatesCountBadge.textContent = dupCount;

  if (navDuplicates) {
    navDuplicates.style.display = dupCount > 0 ? 'flex' : 'none';
  }

  // Faixa de resumo: conta apenas a pasta/subpasta selecionada (ou tudo, se nenhuma)
  const hasFolderScope = Boolean(state.activeFolderId);
  const scopedModels = hasFolderScope
    ? state.models.filter(m => isModelInFolderFilter(m, state.activeFolderId, state.activeSubfolderPath))
    : state.models;
  const scopedItems = hasFolderScope
    ? displayItems.filter(item => item.isProject
        ? item.parts && item.parts.some(p => isModelInFolderFilter(p, state.activeFolderId, state.activeSubfolderPath))
        : isModelInFolderFilter(item, state.activeFolderId, state.activeSubfolderPath))
    : displayItems;
  const scopedProjectCount = scopedItems.filter(m => m.isProject).length;
  const scopedFiles = scopedModels.length;

  if (statsScopeLabel) {
    if (hasFolderScope) {
      const activeFolder = state.folders.find(f => f.id === state.activeFolderId);
      const scopeName = state.activeSubfolderPath
        ? state.activeSubfolderPath.split('/').pop()
        : (activeFolder ? activeFolder.name : 'Pasta');
      statsScopeLabel.textContent = `Pasta: ${scopeName}`;
      statsScopeLabel.title = state.activeSubfolderPath
        ? `${activeFolder ? activeFolder.name + '/' : ''}${state.activeSubfolderPath}`
        : scopeName;
    } else {
      statsScopeLabel.textContent = 'Coleção';
      statsScopeLabel.title = '';
    }
  }

  if (fileCountBadge) {
    if (scopedProjectCount > 0) {
      fileCountBadge.textContent = `${scopedItems.length} itens (${scopedProjectCount} projeto${scopedProjectCount === 1 ? '' : 's'}, ${scopedFiles} arquivos)`;
    } else {
      fileCountBadge.textContent = `${scopedFiles} modelo${scopedFiles === 1 ? '' : 's'}`;
    }
  }

  if (sidebarStlCountBadge) {
    sidebarStlCountBadge.textContent = `${scopedModels.filter(m => m.type === 'stl').length}.STL`;
  }
  if (sidebar3mfCountBadge) {
    sidebar3mfCountBadge.textContent = `${scopedModels.filter(m => m.type === '3mf').length}.3MF`;
  }

  const scopedDupCount = scopedModels.filter(m => m.isDuplicate).length;
  if (statsDuplicatesCount) statsDuplicatesCount.textContent = scopedDupCount;
  if (statsDuplicatesCell) statsDuplicatesCell.classList.toggle('has-duplicates', scopedDupCount > 0);
  if (btnStatsReviewDuplicates) btnStatsReviewDuplicates.hidden = scopedDupCount === 0;
  if (sidebarFoldersCountBadge) {
    sidebarFoldersCountBadge.textContent = foldersCount;
  }
  if (allFoldersBadge) {
    allFoldersBadge.textContent = foldersCount > 0 ? `(${totalFiles})` : '';
  }
  if (sidebarAllFoldersWrap) {
    sidebarAllFoldersWrap.style.display = foldersCount > 0 ? 'block' : 'none';
  }
  if (btnRefreshFolders) {
    btnRefreshFolders.style.display = (foldersCount > 0 && state.activeSection !== 'trending') ? 'inline-flex' : 'none';
  }
}

/**
 * Notificação visual Toast flutuante
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '🔔';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

/**
 * Renomeia o arquivo do modelo tanto no disco (via File System Access API) quanto no estado da aplicação.
 * A extensão é fixada e preservada automaticamente.
 */
async function renameModelFile(model, newBaseName) {
  let cleanBase = (newBaseName || '').trim();

  if (!cleanBase) {
    showToast('O nome do arquivo não pode ficar vazio.', 'error');
    return false;
  }

  // Caracteres proibidos no Windows / macOS / Linux: \ / : * ? " < > |
  if (/[\\/:*?"<>|]/.test(cleanBase)) {
    showToast('O nome não pode conter nenhum dos caracteres: \\ / : * ? " < > |', 'error');
    return false;
  }

  const dotIdx = model.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? model.name.substring(dotIdx) : `.${model.type}`;
  const oldBaseName = dotIdx !== -1 ? model.name.substring(0, dotIdx) : model.name;

  // Se o usuário digitou acidentalmente a extensão no final, removemos para não duplicar (.3mf.3mf)
  if (cleanBase.toLowerCase().endsWith(ext.toLowerCase())) {
    cleanBase = cleanBase.substring(0, cleanBase.length - ext.length).trim();
  }

  if (!cleanBase) {
    showToast('O nome do arquivo não pode ficar vazio.', 'error');
    return false;
  }

  if (cleanBase === oldBaseName) {
    return true; // Sem alterações
  }

  const newFullName = `${cleanBase}${ext}`;

  // Verificar duplicidade no diretório atual
  const exists = state.models.some(m => m.id !== model.id && m.name.toLowerCase() === newFullName.toLowerCase());
  if (exists) {
    showToast(`Já existe um arquivo chamado "${newFullName}" nesta pasta.`, 'error');
    return false;
  }

  // 1. MODO DESKTOP (ELECTRON): Renomear nativamente no disco do Windows
  if (window.electronAPI && typeof window.electronAPI.renameFile === 'function' && model.fullDiskPath) {
    try {
      const res = await window.electronAPI.renameFile(model.fullDiskPath, newFullName);
      if (!res.success) {
        showToast(`Erro ao renomear arquivo: ${res.message}`, 'error');
        return false;
      }
      model.fullDiskPath = res.newPath;
      if (model.file) {
        model.file.name = newFullName;
        if (model.file.fullDiskPath) model.file.fullDiskPath = res.newPath;
      }
      showToast(`Arquivo renomeado para "${newFullName}" no disco! ✏️`, 'success');
    } catch (e) {
      showToast(`Erro ao renomear arquivo: ${e.message}`, 'error');
      return false;
    }
  } else if (model.handle) {
    // 2. MODO WEB: Renomear via FileSystemHandle
    try {
      let hasPerm = false;
      if (typeof model.handle.queryPermission === 'function') {
        const status = await model.handle.queryPermission({ mode: 'readwrite' });
        if (status === 'granted') {
          hasPerm = true;
        } else if (typeof model.handle.requestPermission === 'function') {
          const req = await model.handle.requestPermission({ mode: 'readwrite' });
          if (req === 'granted') hasPerm = true;
        }
      }

      if (!hasPerm && model.parentHandle && typeof model.parentHandle.requestPermission === 'function') {
        const req = await model.parentHandle.requestPermission({ mode: 'readwrite' });
        if (req === 'granted') hasPerm = true;
      }

      // Renomear o arquivo no sistema operacional
      if (typeof model.handle.move === 'function') {
        await model.handle.move(newFullName);
      } else if (model.parentHandle) {
        // Fallback: criar novo arquivo, escrever dados e remover arquivo antigo
        const newFileHandle = await model.parentHandle.getFileHandle(newFullName, { create: true });
        const writable = await newFileHandle.createWritable();
        const currentBlob = await model.handle.getFile();
        await writable.write(currentBlob);
        await writable.close();
        await model.parentHandle.removeEntry(model.name);
        model.handle = newFileHandle;
      } else {
        throw new Error('Sistema não possui suporte para mover arquivos diretamente.');
      }

      // Atualizar o objeto File local
      if (typeof model.handle.getFile === 'function') {
        try {
          model.file = await model.handle.getFile();
        } catch (_) {}
      }
      showToast(`Arquivo renomeado para "${newFullName}"! ✏️`, 'success');
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        showToast('Permissão negada para alterar o arquivo.', 'warning');
        return false;
      }
      console.error('Erro ao renomear arquivo no disco:', err);
      showToast('Erro ao renomear no disco: ' + err.message, 'error');
      return false;
    }
  } else {
    showToast(`Nome atualizado para "${newFullName}".`, 'info');
  }

  const oldName = model.name;

  // Se o modelo era favorito, atualizar o nome nos favoritos
  const favs = loadFavorites();
  if (favs.has(oldName)) {
    favs.delete(oldName);
    favs.add(newFullName);
    saveFavorites(favs);
  }

  // Se o modelo fazia parte de algum projeto customizado, atualizar a referência
  let projectsChanged = false;
  (state.customProjects || []).forEach(project => {
    if (Array.isArray(project.fileKeys)) {
      const idx = project.fileKeys.indexOf(oldName);
      if (idx !== -1) {
        project.fileKeys[idx] = newFullName;
        projectsChanged = true;
      }
    }
    if (project.coverKey === oldName) {
      project.coverKey = newFullName;
      projectsChanged = true;
    }
  });
  if (projectsChanged) saveCustomProjects();

  // Atualizar dados em memória
  model.name = newFullName;
  if (model.path) {
    model.path = model.path.includes('/')
      ? model.path.substring(0, model.path.lastIndexOf('/') + 1) + newFullName
      : newFullName;
  }
  if (model.fullFolderDirectory) {
    model.fullDiskPath = `${model.fullFolderDirectory}${newFullName}`;
  }

  // Migrar miniatura e capa escolhida para a nova chave no IndexedDB
  if (model.thumbnailUrl) {
    saveCachedThumbnail(getModelCacheKey(model), {
      thumbnailUrl: model.thumbnailUrl,
      defaultThumbnailUrl: model.defaultThumbnailUrl || model.thumbnailUrl,
      coverSource: model.coverSource || 'auto',
      customCoverUrl: model.customCoverUrl || null,
      metadata: model.metadata,
      slicerData: model.slicerData,
      plates: model.plates,
      extras: model.extras || null
    });
  }

  // Se o modal estiver aberto exibindo este mesmo modelo, atualizar o título do modal
  if (state.activeModel && state.activeModel.id === model.id) {
    if (modalPathName) {
      modalPathName.textContent = newFullName;
    } else if (modalFileName) {
      modalFileName.textContent = newFullName;
    }
    if (modalFileName && model.fullDiskPath) {
      modalFileName.title = `${model.fullDiskPath}`;
    }
  }

  // Reordenar a lista global após renomear
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  return true;
}

// ==========================================
// Modal de Edição de Card (Nome + Foto de Capa)
// ==========================================

let editCardState = null;

function isEditCardModalOpen() {
  const modal = document.getElementById('editCardModal');
  return !!(modal && modal.style.display !== 'none' && editCardState);
}

/**
 * Redimensiona/comprime uma imagem enviada do PC para caber com folga no cache (IndexedDB / localStorage)
 */
function compactCoverDataUrl(rawDataUrl, maxSide = 720, quality = 0.86) {
  return new Promise((resolve) => {
    if (!rawDataUrl || typeof rawDataUrl !== 'string') {
      resolve(rawDataUrl);
      return;
    }
    const img = new Image();
    if (/^https?:\/\//i.test(rawDataUrl)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width || maxSide;
        let h = img.naturalHeight || img.height || maxSide;
        if (w > maxSide || h > maxSide) {
          if (w >= h) {
            h = Math.max(1, Math.round((h * maxSide) / w));
            w = maxSide;
          } else {
            w = Math.max(1, Math.round((w * maxSide) / h));
            h = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/webp', quality);
        resolve(out && out.startsWith('data:image/') ? out : rawDataUrl);
      } catch (_) {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

function getFileBaseName(filename) {
  const dot = (filename || '').lastIndexOf('.');
  return dot !== -1 ? filename.substring(0, dot) : (filename || '');
}

/**
 * Renderiza a grade de opções de foto de capa dentro do modal #editCardModal
 */
function renderEditCardCoverGrid() {
  const grid = document.getElementById('editCardCoverGrid');
  const hint = document.getElementById('editCardCoverHint');
  if (!grid || !editCardState) return;

  grid.innerHTML = '';
  const options = editCardState.options || [];

  if (hint) {
    if (editCardState.loadingOptions) {
      hint.textContent = 'Lendo imagens internas do arquivo...';
    } else if (options.length > 1) {
      hint.textContent = `${options.length} opções disponíveis`;
    } else if (options.length === 1) {
      hint.textContent = '1 opção (ou envie uma foto do PC)';
    } else {
      hint.textContent = 'Envie uma foto do computador';
    }
  }

  if (options.length === 0) {
    grid.innerHTML = `
      <div class="edit-cover-empty">
        ${editCardState.loadingOptions ? 'Carregando miniaturas disponíveis...' : 'Nenhuma miniatura pronta ainda. Você pode enviar uma foto do PC.'}
      </div>
    `;
    return;
  }

  options.forEach((opt) => {
    const imgSrc = opt.dataUrl || opt.imageUrl || '';
    if (!imgSrc) return;
    opt.dataUrl = imgSrc;
    const subText = opt.sublabel || opt.title || '';
    const btn = document.createElement('button');
    const isSel = editCardState.selectedSource === opt.id;
    btn.type = 'button';
    btn.className = `edit-cover-option ${isSel ? 'is-selected' : ''}`;
    btn.dataset.sourceId = opt.id;
    btn.dataset.kind = opt.kind || 'default';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
    btn.title = `${opt.label}${subText ? ' — ' + subText : ''}`;

    btn.innerHTML = `
      <div class="edit-cover-thumb">
        <img src="${imgSrc}" alt="${escapeHtml(opt.label)}" loading="lazy">
      </div>
      <span class="edit-cover-check" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
      <div class="edit-cover-meta">
        <span class="edit-cover-label">${escapeHtml(opt.label)}</span>
        <span class="edit-cover-sub">${escapeHtml(subText)}</span>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (!editCardState) return;
      editCardState.selectedSource = opt.id;
      grid.querySelectorAll('.edit-cover-option').forEach((el) => {
        const active = el.dataset.sourceId === opt.id;
        el.classList.toggle('is-selected', active);
        el.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    });

    grid.appendChild(btn);
  });
}

/**
 * Abre o modal de edição de card (para um arquivo .3MF/.STL ou para um Projeto Multi-peças)
 */
async function openEditCardModal(item) {
  if (!item) return;

  const modal = document.getElementById('editCardModal');
  const titleEl = document.getElementById('editCardModalTitle');
  const subEl = document.getElementById('editCardModalSub');
  const nameLabel = document.getElementById('editCardNameLabel');
  const nameInput = document.getElementById('editCardNameInput');
  const extBadge = document.getElementById('editCardExtBadge');
  const fileInput = document.getElementById('editCardCustomCoverInput');
  const btnConfirm = document.getElementById('btnConfirmEditCard');

  if (!modal || !nameInput) return;
  if (fileInput) fileInput.value = '';
  if (btnConfirm) btnConfirm.disabled = false;

  const token = Date.now() + Math.random();
  const isProject = !!item.isProject;

  if (isProject) {
    const projectRecord = (state.customProjects || []).find(
      p => p.id === (item.customProjectId || item.id)
    );
    const currentCustomUrl = (projectRecord && projectRecord.customCoverUrl) || item.customCoverUrl || null;
    const parts = item.parts || [];

    const options = [];
    if (currentCustomUrl) {
      options.push({
        id: '__custom__',
        kind: 'custom',
        label: 'Foto enviada',
        sublabel: 'Computador',
        dataUrl: currentCustomUrl
      });
    }

    parts.forEach((part, idx) => {
      if (part.thumbnailUrl) {
        options.push({
          id: part.name,
          kind: 'plate',
          label: getFileBaseName(part.name),
          sublabel: `Peça ${idx + 1} (${part.type.toUpperCase()})`,
          dataUrl: part.thumbnailUrl
        });
      }
    });

    let selectedSource = (projectRecord && projectRecord.coverKey) || null;
    if (!selectedSource || (!options.some(o => o.id === selectedSource) && selectedSource !== '__custom__')) {
      selectedSource = currentCustomUrl
        ? '__custom__'
        : (options[0] ? options[0].id : (parts[0] ? parts[0].name : null));
    }

    editCardState = {
      token,
      item,
      isProject: true,
      projectRecord,
      initialBaseName: item.name,
      ext: '',
      options,
      selectedSource,
      initialSource: selectedSource,
      customCoverUrl: currentCustomUrl,
      initialCustomCoverUrl: currentCustomUrl,
      loadingOptions: parts.some(p => !p.thumbnailUrl),
      saving: false
    };

    if (titleEl) titleEl.textContent = 'Editar projeto';
    if (subEl) subEl.textContent = 'Altere o nome do projeto ou escolha qual foto representa a capa';
    if (nameLabel) nameLabel.textContent = 'Nome do projeto';
    if (extBadge) extBadge.hidden = true;
    nameInput.value = item.name || '';

    renderEditCardCoverGrid();
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      nameInput.focus();
      nameInput.select();
    });

    // Se alguma peça do projeto ainda não tiver miniatura gerada, carregar sob demanda
    parts.forEach((part, idx) => {
      if (!part.thumbnailUrl) {
        loadModelOnDemand(part).then((loaded) => {
          if (!editCardState || editCardState.token !== token) return;
          if (loaded && loaded.thumbnailUrl && !editCardState.options.some(o => o.id === part.name)) {
            editCardState.options.push({
              id: part.name,
              kind: 'plate',
              label: getFileBaseName(part.name),
              sublabel: `Peça ${idx + 1} (${part.type.toUpperCase()})`,
              dataUrl: loaded.thumbnailUrl
            });
          }
          editCardState.loadingOptions = parts.some(p => !p.thumbnailUrl);
          renderEditCardCoverGrid();
        });
      }
    });
    return;
  }

  // Card de arquivo individual (.3MF ou .STL)
  const dotIdx = item.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? item.name.substring(dotIdx) : `.${item.type}`;
  const baseName = dotIdx !== -1 ? item.name.substring(0, dotIdx) : item.name;

  // Garantir leitura do cache caso ainda não tenha sido hidratado em memória
  if (!item.defaultThumbnailUrl && !item.coverSource) {
    try {
      const cached = await getCachedThumbnail(getModelCacheKey(item));
      if (cached) {
        if (cached.defaultThumbnailUrl) item.defaultThumbnailUrl = cached.defaultThumbnailUrl;
        if (cached.coverSource) item.coverSource = cached.coverSource;
        if (cached.customCoverUrl) item.customCoverUrl = cached.customCoverUrl;
      }
    } catch (_) {}
  }

  const initialOptions = [];
  const defaultThumb = item.defaultThumbnailUrl || (item.coverSource !== 'custom' ? item.thumbnailUrl : null);

  if (item.customCoverUrl) {
    initialOptions.push({
      id: 'custom',
      kind: 'custom',
      label: 'Foto enviada',
      sublabel: 'Computador',
      dataUrl: item.customCoverUrl
    });
  }

  if (defaultThumb) {
    initialOptions.push({
      id: 'auto',
      kind: 'default',
      label: item.type === '3mf' ? 'Capa padrão' : 'Miniatura 3D',
      sublabel: item.type === '3mf' ? 'Miniatura do 3MF' : 'Gerada do STL',
      dataUrl: defaultThumb
    });
  }

  const currentSource = item.coverSource || 'auto';

  editCardState = {
    token,
    item,
    isProject: false,
    initialBaseName: baseName,
    ext,
    options: initialOptions,
    selectedSource: currentSource,
    initialSource: currentSource,
    customCoverUrl: item.customCoverUrl || null,
    initialCustomCoverUrl: item.customCoverUrl || null,
    loadingOptions: item.type === '3mf' || !defaultThumb,
    saving: false
  };

  if (titleEl) titleEl.textContent = 'Editar arquivo';
  if (subEl) {
    subEl.textContent = item.type === '3mf'
      ? 'Altere o nome ou escolha entre as fotos internas do 3MF e do computador'
      : 'Altere o nome ou escolha uma foto personalizada para representar este STL';
  }
  if (nameLabel) nameLabel.textContent = 'Nome do arquivo';
  if (extBadge) {
    extBadge.textContent = ext.toLowerCase();
    extBadge.hidden = false;
  }
  nameInput.value = baseName;

  renderEditCardCoverGrid();
  modal.style.display = 'flex';
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });

  // Carregar todas as opções de capa do arquivo em segundo plano sem travar a digitação
  (async () => {
    try {
      if (item.type === '3mf') {
        if (!item.file && item.handle && typeof item.handle.getFile === 'function') {
          item.file = await item.handle.getFile();
        }
        if (item.file) {
          if (needsMakerOnlineCheck(item)) {
            await ensureMakerOnlineEnriched(item);
          }
          const buffer = await item.file.arrayBuffer();
          const extracted = await extract3MFCoverOptions(buffer, item);
          if (!editCardState || editCardState.token !== token) return;

          const autoOpt = extracted.find(o => o.id === 'auto');
          if (autoOpt && autoOpt.dataUrl) {
            item.defaultThumbnailUrl = autoOpt.dataUrl;
          }

          const merged = [];
          if (editCardState.customCoverUrl) {
            merged.push({
              id: 'custom',
              kind: 'custom',
              label: 'Foto enviada',
              sublabel: 'Computador',
              dataUrl: editCardState.customCoverUrl
            });
          }
          extracted.forEach(opt => merged.push(opt));

          editCardState.options = merged;
          // Se a fonte salva não existir mais na lista, selecionar a primeira correspondente
          if (!merged.some(o => o.id === editCardState.selectedSource)) {
            const matchByUrl = merged.find(o => o.dataUrl === item.thumbnailUrl);
            editCardState.selectedSource = matchByUrl ? matchByUrl.id : (merged[0] ? merged[0].id : 'auto');
          }
        }
      } else if (item.type === 'stl' && !defaultThumb) {
        const loaded = await loadModelOnDemand(item);
        if (!editCardState || editCardState.token !== token) return;
        const stlThumb = (loaded && (loaded.defaultThumbnailUrl || loaded.thumbnailUrl)) || item.thumbnailUrl;
        if (stlThumb && !editCardState.options.some(o => o.id === 'auto')) {
          editCardState.options.push({
            id: 'auto',
            kind: 'default',
            label: 'Miniatura 3D',
            sublabel: 'Gerada do STL',
            dataUrl: stlThumb
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao listar opções de capa do arquivo:', err);
    } finally {
      if (editCardState && editCardState.token === token) {
        editCardState.loadingOptions = false;
        renderEditCardCoverGrid();
      }
    }
  })();
}

function closeEditCardModal() {
  const modal = document.getElementById('editCardModal');
  if (modal) modal.style.display = 'none';
  editCardState = null;
}

async function confirmEditCardModal() {
  if (!editCardState || editCardState.saving) return;

  const nameInput = document.getElementById('editCardNameInput');
  const btnConfirm = document.getElementById('btnConfirmEditCard');
  const rawName = nameInput ? nameInput.value.trim() : '';

  const { item, isProject } = editCardState;

  if (!rawName) {
    showToast(isProject ? 'O nome do projeto não pode ficar vazio.' : 'O nome do arquivo não pode ficar vazio.', 'error');
    if (nameInput) nameInput.focus();
    return;
  }

  editCardState.saving = true;
  if (btnConfirm) btnConfirm.disabled = true;

  try {
    if (isProject) {
      const projRecord = editCardState.projectRecord || (state.customProjects || []).find(
        p => p.id === (item.customProjectId || item.id)
      );
      const selectedOpt = (editCardState.options || []).find(o => o.id === editCardState.selectedSource);

      const nameChanged = rawName !== editCardState.initialBaseName;
      const coverChanged = editCardState.selectedSource !== editCardState.initialSource
        || editCardState.customCoverUrl !== editCardState.initialCustomCoverUrl;

      if (projRecord) {
        projRecord.name = rawName;
        if (editCardState.selectedSource === '__custom__' && editCardState.customCoverUrl) {
          projRecord.coverKey = '__custom__';
          projRecord.customCoverUrl = editCardState.customCoverUrl;
        } else if (editCardState.selectedSource) {
          projRecord.coverKey = editCardState.selectedSource;
          projRecord.customCoverUrl = null;
        }
        saveCustomProjects();
      }

      // Atualizar favoritos se o projeto era favorito e mudou de nome
      if (nameChanged && item.isFavorite) {
        const favs = loadFavorites();
        if (favs.has(item.name)) {
          favs.delete(item.name);
          favs.add(rawName);
          saveFavorites(favs);
        }
      }

      item.name = rawName;
      if (selectedOpt && selectedOpt.dataUrl) {
        item.thumbnailUrl = selectedOpt.dataUrl;
      }

      // Se o visualizador 3D estiver aberto neste projeto, atualizar cabeçalho
      if (state.activeProject && state.activeProject.id === item.id) {
        state.activeProject.name = rawName;
        if (modalPathName) modalPathName.textContent = rawName;
        else if (modalFileName) modalFileName.textContent = rawName;
      }

      closeEditCardModal();
      renderGallery();
      updateStatsBadge();

      if (nameChanged || coverChanged) {
        showToast('Projeto atualizado com sucesso!', 'success');
      }
      return;
    }

    // Arquivo individual (.3MF ou .STL)
    let cleanBase = rawName;
    if (editCardState.ext && cleanBase.toLowerCase().endsWith(editCardState.ext.toLowerCase())) {
      cleanBase = cleanBase.substring(0, cleanBase.length - editCardState.ext.length).trim();
    }

    const nameChanged = cleanBase !== editCardState.initialBaseName;
    if (nameChanged) {
      const renamed = await renameModelFile(item, cleanBase);
      if (!renamed) {
        editCardState.saving = false;
        if (btnConfirm) btnConfirm.disabled = false;
        if (nameInput) nameInput.focus();
        return;
      }
    }

    const selectedOpt = (editCardState.options || []).find(o => o.id === editCardState.selectedSource);
    const coverChanged = Boolean(
      selectedOpt && (
        editCardState.selectedSource !== editCardState.initialSource ||
        (editCardState.selectedSource === 'custom' && editCardState.customCoverUrl !== editCardState.initialCustomCoverUrl) ||
        selectedOpt.dataUrl !== item.thumbnailUrl
      )
    );

    if (selectedOpt && selectedOpt.dataUrl) {
      const finalCoverUrl = /^https?:\/\//i.test(selectedOpt.dataUrl)
        ? await compactCoverDataUrl(selectedOpt.dataUrl)
        : selectedOpt.dataUrl;
      item.coverSource = selectedOpt.id;
      item.thumbnailUrl = finalCoverUrl;
      item.customCoverUrl = selectedOpt.id === 'custom' ? finalCoverUrl : (editCardState.customCoverUrl || null);

      const defaultOpt = (editCardState.options || []).find(o => o.id === 'auto');
      if (defaultOpt && defaultOpt.dataUrl) {
        item.defaultThumbnailUrl = defaultOpt.dataUrl;
      }

      await saveCachedThumbnail(getModelCacheKey(item), {
        thumbnailUrl: item.thumbnailUrl,
        defaultThumbnailUrl: item.defaultThumbnailUrl || item.thumbnailUrl,
        coverSource: item.coverSource,
        customCoverUrl: item.customCoverUrl,
        metadata: item.metadata,
        slicerData: item.slicerData,
        plates: item.plates,
        extras: item.extras || null
      });

      updateCardThumbnail(item);

      // Se o visualizador 3D estiver exibindo este arquivo na foto da capa, atualizar
      if (state.activeModel && state.activeModel.id === item.id && modalPlateImg && (!state.activePlate || state.activePlate.id === 1)) {
        if (item.type === 'stl' || !item.plates || item.plates.length === 0) {
          modalPlateImg.src = item.thumbnailUrl;
        }
      }
    }

    closeEditCardModal();

    if (nameChanged) {
      renderGallery();
      updateStatsBadge();
    } else if (coverChanged) {
      // Se este arquivo for a capa de algum projeto, re-renderizar a galeria para atualizar o projeto
      const isUsedInProject = (state.customProjects || []).some(p => p.coverKey === item.name || (p.fileKeys && p.fileKeys.includes(item.name)));
      if (isUsedInProject) {
        renderGallery();
      }
      showToast('Foto de capa atualizada!', 'success');
    }
  } finally {
    if (editCardState) editCardState.saving = false;
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

function setupEditCardFeature() {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  on('editCardModalBackdrop', closeEditCardModal);
  on('btnCloseEditCardModal', closeEditCardModal);
  on('btnCancelEditCard', closeEditCardModal);
  on('btnConfirmEditCard', confirmEditCardModal);
  on('btnModalEdit', () => {
    const target = state.modalItem || state.activeProject || state.activeModel;
    if (target) openEditCardModal(target);
  });

  const btnUpload = document.getElementById('btnEditUploadCover');
  const fileInput = document.getElementById('editCardCustomCoverInput');
  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || !editCardState) return;
      const token = editCardState.token;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawUrl = ev.target && ev.target.result;
        if (!rawUrl || !editCardState || editCardState.token !== token) return;
        const compactUrl = await compactCoverDataUrl(rawUrl);
        if (!editCardState || editCardState.token !== token) return;

        const customId = editCardState.isProject ? '__custom__' : 'custom';
        editCardState.customCoverUrl = compactUrl;
        editCardState.selectedSource = customId;

        const existingIdx = editCardState.options.findIndex(o => o.id === customId);
        const customOpt = {
          id: customId,
          kind: 'custom',
          label: 'Foto enviada',
          sublabel: file.name || 'Computador',
          dataUrl: compactUrl
        };
        if (existingIdx !== -1) {
          editCardState.options[existingIdx] = customOpt;
        } else {
          editCardState.options.unshift(customOpt);
        }
        renderEditCardCoverGrid();
      };
      reader.readAsDataURL(file);
    });
  }

  // Captura de teclado: com o modal de edição aberto, Enter salva e Esc fecha sem afetar o fundo
  window.addEventListener('keydown', (e) => {
    if (!isEditCardModalOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeEditCardModal();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      confirmEditCardModal();
    } else {
      e.stopImmediatePropagation();
    }
  }, true);
}

// ==========================================
// Exclusão de arquivos (Lixeira do Windows)
// ==========================================

/**
 * A exclusão só existe no app desktop: os arquivos vão para a Lixeira do Windows
 * e podem ser restaurados por lá se a pessoa mudar de ideia.
 */
function isTrashSupported() {
  return !!(window.electronAPI && typeof window.electronAPI.trashFiles === 'function');
}

/**
 * Caminho real do arquivo no disco (o da varredura tem prioridade sobre o estimado)
 */
function getModelDiskPath(model) {
  return (model && model.file && model.file.fullDiskPath) || (model && model.fullDiskPath) || null;
}

let trashConfirmResolver = null;

/**
 * Mostra a confirmação de envio para a Lixeira com os nomes dos arquivos.
 * Resolve true quando a pessoa confirma.
 */
function askTrashConfirmation(models, { title, description, confirmLabel } = {}) {
  if (!trashConfirmModal) return Promise.resolve(window.confirm(description || 'Mover para a Lixeira?'));

  const count = models.length;
  const titleEl = document.getElementById('trashConfirmTitle');
  if (titleEl) titleEl.textContent = title || (count === 1 ? 'Mover arquivo para a Lixeira?' : `Mover ${count} arquivos para a Lixeira?`);
  if (trashConfirmDesc) {
    trashConfirmDesc.textContent = description || (count === 1
      ? 'O arquivo sai da pasta e vai para a Lixeira do Windows. Dá para restaurar por lá se precisar.'
      : 'Os arquivos saem da pasta e vão para a Lixeira do Windows. Dá para restaurar por lá se precisar.');
  }

  // Lista curta, sem rolagem: até 4 nomes e um resumo do restante
  const MAX_NAMES = 4;
  const shown = count > MAX_NAMES + 1 ? models.slice(0, MAX_NAMES) : models;
  if (trashConfirmList) {
    trashConfirmList.innerHTML = shown.map(m => {
      const folder = getModelParentFolderInfo(m);
      return `<li><span class="trash-name" title="${escapeHtml(getModelDiskPath(m) || m.name)}">${escapeHtml(m.name)}</span><span class="trash-folder">${escapeHtml(folder.name || '')}</span></li>`;
    }).join('') + (count > shown.length ? `<li><span class="trash-more">e mais ${count - shown.length} arquivos</span></li>` : '');
  }
  if (btnConfirmTrash) {
    btnConfirmTrash.textContent = confirmLabel || 'Mover para a Lixeira';
    btnConfirmTrash.disabled = false;
  }
  if (btnCancelTrash) btnCancelTrash.disabled = false;

  trashConfirmModal.style.display = 'flex';
  setTimeout(() => btnConfirmTrash && btnConfirmTrash.focus(), 30);

  return new Promise(resolve => {
    trashConfirmResolver = resolve;
  });
}

function closeTrashConfirmation(confirmed) {
  if (trashConfirmModal) trashConfirmModal.style.display = 'none';
  const resolve = trashConfirmResolver;
  trashConfirmResolver = null;
  if (resolve) resolve(!!confirmed);
}

function isTrashConfirmOpen() {
  return !!(trashConfirmModal && trashConfirmModal.style.display !== 'none' && trashConfirmResolver);
}

/**
 * Confirma e manda os modelos para a Lixeira, depois tira da biblioteca
 * os que saíram do disco. Retorna a lista de modelos excluídos.
 */
async function trashModels(models, confirmOptions = {}) {
  const list = (models || []).filter(m => m && !m.isProject);
  if (list.length === 0) return [];

  if (!isTrashSupported()) {
    showToast('A exclusão de arquivos está disponível no app desktop do Vault3D.', 'info');
    return [];
  }

  const withPath = list.filter(m => getModelDiskPath(m));
  if (withPath.length === 0) {
    showToast('Não foi possível localizar esses arquivos no disco.', 'error');
    return [];
  }

  const confirmed = await askTrashConfirmation(withPath, confirmOptions);
  if (!confirmed) return [];

  let results = [];
  try {
    results = await window.electronAPI.trashFiles(withPath.map(getModelDiskPath));
  } catch (err) {
    showToast(`Erro ao mover para a Lixeira: ${err.message}`, 'error');
    return [];
  }

  const okPaths = new Set((results || []).filter(r => r && r.success).map(r => r.path));
  const removed = withPath.filter(m => okPaths.has(getModelDiskPath(m)));
  const failed = (results || []).filter(r => r && !r.success);

  if (removed.length > 0) {
    await removeModelsFromLibrary(removed);
    showToast(removed.length === 1
      ? `"${removed[0].name}" foi para a Lixeira.`
      : `${removed.length} arquivos foram para a Lixeira.`, 'success');
  }
  if (failed.length > 0) {
    const first = failed[0];
    const name = (first.path || '').split(/[\\/]/).pop();
    showToast(failed.length === 1
      ? `Não foi possível excluir "${name}": ${first.message || 'erro desconhecido'}`
      : `${failed.length} arquivos não puderam ser excluídos. Verifique se estão abertos em outro programa.`, 'error');
  }
  return removed;
}

/**
 * Tira da biblioteca os modelos que saíram do disco: galeria, seleção,
 * favoritos, projetos, contadores das pastas e duplicados.
 */
async function removeModelsFromLibrary(removed) {
  const removedIds = new Set(removed.map(m => m.id));

  // Se o visualizador mostra um dos excluídos, guardar o vizinho para continuar navegando
  let nextModalId = null;
  const modalOpen = viewerModal && viewerModal.classList.contains('active');
  if (modalOpen && state.modalItem && removedIds.has(state.modalItem.id)) {
    const items = state.currentDisplayItems || [];
    const idx = getViewerNavIndex();
    const after = items.slice(idx + 1).find(it => !removedIds.has(it.id));
    const before = items.slice(0, Math.max(0, idx)).reverse().find(it => !removedIds.has(it.id));
    nextModalId = (after || before || {}).id || null;
  }

  removed.forEach(m => {
    if (m.thumbnailUrl && m.thumbnailUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(m.thumbnailUrl); } catch (_) {}
    }
    state.selectedModelIds.delete(m.id);
  });
  state.models = state.models.filter(m => !removedIds.has(m.id));

  // Favoritos e projetos são guardados pelo nome: só limpar se nenhum outro arquivo usa o mesmo nome
  const stillMatches = (key) => state.models.some(m =>
    m.name === key || m.path === key || (m.path && m.path.endsWith('/' + key))
  );
  const favs = loadFavorites();
  let favsChanged = false;
  removed.forEach(m => {
    [m.name, m.path].forEach(key => {
      if (key && favs.has(key) && !stillMatches(key)) {
        favs.delete(key);
        favsChanged = true;
      }
    });
  });
  if (favsChanged) saveFavorites(favs);

  let projectsChanged = false;
  const dissolved = [];
  state.customProjects = state.customProjects.filter(project => {
    const before = project.fileKeys.length;
    project.fileKeys = project.fileKeys.filter(stillMatches);
    if (project.fileKeys.length !== before) projectsChanged = true;
    if (project.fileKeys.length < 2) {
      // Um projeto com um arquivo só deixa de fazer sentido: o arquivo volta a ficar avulso
      if (before >= 2) dissolved.push(project.name);
      return false;
    }
    if (project.coverKey && project.coverKey !== '__custom__' && !project.fileKeys.includes(project.coverKey)) {
      project.coverKey = null;
    }
    return true;
  });
  if (projectsChanged || dissolved.length) saveCustomProjects();

  // Contadores das pastas conectadas
  state.folders.forEach(folder => {
    folder.count = state.models.filter(m => m.folderId === folder.id).length;
  });

  if (state.selectedModelIds.size === 0 && state.isSelectionMode) {
    setSelectionMode(false);
  }

  renderFolderChips();
  updateStatsBadge();
  await updateDuplicatesState();

  if (modalOpen && state.modalItem && removedIds.has(state.modalItem.id)) {
    const next = nextModalId && (state.currentDisplayItems || []).find(it => it.id === nextModalId);
    if (next) openViewerModal(next);
    else closeViewerModal();
  }

  if (dissolved.length === 1) {
    showToast(`O projeto "${dissolved[0]}" ficou com um arquivo só e foi desagrupado.`, 'info');
  } else if (dissolved.length > 1) {
    showToast(`${dissolved.length} projetos ficaram com um arquivo só e foram desagrupados.`, 'info');
  }
}

/**
 * Duplicados: mantém este arquivo e manda as outras cópias idênticas para a Lixeira
 */
async function keepOnlyThisCopy(model) {
  if (!model || !model.fingerprint) return;
  let others = state.models.filter(m => m.id !== model.id && m.fingerprint === model.fingerprint);
  if (others.length === 0) return;

  // O selo de duplicado usa uma amostra do arquivo: antes de apagar, conferir o conteúdo inteiro
  if (window.electronAPI && typeof window.electronAPI.hashFile === 'function') {
    const keepHash = await window.electronAPI.hashFile(getModelDiskPath(model));
    if (!keepHash) {
      showToast('Não foi possível ler este arquivo para comparar as cópias.', 'error');
      return;
    }
    const hashes = await Promise.all(others.map(m => window.electronAPI.hashFile(getModelDiskPath(m))));
    const differing = others.filter((m, i) => hashes[i] !== keepHash);
    others = others.filter((m, i) => hashes[i] === keepHash);
    if (differing.length > 0) {
      showToast(differing.length === 1
        ? `"${differing[0].name}" não é idêntico e foi mantido.`
        : `${differing.length} arquivos não são idênticos e foram mantidos.`, 'warning');
    }
    if (others.length === 0) return;
  }
  const folder = getModelParentFolderInfo(model);
  await trashModels(others, {
    title: others.length === 1 ? 'Apagar a outra cópia?' : `Apagar as outras ${others.length} cópias?`,
    description: `"${model.name}"${folder.name ? ` em ${folder.name}` : ''} fica onde está. ${others.length === 1 ? 'A cópia abaixo vai' : 'As cópias abaixo vão'} para a Lixeira do Windows.`,
    confirmLabel: others.length === 1 ? 'Apagar cópia' : 'Apagar cópias'
  });
}

/**
 * Exclui o arquivo aberto no visualizador
 */
function trashModalItem() {
  const item = state.modalItem;
  if (!item || item.isProject) return;
  trashModels([item]);
}

/**
 * Exclui os arquivos marcados na seleção múltipla
 */
function trashSelectedModels() {
  const selected = state.models.filter(m => state.selectedModelIds.has(m.id));
  if (selected.length === 0) return;
  trashModels(selected);
}

function setupTrashFeature() {
  document.body.classList.toggle('can-trash', isTrashSupported());

  if (btnModalTrash) btnModalTrash.addEventListener('click', trashModalItem);
  if (btnTrashSelection) btnTrashSelection.addEventListener('click', trashSelectedModels);
  if (btnConfirmTrash) btnConfirmTrash.addEventListener('click', () => closeTrashConfirmation(true));
  if (btnCancelTrash) btnCancelTrash.addEventListener('click', () => closeTrashConfirmation(false));
  if (trashConfirmBackdrop) trashConfirmBackdrop.addEventListener('click', () => closeTrashConfirmation(false));

  // Captura: com a confirmação aberta, Esc/Enter valem só para ela
  window.addEventListener('keydown', (e) => {
    if (isTrashConfirmOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTrashConfirmation(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTrashConfirmation(true);
      }
      return;
    }

    // Tecla Delete: exclui o arquivo aberto ou os selecionados
    if (isMovePickerOpen() || isMoveConflictOpen()) return;
    if (e.key !== 'Delete' || e.altKey || e.ctrlKey || e.metaKey || !isTrashSupported()) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (viewerModal && viewerModal.classList.contains('active')) {
      e.preventDefault();
      trashModalItem();
    } else if (state.selectedModelIds.size > 0) {
      e.preventDefault();
      trashSelectedModels();
    }
  }, true);
}

// ==========================================
// Mover arquivos entre as pastas conectadas
// ==========================================

/**
 * Mover também só existe no app desktop: o main process faz a operação no disco
 */
function isMoveSupported() {
  return !!(window.electronAPI && typeof window.electronAPI.moveFiles === 'function');
}

function getFolderRootPath(folder) {
  return (folder && state.folderDiskPaths && state.folderDiskPaths[folder.name]) || null;
}

/**
 * Subpasta do modelo dentro da pasta conectada ('' quando está na raiz)
 */
function getModelRelativeDir(model) {
  const rel = getModelRelativePath(model, model.folderName);
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.substring(0, i);
}

function joinDiskPath(root, subPath) {
  const base = root.replace(/[\\/]+$/, '');
  return subPath ? `${base}\\${subPath.replace(/\//g, '\\')}` : base;
}

function describeMoveTarget(folderId, subPath) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return '';
  return subPath ? `${folder.name}/${subPath}` : folder.name;
}

function isModelInMoveTarget(model, folderId, subPath) {
  return model.folderId === folderId &&
    getModelRelativeDir(model).toLowerCase() === (subPath || '').toLowerCase();
}

/**
 * Converte os itens da galeria em arquivos: um projeto leva todas as suas peças
 */
function resolveMoveModels(items) {
  const seen = new Set();
  const out = [];
  (items || []).forEach(item => {
    if (!item) return;
    const parts = item.isProject
      ? ((item.parts && item.parts.length) ? item.parts : [item.primaryPart])
      : [item];
    parts.forEach(m => {
      if (m && !m.isProject && !seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    });
  });
  return out;
}

/**
 * Atualiza o modelo em memória depois que o arquivo mudou de lugar no disco
 */
function applyModelMove(model, folder, subPath, res) {
  const oldName = model.name;
  const newName = res.newName || model.name;

  model.folderId = folder.id;
  model.folderName = folder.name;
  model.name = newName;
  model.path = subPath ? `${subPath}/${newName}` : newName;
  model.fullDiskPath = res.newPath;
  model.fullFolderDirectory = res.newPath.substring(0, res.newPath.lastIndexOf('\\') + 1);
  if (res.size) model.size = res.size;
  if (res.lastModified) model.lastModified = res.lastModified;
  // O proxy de leitura guarda o caminho antigo: trocar pelo novo
  model.file = createDesktopFileProxy(res.newPath, newName, model.size, model.lastModified);
  model.handle = null;
  model.parentHandle = null;

  if (newName !== oldName) {
    // Nome ganhou um número para não sobrescrever: favorito e projeto acompanham o arquivo
    if (model.isFavorite) {
      const favs = loadFavorites();
      favs.add(newName);
      saveFavorites(favs);
    }
    let projectsChanged = false;
    (state.customProjects || []).forEach(project => {
      if (project.fileKeys.includes(oldName) && !project.fileKeys.includes(newName)) {
        project.fileKeys.push(newName);
        projectsChanged = true;
      }
      if (project.coverKey === oldName) {
        project.coverKey = newName;
        projectsChanged = true;
      }
    });
    if (projectsChanged) saveCustomProjects();
  }

  if (model.thumbnailUrl) {
    saveCachedThumbnail(getModelCacheKey(model), {
      thumbnailUrl: model.thumbnailUrl,
      defaultThumbnailUrl: model.defaultThumbnailUrl || model.thumbnailUrl,
      coverSource: model.coverSource || 'auto',
      customCoverUrl: model.customCoverUrl || null,
      metadata: model.metadata,
      slicerData: model.slicerData,
      plates: model.plates,
      extras: model.extras || null
    });
  }
}

/**
 * Envia os pedidos ao disco e aplica na biblioteca os que deram certo
 */
async function runMoveRequests(requests, onConflict) {
  let results = [];
  try {
    results = await window.electronAPI.moveFiles(
      requests.map(r => ({ from: r.from, toDir: r.toDir, newName: r.newName })),
      onConflict
    );
  } catch (err) {
    showToast(`Erro ao mover arquivos: ${err.message}`, 'error');
    return { moved: [], skipped: [], failed: requests.map(r => ({ model: r.model, message: err.message })) };
  }

  const moved = [];
  const skipped = [];
  const failed = [];
  requests.forEach((req, i) => {
    const res = (results || [])[i];
    if (res && res.success) {
      const origin = { folderId: req.model.folderId, subPath: getModelRelativeDir(req.model), name: req.model.name };
      applyModelMove(req.model, req.folder, req.subPath, res);
      moved.push({ model: req.model, origin });
    } else if (res && res.skipped) {
      skipped.push(req.model);
    } else {
      failed.push({ model: req.model, message: (res && res.message) || 'erro desconhecido' });
    }
  });
  return { moved, skipped, failed };
}

/**
 * Atualiza contadores, barra lateral, galeria e o visualizador depois de mover
 */
async function refreshAfterMove(movedModels) {
  state.folders.forEach(folder => {
    folder.count = state.models.filter(m => m.folderId === folder.id).length;
  });
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  renderFolderChips();
  updateStatsBadge();
  renderGallery();

  const movedIds = new Set(movedModels.map(m => m.id));
  if (state.activeModel && movedIds.has(state.activeModel.id)) {
    updateModalFilePath(state.activeModel);
  }
  await updateDuplicatesState();
}

function reportMoveFailures(skipped, failed) {
  if (skipped.length > 0) {
    showToast(skipped.length === 1
      ? `"${skipped[0].name}" foi pulado: já existe um arquivo com esse nome no destino.`
      : `${skipped.length} arquivos foram pulados porque já existem no destino.`, 'warning');
  }
  if (failed.length > 0) {
    showToast(failed.length === 1
      ? `Não foi possível mover "${failed[0].model.name}": ${failed[0].message}`
      : `${failed.length} arquivos não puderam ser movidos. Verifique se estão abertos em outro programa.`, 'error');
  }
}

/**
 * Move os itens (arquivos ou projetos) para uma pasta conectada ou subpasta dela.
 * Nada é sobrescrito: com nome repetido, a pessoa escolhe entre manter os dois ou pular.
 */
async function moveModels(items, folderId, subPath = '') {
  if (!isMoveSupported()) {
    showToast('Mover arquivos está disponível no app desktop do Vault3D.', 'info');
    return [];
  }
  const folder = state.folders.find(f => f.id === folderId);
  const root = getFolderRootPath(folder);
  if (!folder || !root) {
    showToast('Não foi possível localizar essa pasta no disco.', 'error');
    return [];
  }

  const all = resolveMoveModels(items);
  const list = all.filter(m => getModelDiskPath(m) && !isModelInMoveTarget(m, folderId, subPath));
  if (list.length === 0) {
    showToast(all.length > 0 && all.every(m => isModelInMoveTarget(m, folderId, subPath))
      ? 'Os arquivos já estão nessa pasta.'
      : 'Não foi possível localizar esses arquivos no disco.', 'info');
    return [];
  }

  const targetLabel = describeMoveTarget(folderId, subPath);

  // Nomes que já existem no destino (ou que se repetem entre os próprios arquivos movidos)
  const movingIds = new Set(list.map(m => m.id));
  const taken = new Set(state.models
    .filter(m => !movingIds.has(m.id) && isModelInMoveTarget(m, folderId, subPath))
    .map(m => m.name.toLowerCase()));
  const conflicts = [];
  list.forEach(m => {
    const key = m.name.toLowerCase();
    if (taken.has(key)) conflicts.push(m);
    else taken.add(key);
  });

  let onConflict = 'skip';
  if (conflicts.length > 0) {
    const choice = await askMoveConflict(conflicts, targetLabel);
    if (!choice) return [];
    onConflict = choice;
  }

  const toDir = joinDiskPath(root, subPath);
  const { moved, skipped, failed } = await runMoveRequests(
    list.map(m => ({ model: m, from: getModelDiskPath(m), toDir, folder, subPath })),
    onConflict
  );

  if (moved.length > 0) {
    await refreshAfterMove(moved.map(x => x.model));
    const message = moved.length === 1
      ? `"${moved[0].model.name}" foi movido para ${targetLabel}.`
      : `${moved.length} arquivos movidos para ${targetLabel}.`;
    showActionToast(message, 'Desfazer', () => undoMove(moved));
  }
  reportMoveFailures(skipped, failed);
  return moved.map(x => x.model);
}

/**
 * Desfazer: devolve cada arquivo para a pasta e o nome que tinha antes
 */
async function undoMove(moved) {
  const requests = [];
  let lost = 0;
  moved.forEach(({ model, origin }) => {
    const folder = state.folders.find(f => f.id === origin.folderId);
    const root = getFolderRootPath(folder);
    if (!folder || !root || !state.models.includes(model)) {
      lost++;
      return;
    }
    requests.push({
      model,
      from: getModelDiskPath(model),
      toDir: joinDiskPath(root, origin.subPath),
      newName: origin.name,
      folder,
      subPath: origin.subPath
    });
  });

  if (requests.length > 0) {
    const { moved: back, skipped, failed } = await runMoveRequests(requests, 'skip');
    if (back.length > 0) {
      await refreshAfterMove(back.map(x => x.model));
      showToast(back.length === 1
        ? `"${back[0].model.name}" voltou para onde estava.`
        : `${back.length} arquivos voltaram para onde estavam.`, 'success');
    }
    reportMoveFailures(skipped, failed);
  }
  if (lost > 0) {
    showToast(lost === 1
      ? 'Um arquivo não pôde voltar porque a pasta de origem saiu da biblioteca.'
      : `${lost} arquivos não puderam voltar porque a pasta de origem saiu da biblioteca.`, 'warning');
  }
}

/**
 * Aviso com um botão de ação (ex.: Desfazer), visível por mais tempo que o aviso comum
 */
function showActionToast(message, actionLabel, onAction, type = 'success') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type} has-action`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✅' : 'ℹ️'}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
    <button type="button" class="toast-action">${escapeHtml(actionLabel)}</button>
  `;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));

  const dismiss = () => {
    toast.classList.remove('visible');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  };
  const timer = setTimeout(dismiss, 8000);
  toast.querySelector('.toast-action').addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
    onAction();
  }, { once: true });
}

// ---------- Nome repetido no destino ----------

let moveConflictResolver = null;

function askMoveConflict(conflicts, targetLabel) {
  if (!moveConflictModal) return Promise.resolve('skip');
  const count = conflicts.length;
  const titleEl = document.getElementById('moveConflictTitle');
  const descEl = document.getElementById('moveConflictDesc');
  const listEl = document.getElementById('moveConflictList');
  if (titleEl) titleEl.textContent = count === 1 ? 'Esse nome já existe no destino' : `${count} nomes já existem no destino`;
  if (descEl) {
    descEl.textContent = `${count === 1 ? 'Este nome já está' : 'Estes nomes já estão'} em ${targetLabel}. ` +
      'Manter os dois põe um número no nome do arquivo que chega. Nada é sobrescrito.';
  }
  const MAX_NAMES = 4;
  const shown = count > MAX_NAMES + 1 ? conflicts.slice(0, MAX_NAMES) : conflicts;
  if (listEl) {
    listEl.innerHTML = shown.map(m => `<li><span class="trash-name">${escapeHtml(m.name)}</span></li>`).join('') +
      (count > shown.length ? `<li><span class="trash-more">e mais ${count - shown.length} arquivos</span></li>` : '');
  }
  moveConflictModal.style.display = 'flex';
  const btnKeep = document.getElementById('btnMoveConflictKeep');
  setTimeout(() => btnKeep && btnKeep.focus(), 30);
  return new Promise(resolve => { moveConflictResolver = resolve; });
}

function closeMoveConflict(choice) {
  if (moveConflictModal) moveConflictModal.style.display = 'none';
  const resolve = moveConflictResolver;
  moveConflictResolver = null;
  if (resolve) resolve(choice);
}

function isMoveConflictOpen() {
  return !!(moveConflictModal && moveConflictModal.style.display !== 'none' && moveConflictResolver);
}

// ---------- Seletor "Mover para…" ----------

let movePicker = null; // { items, models, expanded, selectedKey, currentKey, query, creating }

function moveTargetKey(folderId, subPath) {
  return `${folderId}::${subPath || ''}`;
}

function getMoveTargets() {
  const targets = [];
  state.folders.forEach(folder => {
    if (!getFolderRootPath(folder)) return;
    const subs = extractFolderTree(folder, state.models);
    targets.push({ folderId: folder.id, subPath: '', name: folder.name, label: folder.name, level: 0, parentPath: null, hasChildren: subs.some(s => s.level === 1) });
    subs.forEach(sub => {
      targets.push({
        folderId: folder.id, subPath: sub.path, name: sub.name, label: `${folder.name}/${sub.path}`, level: sub.level,
        parentPath: sub.parentPath || '', hasChildren: subs.some(s => s.parentPath === sub.path)
      });
    });
  });
  return targets;
}

function getFilteredMoveTargets() {
  const all = getMoveTargets();
  const q = (movePicker && movePicker.query || '').trim().toLowerCase();
  if (q) {
    // Na busca, a lista fica plana com o caminho completo
    return all.filter(t => t.label.toLowerCase().includes(q)).map(t => ({ ...t, level: 0, name: t.label, hasChildren: false }));
  }
  // Árvore: começa recolhida e só mostra as subpastas de quem a pessoa expandiu
  return all.filter(t => {
    if (t.parentPath === null) return true;
    const segs = t.subPath.split('/');
    for (let i = 0; i < segs.length; i++) {
      const ancestor = segs.slice(0, i).join('/');
      if (!movePicker.expanded.has(moveTargetKey(t.folderId, ancestor))) return false;
    }
    return true;
  });
}

function openMovePicker(items) {
  if (!isMoveSupported() || !moveModal) return;
  const models = resolveMoveModels(items).filter(m => getModelDiskPath(m));
  if (models.length === 0) {
    showToast('Não foi possível localizar esses arquivos no disco.', 'error');
    return;
  }
  // Se todos estão na mesma pasta, ela aparece marcada como "pasta atual"
  const dirs = new Set(models.map(m => moveTargetKey(m.folderId, getModelRelativeDir(m))));
  const currentKey = dirs.size === 1 ? Array.from(dirs)[0] : null;

  movePicker = { items, models, expanded: new Set(), selectedKey: null, currentKey, query: '', creating: false };

  const project = items.length === 1 && items[0] && items[0].isProject ? items[0] : null;
  const titleEl = document.getElementById('moveModalTitle');
  const subEl = document.getElementById('moveModalSub');
  if (titleEl) {
    titleEl.textContent = project
      ? `Mover o projeto para…`
      : (models.length === 1 ? 'Mover arquivo para…' : `Mover ${models.length} arquivos para…`);
  }
  if (subEl) {
    subEl.textContent = project
      ? `${project.name} (${models.length} arquivo${models.length === 1 ? '' : 's'})`
      : (models.length === 1 ? models[0].name : `${models[0].name} e mais ${models.length - 1}`);
  }

  const search = document.getElementById('moveSearchInput');
  if (search) search.value = '';
  if (search) search.style.display = getMoveTargets().length > 8 ? '' : 'none';

  setMoveCreating(false);
  renderMovePicker();
  moveModal.style.display = 'flex';
  setTimeout(() => {
    if (search && search.style.display !== 'none') search.focus();
  }, 30);
}

function closeMovePicker() {
  if (moveModal) moveModal.style.display = 'none';
  movePicker = null;
}

function isMovePickerOpen() {
  return !!(moveModal && moveModal.style.display !== 'none' && movePicker);
}

function renderMovePicker() {
  if (!movePicker) return;
  const listEl = document.getElementById('moveTreeList');
  const btnConfirm = document.getElementById('btnConfirmMove');

  const targets = getFilteredMoveTargets();
  const pageItems = targets;
  const scrollTop = listEl ? listEl.scrollTop : 0;

  if (listEl) {
    listEl.innerHTML = '';
    if (pageItems.length === 0) {
      listEl.innerHTML = '<li class="move-tree-empty">Nenhuma pasta encontrada</li>';
    }
    pageItems.forEach(t => {
      const key = moveTargetKey(t.folderId, t.subPath);
      const isCurrent = key === movePicker.currentKey;
      const li = document.createElement('li');
      li.className = `move-tree-item${isCurrent ? ' is-current' : ''}${key === movePicker.selectedKey ? ' is-selected' : ''}`;
      li.style.setProperty('--move-level', t.level);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', key === movePicker.selectedKey ? 'true' : 'false');
      li.title = t.label;
      const isOpen = movePicker.expanded.has(key);
      li.innerHTML = `
        ${t.hasChildren
          ? `<button type="button" class="move-tree-toggle${isOpen ? ' is-open' : ''}" title="${isOpen ? 'Recolher' : 'Expandir'}" aria-label="${isOpen ? 'Recolher subpastas' : 'Expandir subpastas'}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>
            </button>`
          : '<span class="move-tree-toggle-spacer"></span>'}
        <span class="folder-item-icon">📁</span>
        <span class="move-tree-name">${escapeHtml(t.name)}</span>
        ${isCurrent ? '<span class="move-tree-tag">pasta atual</span>' : ''}
      `;
      const toggle = li.querySelector('.move-tree-toggle');
      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isOpen) movePicker.expanded.delete(key);
          else movePicker.expanded.add(key);
          renderMovePicker();
        });
        toggle.addEventListener('dblclick', (e) => e.stopPropagation());
      }
      li.addEventListener('click', () => {
        if (isCurrent && !movePicker.creating) return;
        movePicker.selectedKey = key;
        renderMovePicker();
      });
      li.addEventListener('dblclick', () => {
        if (isCurrent || movePicker.creating) return;
        movePicker.selectedKey = key;
        confirmMovePicker();
      });
      listEl.appendChild(li);
    });
  }

  if (listEl) listEl.scrollTop = scrollTop;

  updateMoveNewFolderPrefix();
  if (btnConfirm) {
    const nameOk = !movePicker.creating || !!getNewSubfolderName();
    btnConfirm.disabled = !movePicker.selectedKey || !nameOk ||
      (!movePicker.creating && movePicker.selectedKey === movePicker.currentKey);
    btnConfirm.textContent = movePicker.creating ? 'Criar e mover' : 'Mover aqui';
  }
}

function getSelectedMoveTarget() {
  if (!movePicker || !movePicker.selectedKey) return null;
  return getMoveTargets().find(t => moveTargetKey(t.folderId, t.subPath) === movePicker.selectedKey) || null;
}

/**
 * Nome válido para uma nova subpasta no Windows (ou '' se inválido)
 */
function getNewSubfolderName() {
  const input = document.getElementById('moveNewFolderInput');
  const name = (input && input.value || '').trim().replace(/[. ]+$/, '');
  if (!name || /[\\/:*?"<>|]/.test(name) || /^\.+$/.test(name)) return '';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) return '';
  return name;
}

function updateMoveNewFolderPrefix() {
  const prefix = document.getElementById('moveNewFolderPrefix');
  if (!prefix || !movePicker) return;
  const target = getSelectedMoveTarget();
  prefix.textContent = target ? `${target.label}/` : 'Escolha a pasta acima';
  prefix.title = target ? target.label : '';
}

function setMoveCreating(on) {
  if (!movePicker) return;
  movePicker.creating = on;
  const row = document.getElementById('moveNewFolderRow');
  const input = document.getElementById('moveNewFolderInput');
  const btnNew = document.getElementById('btnMoveNewFolder');
  if (row) row.style.display = on ? 'flex' : 'none';
  if (btnNew) btnNew.textContent = on ? 'Cancelar subpasta' : '+ Nova subpasta';
  if (on) {
    // Sem pasta escolhida, sugere a pasta atual como base
    if (!movePicker.selectedKey) {
      movePicker.selectedKey = movePicker.currentKey || (getMoveTargets()[0] && moveTargetKey(getMoveTargets()[0].folderId, getMoveTargets()[0].subPath)) || null;
    }
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 30);
    }
  } else if (movePicker.selectedKey === movePicker.currentKey) {
    movePicker.selectedKey = null;
  }
  renderMovePicker();
}

async function confirmMovePicker() {
  if (!movePicker) return;
  const target = getSelectedMoveTarget();
  if (!target) return;
  let subPath = target.subPath;
  if (movePicker.creating) {
    const name = getNewSubfolderName();
    if (!name) {
      showToast('Escolha um nome de subpasta sem os caracteres \\ / : * ? " < > |', 'warning');
      return;
    }
    subPath = subPath ? `${subPath}/${name}` : name;
  } else if (moveTargetKey(target.folderId, subPath) === movePicker.currentKey) {
    return;
  }
  const { items } = movePicker;
  closeMovePicker();
  const moved = await moveModels(items, target.folderId, subPath);
  if (moved.length > 0 && state.isSelectionMode && moved.some(m => state.selectedModelIds.has(m.id))) {
    setSelectionMode(false);
  }
}

// ---------- Arrastar card até uma pasta da barra lateral ----------

let moveDrag = null; // { items } enquanto um card está sendo arrastado

function startMoveDrag(model) {
  if (!isMoveSupported() || !model) return;
  const items = (state.isSelectionMode && state.selectedModelIds.has(model.id))
    ? state.models.filter(m => state.selectedModelIds.has(m.id))
    : [model];
  const models = resolveMoveModels(items);
  moveDrag = { items };
  document.body.classList.add('is-moving-files');
  // Esmaecer a pasta de origem quando todos saem do mesmo lugar
  const dirs = new Set(models.map(m => moveTargetKey(m.folderId, getModelRelativeDir(m))));
  if (dirs.size === 1 && sidebarFoldersList) {
    const [key] = dirs;
    sidebarFoldersList.querySelectorAll('.sidebar-folder-item').forEach(el => {
      el.classList.toggle('is-move-source', moveTargetKey(el.dataset.folderId, el.dataset.subfolderPath) === key);
    });
  }
}

function endMoveDrag() {
  moveDrag = null;
  document.body.classList.remove('is-moving-files');
  document.querySelectorAll('.sidebar-folder-item.is-drop-target, .sidebar-folder-item.is-move-source').forEach(el => {
    el.classList.remove('is-drop-target', 'is-move-source');
  });
}

function setupFolderDropTarget(element, folderId, subPath) {
  element.addEventListener('dragover', (e) => {
    if (!moveDrag) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    element.classList.add('is-drop-target');
  });
  element.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && element.contains(e.relatedTarget)) return;
    element.classList.remove('is-drop-target');
  });
  element.addEventListener('drop', (e) => {
    if (!moveDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const { items } = moveDrag;
    endMoveDrag();
    moveModels(items, folderId, subPath || '').then(moved => {
      if (moved.length > 0 && state.isSelectionMode && moved.some(m => state.selectedModelIds.has(m.id))) {
        setSelectionMode(false);
      }
    });
  });
}

function moveModalItem() {
  if (state.modalItem) openMovePicker([state.modalItem]);
}

function moveSelectedModels() {
  const selected = state.models.filter(m => state.selectedModelIds.has(m.id));
  if (selected.length > 0) openMovePicker(selected);
}

function setupMoveFeature() {
  document.body.classList.toggle('can-move', isMoveSupported());

  if (btnModalMove) btnModalMove.addEventListener('click', moveModalItem);
  if (btnMoveSelection) btnMoveSelection.addEventListener('click', moveSelectedModels);

  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  on('moveModalBackdrop', closeMovePicker);
  on('btnCancelMove', closeMovePicker);
  on('btnConfirmMove', confirmMovePicker);
  on('btnMoveNewFolder', () => setMoveCreating(!(movePicker && movePicker.creating)));
  on('moveConflictBackdrop', () => closeMoveConflict(null));
  on('btnMoveConflictCancel', () => closeMoveConflict(null));
  on('btnMoveConflictSkip', () => closeMoveConflict('skip'));
  on('btnMoveConflictKeep', () => closeMoveConflict('rename'));

  const search = document.getElementById('moveSearchInput');
  if (search) {
    search.addEventListener('input', () => {
      if (!movePicker) return;
      movePicker.query = search.value;
      const listEl = document.getElementById('moveTreeList');
      if (listEl) listEl.scrollTop = 0;
      renderMovePicker();
    });
  }
  const newInput = document.getElementById('moveNewFolderInput');
  if (newInput) newInput.addEventListener('input', renderMovePicker);

  // Captura: com o seletor ou a pergunta de conflito abertos, Esc/Enter valem só para eles
  window.addEventListener('keydown', (e) => {
    if (isMoveConflictOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeMoveConflict(null);
      }
      return;
    }
    if (!isMovePickerOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (movePicker.creating) setMoveCreating(false);
      else closeMovePicker();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!movePicker.selectedKey && movePicker.query) {
        // Busca com um único resultado: Enter escolhe essa pasta
        const found = getFilteredMoveTargets().filter(t => moveTargetKey(t.folderId, t.subPath) !== movePicker.currentKey);
        if (found.length === 1) movePicker.selectedKey = moveTargetKey(found[0].folderId, found[0].subPath);
      }
      confirmMovePicker();
    } else {
      // Teclas de atalho da galeria/visualizador não devem disparar por trás do seletor
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('dragend', endMoveDrag);
}

/**
 * Configura o comportamento nativo de Arrastar e Soltar (Drag & Drop)
 * permitindo arrastar o arquivo 3D do navegador para a janela do fatiador ou Windows Explorer
 */
function setupModelDraggable(element, getModelFn) {
  if (!element) return;
  element.setAttribute('draggable', 'true');

  // Ao pressionar o mouse, pré-carrega o File se necessário
  element.addEventListener('pointerdown', async () => {
    const model = typeof getModelFn === 'function' ? getModelFn() : getModelFn;
    if (!model) return;
    let target = model;
    if (model.isProject && (model.primaryPart || (model.parts && model.parts.length > 0))) {
      target = (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover)
        ? state.activePlate.model
        : (model.primaryPart || model.parts[0]);
    }
    if (target && !target.file && target.handle && typeof target.handle.getFile === 'function') {
      try {
        target.file = await target.handle.getFile();
      } catch (_) {}
    }
  });

  element.addEventListener('dragstart', (e) => {
    const model = typeof getModelFn === 'function' ? getModelFn() : getModelFn;
    if (!model) return;

    let target = model;
    if (model.isProject && (model.primaryPart || (model.parts && model.parts.length > 0))) {
      target = (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover)
        ? state.activePlate.model
        : (model.primaryPart || model.parts[0]);
    }

    const file = target ? target.file : null;
    const fileName = (target && target.name) || (file && file.name) || 'modelo_3d.3mf';
    const fullPath = (target && target.fullDiskPath) || (target && target.fullFolderDirectory ? `${target.fullFolderDirectory}${target.name}` : '');

    element.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'copyMove';

    // Soltar numa pasta da barra lateral move o arquivo (ou projeto) para ela
    startMoveDrag(model);

    if (file) {
      if (!target._blobUrl) {
        if (file instanceof Blob) {
          target._blobUrl = URL.createObjectURL(file);
        }
      }
      const blobUrl = target._blobUrl;

      // 1. DownloadURL nativo do Chromium para arrastar para a janela do fatiador ou Windows Explorer
      if (blobUrl) {
        e.dataTransfer.setData('DownloadURL', `application/octet-stream:${fileName}:${blobUrl}`);
      }

      // 2. DataTransfer Items para navegadores / Electron
      try {
        if (e.dataTransfer.items && file instanceof Blob) {
          e.dataTransfer.items.add(file);
        }
      } catch (_) {}

      // 3. Fallback text/plain e URI list
      e.dataTransfer.setData('text/plain', fullPath || fileName);
      if (blobUrl) {
        e.dataTransfer.setData('text/uri-list', blobUrl);
      }
    } else if (fullPath) {
      e.dataTransfer.setData('text/plain', fullPath);
    }
  });

  element.addEventListener('dragend', () => {
    element.classList.remove('is-dragging');
  });
}

/**
 * Copia texto para a área de transferência do Windows / SO.
 */
async function copyTextToClipboard(text) {
  if (window.electronAPI && typeof window.electronAPI.copyToClipboard === 'function') {
    try {
      const ok = await window.electronAPI.copyToClipboard(text);
      if (ok) return true;
    } catch (_) {}
  }
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (_) {}
  textArea.remove();
  return ok;
}

/**
 * Retorna as configurações visuais do botão do Fatiador (Adapta entre Desktop e Web)
 */
function getSlicerButtonConfig(model = null) {
  const isDesktop = Boolean(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron);
  if (isDesktop) {
    const defaultName = getDefaultSlicerName();
    const fileKey = model ? getSlicerFileKey(model) : '';
    // Último fatiador escolhido para este arquivo: o botão passa a mostrar o nome e o ícone dele
    const last = fileKey ? getSlicerNames(getLastSlicer(fileKey)) : null;
    // Sem histórico, o arquivo abre no padrão escolhido em "Fatiadores"
    const known = last || (fileKey ? getSlicerNames(getSlicerState().defaultId) : null);
    return {
      text: known ? `Abrir no ${known.short}` : 'Abrir no Fatiador',
      // No card o espaço é curto: ícone + nome do fatiador já dizem o que o botão faz
      cardText: known ? known.short : 'Abrir no Fatiador',
      title: last
        ? `Abrir no ${last.full} (último usado neste arquivo; a setinha troca o fatiador)`
        : defaultName
        ? `Abrir no ${defaultName}`
        : 'Abrir arquivo diretamente no seu Fatiador 3D padrão (Bambu Studio, OrcaSlicer, etc.)',
      icon: known ? slicerIconHtml(known.iconUrl, 16) : `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      `
    };
  }
  return {
    title: 'Copiar caminho para colar no fatiador ou Windows Explorer',
    text: 'Copiar caminho',
    icon: `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `
  };
}

/**
 * Arquivo que o botão do fatiador abre (peça principal no caso de projeto)
 */
function getSlicerTargetModel(model) {
  if (!model) return null;
  if (model.isProject) return model.primaryPart || (model.parts && model.parts[0]) || null;
  return model;
}

/** Chave estável do arquivo para lembrar o último fatiador usado nele */
function getSlicerFileKey(model) {
  if (model && model.slicerKey) return model.slicerKey;
  const target = getSlicerTargetModel(model);
  if (!target) return '';
  return `${target.folderName || ''}/${(target.path || target.name || '').replace(/\\/g, '/')}`.toLowerCase();
}

function getModalSlicerTarget() {
  return (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover ? state.activePlate.model : null)
    || (state.activeProject ? (state.activeProject.primaryPart || (state.activeProject.parts && state.activeProject.parts[0])) : null)
    || state.activeModel;
}

/** Atualiza o nome do fatiador nos botões dos cards e do visualizador */
function refreshSlicerLabels() {
  const apply = (btn, model, compact) => {
    const cfg = getSlicerButtonConfig(model);
    const html = `${cfg.icon}<span>${escapeHtml(compact ? cfg.cardText : cfg.text)}</span>`;
    btn.title = cfg.title;
    // Durante o "Fatiador aberto!" só troca o que volta depois
    if (btn.classList.contains('btn-copied')) btn.dataset.origHtml = html;
    else btn.innerHTML = html;
  };
  document.querySelectorAll('.btn-open-slicer[data-slicer-key]').forEach((btn) => {
    apply(btn, { slicerKey: btn.dataset.slicerKey }, true);
  });
  const modalBtn = document.getElementById('btnModalOpenSlicer');
  if (modalBtn) apply(modalBtn, getModalSlicerTarget());
}

/**
 * Resolve o arquivo real (peça principal de um projeto) e o caminho completo dele no disco
 */
async function resolveSlicerTarget(model) {
  if (!model) return { targetModel: null, fullPath: null };

  // 1. Resolver o modelo real caso seja um Projeto consolidado
  let targetModel = model;
  if (model.isProject) {
    if (state.activePlate && state.activePlate.model && !state.activePlate.isCustomCover) {
      targetModel = state.activePlate.model;
    } else if (model.primaryPart) {
      targetModel = model.primaryPart;
    } else if (model.parts && model.parts.length > 0) {
      targetModel = model.parts[0];
    }
  }
  if (!targetModel) return { targetModel: null, fullPath: null };

  // 2. Resolver o caminho completo do arquivo no disco
  const folderName = targetModel.folderName || '';
  const relPath = (targetModel.path || targetModel.name).replace(/\//g, '\\');

  let fullPath = targetModel.fullDiskPath;
  if (!fullPath && window.electronAPI && typeof window.electronAPI.resolveDiskPath === 'function') {
    try {
      const resolved = await window.electronAPI.resolveDiskPath(folderName, relPath);
      if (resolved && resolved.success && resolved.fullPath) {
        fullPath = resolved.fullPath;
        targetModel.fullDiskPath = fullPath;
        targetModel.fullFolderDirectory = resolved.folderPath;
      }
    } catch (err) {
      console.warn('Erro ao resolver caminho no disco via Electron:', err);
    }
  }

  if (!fullPath) {
    const rootBase = (state.folderDiskPaths && state.folderDiskPaths[folderName]) || (
      folderName.includes('sample_models') || relPath.includes('sample_models')
        ? 'C:\\Users\\eustudio\\Desktop\\Projeto\\sample_models'
        : `C:\\Users\\eustudio\\Downloads\\${folderName}`
    );
    let sub = relPath;
    if (sub.toLowerCase().startsWith(folderName.toLowerCase() + '\\')) {
      sub = sub.substring(folderName.length + 1);
    }
    fullPath = `${rootBase}\\${sub}`.replace(/\\\\+/g, '\\');
    targetModel.fullDiskPath = fullPath;
    targetModel.fullFolderDirectory = rootBase + '\\';
  }

  return { targetModel, fullPath };
}

/**
 * Liga a setinha ▾ ao menu de fatiadores (abre o arquivo no fatiador escolhido)
 */
function wireSlicerCaret(caretEl, getModel, mainBtn) {
  if (!caretEl) return;
  caretEl.addEventListener('mousedown', (e) => e.stopPropagation());
  caretEl.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openSlicerMenu(caretEl, {
      onPick: (slicerId) => {
        const m = getModel();
        if (m) openModelInSlicer(m, mainBtn, slicerId);
      }
    });
  });
}

/**
 * Abre o arquivo 3D diretamente no Fatiador (no app Desktop) ou copia o caminho (na Web).
 * slicerId (opcional) vem do menu da setinha; sem ele vale o padrão configurado em "Fatiadores".
 */
async function openModelInSlicer(model, buttonEl, slicerId) {
  if (!model) return;
  if (!getAuthenticatedUser()) {
    showToast('Acesso restrito: faça login com Magic Link para copiar o caminho do modelo.', 'warning');
    return;
  }

  try {
    const { targetModel, fullPath } = await resolveSlicerTarget(model);
    if (!targetModel) {
      showToast('Nenhum arquivo 3D encontrado.', 'warning');
      return;
    }
    const modelDisplayName = targetModel.name || targetModel.path || 'modelo 3D';
    const fileKey = getSlicerFileKey(targetModel);
    // Clique normal: reabre no último fatiador usado neste arquivo (escolhido pela setinha ou não)
    const chosenSlicerId = slicerId || getLastSlicer(fileKey) || undefined;

    // 3. Se estiver no app Desktop (Electron), abrir diretamente no fatiador!
    if (window.electronAPI && typeof window.electronAPI.openInSlicer === 'function' && fullPath) {
      // Também copia para a área de transferência silenciosamente como conveniência
      copyTextToClipboard(fullPath).catch(() => {});

      const res = await window.electronAPI.openInSlicer(fullPath, chosenSlicerId);
      if (res && res.success) {
        if (res.slicerId) setLastSlicer(fileKey, res.slicerId);
        if (buttonEl) {
          if (!buttonEl.dataset.origHtml) {
            buttonEl.dataset.origHtml = buttonEl.innerHTML;
          }
          buttonEl.classList.add('btn-copied');
          buttonEl.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Fatiador aberto!</span>
          `;
          setTimeout(() => {
            buttonEl.classList.remove('btn-copied');
            if (buttonEl.dataset.origHtml) {
              buttonEl.innerHTML = buttonEl.dataset.origHtml;
              delete buttonEl.dataset.origHtml;
            }
          }, 2200);
        }
        // O nome do fatiador usado passa a aparecer nos botões deste arquivo
        refreshSlicerLabels();

        showToast(`🚀 Abrindo ${modelDisplayName} no ${res.slicerName || 'seu fatiador'}!`, 'success');
        return;
      } else {
        console.warn('openInSlicer retornou aviso/erro, usando fallback de cópia:', res?.message);
      }
    }

    // Fallback para modo Web ou caso o SO não abra diretamente
    const textToCopy = fullPath || targetModel.name;
    const copied = await copyTextToClipboard(textToCopy);
    if (!copied) {
      throw new Error('Não foi possível acessar a área de transferência.');
    }

    if (buttonEl) {
      if (!buttonEl.dataset.origHtml) {
        buttonEl.dataset.origHtml = buttonEl.innerHTML;
      }
      buttonEl.classList.add('btn-copied');
      buttonEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Caminho copiado!</span>
      `;
      setTimeout(() => {
        buttonEl.classList.remove('btn-copied');
        if (buttonEl.dataset.origHtml) {
          buttonEl.innerHTML = buttonEl.dataset.origHtml;
          delete buttonEl.dataset.origHtml;
        }
      }, 2200);
    }

    showToast(`📋 Caminho copiado! Pressione Ctrl+V no seu fatiador ou Windows Explorer.`, 'success');

  } catch (err) {
    console.error('Erro ao abrir ou copiar modelo:', err);
    showToast(`Não foi possível abrir o modelo: ${err.message}`, 'error');
  }
}

/**
 * Salva os projetos customizados definidos pelo usuário no localStorage
 */
function saveCustomProjects() {
  try {
    localStorage.setItem('antigravity_custom_projects', JSON.stringify(state.customProjects));
  } catch (e) {
    console.warn('Erro ao salvar projetos customizados:', e);
  }
}

/**
 * Aplica os projetos manuais criados pelo usuário sobre a lista de modelos.
 * ZERO Falsos Positivos:
 * - Apenas os arquivos que o usuário agrupou explicitamente são combinados em projetos.
 * - Todos os demais modelos permanecem 100% individuais e intactos.
 */
function applyCustomProjects(rawModels) {
  if (!state.customProjects || state.customProjects.length === 0) {
    return rawModels;
  }

  const assignedModelIds = new Set();
  const resultItems = [];

  for (const project of state.customProjects) {
    const projectParts = rawModels.filter(m => {
      if (assignedModelIds.has(m.id)) return false;
      const isMatch = project.fileKeys.some(key => 
        m.name === key || m.path === key || (m.path && m.path.endsWith('/' + key))
      );
      return isMatch;
    });

    if (projectParts.length > 0) {
      projectParts.forEach(p => assignedModelIds.add(p.id));
      const projEntity = createProjectEntity(project.name, projectParts, project.id, project.coverKey, project.customCoverUrl);
      projEntity.customProjectId = project.id;
      if (project.createdAt && project.createdAt > (projEntity.lastModified || 0)) {
        projEntity.lastModified = project.createdAt;
      }
      resultItems.push(projEntity);
    }
  }

  // Manter todos os modelos não associados a nenhum projeto como itens avulsos normais
  for (const model of rawModels) {
    if (!assignedModelIds.has(model.id)) {
      resultItems.push(model);
    }
  }

  return resultItems;
}

/**
 * Ativa ou desativa o modo de seleção múltipla na galeria
 */
function setSelectionMode(active) {
  state.isSelectionMode = active;
  document.body.classList.toggle('selection-mode-active', active);

  if (btnToggleSelect) {
    btnToggleSelect.classList.toggle('active', active);
    const span = btnToggleSelect.querySelector('span');
    if (span) span.textContent = active ? 'Concluir' : 'Selecionar';
  }

  if (!active) {
    state.selectedModelIds.clear();
  }

  updateSelectionBarUI();

  // Atualizar visual dos cards
  document.querySelectorAll('.model-card').forEach(card => {
    const isSel = state.selectedModelIds.has(card.dataset.id);
    card.classList.toggle('is-selected', isSel);
    const chk = card.querySelector('.card-select-checkbox');
    if (chk) chk.classList.toggle('checked', isSel);
  });
}

/**
 * Alterna a seleção de um modelo individual
 */
function toggleModelSelection(modelId) {
  if (state.selectedModelIds.has(modelId)) {
    state.selectedModelIds.delete(modelId);
  } else {
    state.selectedModelIds.add(modelId);
  }

  if (!state.isSelectionMode && state.selectedModelIds.size > 0) {
    setSelectionMode(true);
  } else if (state.isSelectionMode && state.selectedModelIds.size === 0) {
    // Desmarcou tudo: sai do modo de seleção e os cards voltam a abrir com um clique
    setSelectionMode(false);
  } else {
    updateSelectionBarUI();
    const card = document.querySelector(`.model-card[data-id="${modelId}"]`);
    if (card) {
      const isSel = state.selectedModelIds.has(modelId);
      card.classList.toggle('is-selected', isSel);
      const chk = card.querySelector('.card-select-checkbox');
      if (chk) chk.classList.toggle('checked', isSel);
    }
  }
}

/**
 * Verifica se todos os modelos visíveis que podem ser selecionados já estão selecionados
 */
function areAllVisibleSelected() {
  if (!state.currentDisplayItems || state.currentDisplayItems.length === 0) return false;
  const selectable = state.currentDisplayItems.filter(item => !item.isProject);
  if (selectable.length === 0) return false;
  return selectable.every(item => state.selectedModelIds.has(item.id));
}

/**
 * Alterna entre selecionar todos os visíveis ou desselecionar todos os visíveis
 */
function toggleSelectAllVisible() {
  if (!state.currentDisplayItems || state.currentDisplayItems.length === 0) return;
  const selectable = state.currentDisplayItems.filter(item => !item.isProject);
  if (selectable.length === 0) {
    showToast('Nenhum arquivo avulso disponível para seleção.', 'info');
    return;
  }

  const allSelected = selectable.every(item => state.selectedModelIds.has(item.id));

  if (allSelected) {
    // Desselecionar todos os visíveis
    selectable.forEach(item => {
      state.selectedModelIds.delete(item.id);
    });
    showToast('Arquivos visíveis desmarcados.', 'info');
  } else {
    // Selecionar todos os visíveis
    selectable.forEach(item => {
      state.selectedModelIds.add(item.id);
    });
    showToast(`${state.selectedModelIds.size} arquivos selecionados!`, 'info');
  }

  if (state.selectedModelIds.size === 0) {
    setSelectionMode(false);
  } else {
    if (!state.isSelectionMode) {
      state.isSelectionMode = true;
      document.body.classList.add('selection-mode-active');
      if (btnToggleSelect) {
        btnToggleSelect.classList.add('active');
        const span = btnToggleSelect.querySelector('span');
        if (span) span.textContent = 'Concluir';
      }
    }
    updateSelectionBarUI();
    document.querySelectorAll('.model-card').forEach(card => {
      const isSel = state.selectedModelIds.has(card.dataset.id);
      card.classList.toggle('is-selected', isSel);
      const chk = card.querySelector('.card-select-checkbox');
      if (chk) chk.classList.toggle('checked', isSel);
    });
  }
}

/**
 * Seleciona todos os modelos atualmente visíveis na galeria filtrada (compatibilidade)
 */
function selectAllVisible() {
  toggleSelectAllVisible();
}

/**
 * Limpa toda a seleção e oculta a barra flutuante
 */
function clearSelection() {
  state.selectedModelIds.clear();
  setSelectionMode(false);
}

/**
 * Atualiza o badge e visibilidade da barra de ação flutuante
 */
function updateSelectionBarUI() {
  const count = state.selectedModelIds.size;
  if (count > 0) {
    if (selectionActionBar) selectionActionBar.style.display = 'flex';
    if (selectionCountBadge) selectionCountBadge.textContent = count;
    if (selectionCountText) {
      selectionCountText.textContent = count === 1 ? 'arquivo selecionado' : 'arquivos selecionados';
    }
  } else {
    if (selectionActionBar) selectionActionBar.style.display = 'none';
  }

  // Atualiza o botão Selecionar / Desselecionar visíveis dinamicamente
  if (btnSelectAllVisible) {
    const allSelected = areAllVisibleSelected();
    const span = btnSelectAllVisible.querySelector('span');
    if (span) {
      span.textContent = allSelected ? 'Desselecionar visíveis' : 'Selecionar visíveis';
    }
    btnSelectAllVisible.title = allSelected 
      ? 'Desmarcar todos os modelos visíveis na página' 
      : 'Selecionar todos os modelos visíveis na página/busca';
    btnSelectAllVisible.classList.toggle('is-deselect', allSelected);
  }
}

/**
 * Abre o modal para definir o nome e confirmar a criação do projeto
 */
function openCreateProjectModal() {
  if (state.selectedModelIds.size < 2) {
    showToast('Selecione pelo menos 2 arquivos para criar um projeto.', 'warning');
    return;
  }

  const selectedModels = state.models.filter(m => state.selectedModelIds.has(m.id));
  if (selectedModels.length === 0) return;

  // Sugerir nome baseado na busca ativa ou prefixo comum
  let suggestedName = '';
  if (state.searchQuery && state.searchQuery.length >= 2) {
    suggestedName = state.searchQuery.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } else {
    const first = selectedModels[0].name;
    const match = first.match(/^([A-Za-z0-9\s]{4,})[_-]/);
    if (match) {
      suggestedName = match[1].replace(/_/g, ' ').trim();
    } else {
      const dot = first.lastIndexOf('.');
      suggestedName = dot !== -1 ? first.substring(0, dot) : first;
    }
  }

  if (inputProjectName) {
    inputProjectName.value = suggestedName;
  }
  if (projectModalCount) {
    projectModalCount.textContent = `${selectedModels.length} arquivos`;
  }
  const totalSize = selectedModels.reduce((acc, m) => acc + (m.size || 0), 0);
  if (projectModalSize) {
    projectModalSize.textContent = formatBytes(totalSize);
  }

  if (projectModalPartsList) {
    projectModalPartsList.innerHTML = '';
    selectedModels.forEach(m => {
      const row = document.createElement('div');
      row.className = 'project-part-item';
      row.innerHTML = `
        <span>📄 ${escapeHtml(m.name)}</span>
        <span style="color: var(--text-muted); font-size: 0.75rem;">${formatBytes(m.size)}</span>
      `;
      projectModalPartsList.appendChild(row);
    });
  }

  // Inicializar e renderizar o seletor de capa do projeto
  state.selectedCoverKey = null;
  state.selectedCustomCoverUrl = null;
  const fileInput = document.getElementById('inputCustomCoverFile');
  if (fileInput) fileInput.value = '';

  renderProjectCoverPicker(selectedModels);

  if (createProjectModal) {
    createProjectModal.style.removeProperty('display');
    createProjectModal.classList.add('active');
    setTimeout(() => {
      if (inputProjectName) {
        inputProjectName.focus();
        inputProjectName.select();
      }
    }, 60);
  }
}

/**
 * Adiciona e seleciona imediatamente uma foto personalizada para a capa do projeto
 */
function addCustomCoverCardToPicker(customUrl, fileName) {
  state.selectedCustomCoverUrl = customUrl;
  state.selectedCoverKey = '__custom__';
  const selectedModels = state.models.filter(m => state.selectedModelIds.has(m.id));
  renderProjectCoverPicker(selectedModels);
  if (projectCoverHint) {
    projectCoverHint.textContent = `Capa selecionada: ${fileName || 'Foto personalizada'} 🖼️`;
  }
}

/**
 * Renderiza o seletor interativo de miniaturas para a capa do projeto
 */
function renderProjectCoverPicker(selectedModels) {
  if (!projectCoverGrid) return;
  projectCoverGrid.innerHTML = '';

  const modelsWithThumbs = selectedModels.filter(m => m.thumbnailUrl);

  // Se ainda não definiu a capa e não há foto própria carregada, adota a primeira peça com miniatura
  if (!state.selectedCoverKey) {
    state.selectedCoverKey = modelsWithThumbs.length > 0 ? modelsWithThumbs[0].name : selectedModels[0].name;
  }

  if (projectCoverHint) {
    if (state.selectedCoverKey === '__custom__' && state.selectedCustomCoverUrl) {
      projectCoverHint.textContent = 'Capa selecionada: Foto personalizada 🖼️';
    } else {
      const count = modelsWithThumbs.length;
      if (count > 0) {
        projectCoverHint.textContent = `${count} miniatura${count === 1 ? '' : 's'} pronta${count === 1 ? '' : 's'}`;
      } else {
        projectCoverHint.textContent = 'Verificando miniaturas dos arquivos...';
      }
    }
  }

  // 1. Se o usuário enviou uma foto personalizada, exibe como primeiro card de capa
  if (state.selectedCustomCoverUrl) {
    const isCustomSel = state.selectedCoverKey === '__custom__';
    const customCard = document.createElement('div');
    customCard.className = `project-cover-card ${isCustomSel ? 'selected' : ''}`;
    customCard.dataset.modelName = '__custom__';
    customCard.title = 'Foto própria carregada para a capa';
    customCard.innerHTML = `
      <img class="project-cover-img" src="${state.selectedCustomCoverUrl}" alt="Foto Própria" loading="lazy">
      <span class="project-cover-badge">✓ Própria</span>
      <span class="project-cover-name">Foto Própria</span>
    `;
    customCard.addEventListener('click', () => {
      state.selectedCoverKey = '__custom__';
      projectCoverGrid.querySelectorAll('.project-cover-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.modelName === '__custom__');
      });
      if (projectCoverHint) {
        projectCoverHint.textContent = 'Capa selecionada: Foto personalizada 🖼️';
      }
    });
    projectCoverGrid.appendChild(customCard);
  }

  if (modelsWithThumbs.length === 0 && !state.selectedCustomCoverUrl) {
    projectCoverGrid.innerHTML = `
      <div class="project-cover-empty">
        <span>🔍 Verificando miniaturas nos 3MFs selecionados...</span>
      </div>
    `;
  }

  // Verificar e carregar sob demanda miniaturas de 3MFs que ainda não foram extraídas
  selectedModels.forEach(m => {
    if (!m.thumbnailUrl && (m.type === '3mf' || m.type === 'stl')) {
      loadModelOnDemand(m).then(loaded => {
        if (loaded && loaded.thumbnailUrl) {
          renderProjectCoverPicker(selectedModels);
        }
      });
    }

    if (!m.thumbnailUrl) return;

    let cleanName = m.name;
    const dot = cleanName.lastIndexOf('.');
    if (dot !== -1) cleanName = cleanName.substring(0, dot);
    const sep = Math.max(cleanName.lastIndexOf('_'), cleanName.lastIndexOf('-'), cleanName.lastIndexOf(' '));
    if (sep !== -1 && sep < cleanName.length - 2) {
      cleanName = cleanName.substring(sep + 1);
    }

    const card = document.createElement('div');
    const isSelected = state.selectedCoverKey === m.name;
    card.className = `project-cover-card ${isSelected ? 'selected' : ''}`;
    card.dataset.modelName = m.name;
    card.title = `Usar "${m.name}" como capa do projeto`;

    card.innerHTML = `
      <img class="project-cover-img" src="${m.thumbnailUrl}" alt="${escapeHtml(m.name)}" loading="lazy">
      <span class="project-cover-badge">✓ Capa</span>
      <span class="project-cover-name">${escapeHtml(cleanName)}</span>
    `;

    card.addEventListener('click', () => {
      state.selectedCoverKey = m.name;
      projectCoverGrid.querySelectorAll('.project-cover-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.modelName === m.name);
      });
      if (projectCoverHint) {
        projectCoverHint.textContent = `Capa selecionada: ${escapeHtml(m.name)}`;
      }
    });

    projectCoverGrid.appendChild(card);
  });

  const emptyMsg = projectCoverGrid.querySelector('.project-cover-empty');
  if (emptyMsg && projectCoverGrid.querySelectorAll('.project-cover-card').length > 0) {
    emptyMsg.remove();
  }
}

function closeCreateProjectModal() {
  if (createProjectModal) {
    createProjectModal.classList.remove('active');
    createProjectModal.style.removeProperty('display');
  }
}

/**
 * Confirma a criação do projeto com as peças selecionadas e capa definida
 */
function confirmCreateProject() {
  const name = inputProjectName ? inputProjectName.value.trim() : '';
  if (!name) {
    showToast('Por favor, informe um nome para o projeto.', 'warning');
    if (inputProjectName) inputProjectName.focus();
    return;
  }

  const selectedModels = state.models.filter(m => state.selectedModelIds.has(m.id));
  if (selectedModels.length < 2) {
    showToast('É necessário pelo menos 2 arquivos selecionados.', 'warning');
    return;
  }

  // Definir capa selecionada pelo usuário ou primeira peça que possua miniatura
  const isCustom = state.selectedCoverKey === '__custom__' && !!state.selectedCustomCoverUrl;
  const chosenCover = isCustom ? '__custom__' : (state.selectedCoverKey || (selectedModels.find(m => m.thumbnailUrl)?.name) || selectedModels[0].name);

  const newProject = {
    id: 'proj-' + Date.now(),
    name: name,
    fileKeys: selectedModels.map(m => m.name),
    coverKey: chosenCover,
    customCoverUrl: isCustom ? state.selectedCustomCoverUrl : null,
    folderName: selectedModels[0].folderName || '',
    createdAt: Date.now()
  };

  state.customProjects.push(newProject);
  saveCustomProjects();

  closeCreateProjectModal();
  clearSelection();

  updateStatsBadge();
  renderGallery();

  showToast(`Projeto "${name}" com ${selectedModels.length} mesas criado com sucesso! 📦`, 'success');
}

/**
 * Desfaz um projeto customizado e retorna os arquivos à galeria
 */
function dissolveCustomProject(projectId) {
  const projIdx = state.customProjects.findIndex(p => p.id === projectId);
  if (projIdx === -1) return;

  const proj = state.customProjects[projIdx];
  const confirmMsg = `Deseja desagrupar o projeto "${proj.name}"? Os ${proj.fileKeys.length} arquivos voltarão a ser exibidos individualmente na galeria.`;
  if (!confirm(confirmMsg)) {
    return;
  }

  state.customProjects.splice(projIdx, 1);
  saveCustomProjects();

  updateStatsBadge();
  renderGallery();

  showToast(`Projeto "${proj.name}" foi desagrupado. Os arquivos voltaram ao estado avulso.`, 'info');
}

/**
 * Cria a entidade sintética de Projeto Multi-peças / Multi-mesas
 */
function createProjectEntity(projectName, parts, groupKey, coverKey = null, customCoverUrl = null) {
  parts.sort((a, b) => compareModelNames(a.name, b.name));

  const totalSize = parts.reduce((sum, p) => sum + (p.size || 0), 0);

  // 1. Prioridade para a capa escolhida pelo usuário (coverKey)
  let primaryPart = null;
  if (coverKey && coverKey !== '__custom__') {
    primaryPart = parts.find(p => p.name === coverKey || p.id === coverKey);
  }
  // 2. Se a peça escolhida não tiver miniatura ou se nenhuma foi escolhida, procura qualquer peça que possua miniatura
  if (!primaryPart || !primaryPart.thumbnailUrl) {
    primaryPart = parts.find(p => p.thumbnailUrl) || primaryPart || parts[0];
  }

  let coverThumbnail = customCoverUrl || null;
  if (!coverThumbnail) {
    coverThumbnail = primaryPart?.thumbnailUrl || (parts.find(p => p.thumbnailUrl)?.thumbnailUrl) || '';
  }

  const hasFavorite = parts.some(p => p.isFavorite);
  const isDuplicate = parts.some(p => p.isDuplicate);

  const types = new Set(parts.map(p => p.type));
  const dominantType = types.size === 1 ? Array.from(types)[0] : 'misto';

  // Detectar prefixo comum entre as peças para que o nome de cada mesa fique limpo e legível (ex: "base_a", "head")
  let commonPrefix = '';
  if (parts.length > 1) {
    const firstClean = parts[0].name.replace(/\.[^/.]+$/, '');
    let prefixCandidate = '';
    for (let i = 0; i < firstClean.length; i++) {
      const char = firstClean[i];
      if (parts.every(p => p.name.toLowerCase().startsWith((prefixCandidate + char).toLowerCase()))) {
        prefixCandidate += char;
      } else {
        break;
      }
    }
    const sepIdx = Math.max(prefixCandidate.lastIndexOf('_'), prefixCandidate.lastIndexOf('-'), prefixCandidate.lastIndexOf(' '));
    if (sepIdx >= 2) {
      commonPrefix = prefixCandidate.substring(0, sepIdx + 1);
    } else if (prefixCandidate.length >= 4) {
      commonPrefix = prefixCandidate;
    }
  }

  const plates = [];
  if (customCoverUrl) {
    plates.push({
      id: 0,
      name: '⭐ Capa',
      fullName: 'Capa do Projeto',
      imageUrl: customCoverUrl,
      isCustomCover: true,
      isProjectPart: true,
      model: primaryPart || parts[0]
    });
  }

  parts.forEach((part, idx) => {
    let cleanLabel = part.name;
    const dotIdx = cleanLabel.lastIndexOf('.');
    if (dotIdx !== -1) cleanLabel = cleanLabel.substring(0, dotIdx);

    if (commonPrefix && cleanLabel.toLowerCase().startsWith(commonPrefix.toLowerCase()) && cleanLabel.length > commonPrefix.length) {
      cleanLabel = cleanLabel.substring(commonPrefix.length);
    }

    const normProj = projectName.replace(/[\s_-]+/g, '').toLowerCase();
    const normClean = cleanLabel.replace(/[\s_-]+/g, '').toLowerCase();
    if (normClean.startsWith(normProj) && cleanLabel.length > projectName.length) {
      cleanLabel = cleanLabel.substring(projectName.length).replace(/^[_\-\s]+/, '');
    }

    plates.push({
      id: idx + 1,
      name: cleanLabel || part.name,
      fullName: part.name,
      imageUrl: part.thumbnailUrl,
      model: part,
      isProjectPart: true
    });
  });

  const projectLastMod = parts.reduce((max, p) => Math.max(max, p.lastModified || (p.file && p.file.lastModified) || 0), 0) || Date.now();

  const projEntity = {
    id: `proj-${encodeURIComponent(groupKey).replace(/[^a-zA-Z0-9]/g, '_')}`,
    isProject: true,
    name: projectName,
    folderId: primaryPart.folderId,
    folderName: primaryPart.folderName,
    path: primaryPart.path,
    fullDiskPath: primaryPart.fullDiskPath,
    fullFolderDirectory: primaryPart.fullFolderDirectory,
    size: totalSize,
    lastModified: projectLastMod,
    type: dominantType,
    typesList: Array.from(types),
    parts: parts,
    partsCount: parts.length,
    isFavorite: hasFavorite,
    isDuplicate: isDuplicate,
    thumbnailUrl: coverThumbnail,
    customCoverUrl: customCoverUrl || null,
    plates: plates,
    primaryPart: primaryPart,
    coverKey: coverKey || (primaryPart ? primaryPart.name : ''),
    metadata: primaryPart.metadata,
    slicerData: primaryPart.slicerData
  };

  parts.forEach(p => {
    p.parentProject = projEntity;
  });

  return projEntity;
}

/**
 * Retorna o nome da pasta pai imediata e o caminho da pasta para exibição no card
 */
function getModelParentFolderInfo(model) {
  if (!model) return { name: '', full: '' };

  if (model.isProject) {
    const firstPart = (model.parts && model.parts[0]) || model.primaryPart;
    if (firstPart) {
      return getModelParentFolderInfo(firstPart);
    }
    return { name: model.folderName || 'Projeto', full: model.folderName || 'Projeto' };
  }

  const folderName = (model.folderName || '').trim().replace(/[\\/]+$/, '');
  let relPath = (model.path || model.name || '').replace(/\\/g, '/').trim();

  if (folderName) {
    const fn = folderName.replace(/\\/g, '/');
    if (relPath.toLowerCase().startsWith(fn.toLowerCase() + '/')) {
      relPath = relPath.substring(fn.length + 1);
    }
  }

  const parts = relPath.split('/').filter(Boolean);
  if (parts.length > 1) {
    const parentName = parts[parts.length - 2];
    const fullSubfolder = parts.slice(0, -1).join('/');
    const fullDisplay = folderName ? `${folderName}/${fullSubfolder}` : fullSubfolder;
    return { name: parentName, full: fullDisplay };
  }

  return { name: folderName || 'Biblioteca', full: folderName || 'Biblioteca' };
}

/**
 * Cria e configura um elemento de card para um modelo 3D ou Projeto
 */
function createModelCard(model) {
  const card = document.createElement('div');
  card.className = `model-card ${model.isProject ? 'is-project' : ''}`;
  card.dataset.id = model.id;

  const slicerBtn = getSlicerButtonConfig(model);
  const slicerKey = getSlicerFileKey(model);

  // Renderização especializada para Card de Projeto Multi-peças
  if (model.isProject) {
    const formattedSize = formatBytes(model.size);
    const folderInfo = getModelParentFolderInfo(model);

    card.innerHTML = `
      <div class="card-thumbnail-wrapper">
        <span class="badge-format project">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          PROJETO
        </span>
        <span class="card-project-parts-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          ${model.partsCount} mesas
        </span>
        <button class="btn-dissolve-card" title="Desagrupar este projeto (voltar a exibir peças separadas)" aria-label="Desagrupar projeto" type="button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
        </button>
        <button class="btn-favorite ${model.isFavorite ? 'active' : ''}" title="${model.isFavorite ? 'Remover dos favoritos' : 'Favoritar projeto'}" aria-label="Favoritar projeto" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${model.isFavorite ? '#fbbf24' : 'none'}" stroke="${model.isFavorite ? '#fbbf24' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>
        ${model.thumbnailUrl 
          ? `<img class="card-thumbnail" src="${model.thumbnailUrl}" alt="${escapeHtml(model.name)}" loading="lazy">` 
          : `
            <div class="thumb-loader">
              <div class="spinner"></div>
              <span>Carregando projeto...</span>
            </div>
          `
        }
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title" title="${escapeHtml(model.name)} (${model.partsCount} arquivos)" data-fullname="${escapeHtml(model.name)}">
            <span class="card-title-base card-title-project">${escapeHtml(model.name)}</span>
          </div>
          <button class="btn-card-rename" title="Editar nome e foto de capa do projeto" aria-label="Editar projeto" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
        </div>
        <div class="card-meta">
          <span>${formattedSize} total</span>
          <span class="card-dimensions" style="color: #c084fc; font-weight: 600;">${model.partsCount} arquivos 3D</span>
        </div>
        <div class="card-footer-actions">
          <div class="card-folder-info" title="Pasta: ${escapeHtml(folderInfo.full)}">
            <span class="card-folder-icon">📁</span>
            <span class="card-folder-name">${escapeHtml(folderInfo.name)}</span>
          </div>
          ${slicerSplitHtml(slicerBtn, '', slicerKey)}
        </div>
      </div>
    `;

    setupModelDraggable(card, () => model);

    const btnFavorite = card.querySelector('.btn-favorite');
    if (btnFavorite) {
      btnFavorite.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(model);
      });
    }

    const btnSlicer = card.querySelector('.btn-open-slicer');
    if (btnSlicer) {
      setupModelDraggable(btnSlicer, () => model.primaryPart || model.parts[0]);
      btnSlicer.addEventListener('click', (e) => {
        e.stopPropagation();
        openModelInSlicer(model.primaryPart || model.parts[0], btnSlicer);
      });
      wireSlicerCaret(card.querySelector('.btn-slicer-caret'), () => model.primaryPart || model.parts[0], btnSlicer);
    }

    const btnDissolve = card.querySelector('.btn-dissolve-card');
    if (btnDissolve) {
      btnDissolve.addEventListener('click', (e) => {
        e.stopPropagation();
        dissolveCustomProject(model.customProjectId || model.id);
      });
    }

    const btnEditProject = card.querySelector('.btn-card-rename');
    if (btnEditProject) {
      btnEditProject.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditCardModal(model);
      });
    }

    const projTitleEl = card.querySelector('.card-title');
    if (projTitleEl) {
      projTitleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openEditCardModal(model);
      });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-favorite') || e.target.closest('.btn-open-slicer') || e.target.closest('.btn-slicer-caret') || e.target.closest('.btn-dissolve-card') || e.target.closest('.btn-card-rename')) return;
      openViewerModal(model);
    });

    return card;
  }

  const formattedSize = formatBytes(model.size);
  const badgeClass = model.type === 'stl' ? 'stl format-stl' : '3mf format-3mf';
  const isSliced = model.slicerData && model.slicerData.isSliced;
  const isSelected = state.selectedModelIds.has(model.id);
  const folderInfo = getModelParentFolderInfo(model);

  if (isSelected) {
    card.classList.add('is-selected');
  }

  const dotIdx = model.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? model.name.substring(dotIdx) : `.${model.type}`;
  const baseName = dotIdx !== -1 ? model.name.substring(0, dotIdx) : model.name;
  const showKeepOnly = model.isDuplicate && state.activeSection === 'duplicates' && isTrashSupported();

  card.innerHTML = `
    <div class="card-thumbnail-wrapper">
      <div class="card-select-checkbox ${isSelected ? 'checked' : ''}" title="Selecionar arquivo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <span class="badge-format ${badgeClass}">.${model.type.toUpperCase()}</span>
      ${isSliced ? `<span class="badge-sliced-card">Fatiado</span>` : ''}
      ${model.isDuplicate ? `
        <span class="badge-duplicate" title="Arquivo idêntico encontrado em: ${escapeHtml(model.duplicateOrigins)}">
          ⚠️ Duplicado
        </span>
      ` : ''}
      <button class="btn-favorite ${model.isFavorite ? 'active' : ''}" title="${model.isFavorite ? 'Remover dos favoritos' : 'Favoritar modelo'}" aria-label="Favoritar modelo" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${model.isFavorite ? '#fbbf24' : 'none'}" stroke="${model.isFavorite ? '#fbbf24' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
      ${model.thumbnailUrl 
        ? `<img class="card-thumbnail" src="${model.thumbnailUrl}" alt="${escapeHtml(model.name)}" loading="lazy">` 
        : `
          <div class="thumb-loader">
            <div class="spinner"></div>
            <span>Gerando miniatura...</span>
          </div>
        `
      }
    </div>
    <div class="card-body">
      <div class="card-title-row">
        <div class="card-title" title="${escapeHtml(model.name)}" data-fullname="${escapeHtml(model.name)}">
          <span class="card-title-base">${escapeHtml(baseName)}</span><span class="card-title-ext">${escapeHtml(ext)}</span>
        </div>
        <button class="btn-card-rename" title="Editar nome e foto de capa" aria-label="Editar nome e foto de capa" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>
        <button class="btn-card-trash trash-only" title="Mover para a Lixeira" aria-label="Mover para a Lixeira" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          </svg>
        </button>
      </div>
      ${isSliced ? `
        <div class="card-slicer-info">
          ${model.slicerData.printTimeFormatted ? `<span>⏱️ ${model.slicerData.printTimeFormatted}</span>` : ''}
          ${model.slicerData.filamentGrams ? `<span>🧵 ${model.slicerData.filamentGrams}g ${model.slicerData.filamentType || ''}</span>` : ''}
        </div>
      ` : ''}
      <div class="card-meta">
        <span>${formattedSize}</span>
        ${model.metadata?.dimensions ? `
          <span class="card-dimensions">${Math.round(model.metadata.dimensions.x)}×${Math.round(model.metadata.dimensions.y)}×${Math.round(model.metadata.dimensions.z)} mm</span>
        ` : ''}
      </div>
      ${model.isDuplicate ? `
        <div class="card-duplicate-info ${showKeepOnly ? 'has-keep' : ''}" title="Cópia de: ${escapeHtml(model.duplicateOrigins)}">
          <span class="card-duplicate-icon">⚠️</span>
          <span class="card-duplicate-text">Cópia de: <strong>${escapeHtml(model.duplicateOrigins)}</strong></span>
          ${showKeepOnly ? `<button class="btn-keep-only" type="button" title="Manter este arquivo e mover as outras cópias para a Lixeira">Manter só este</button>` : ''}
        </div>
      ` : ''}
      <div class="card-footer-actions">
        <div class="card-folder-info" title="Pasta: ${escapeHtml(folderInfo.full)}">
          <span class="card-folder-icon">📁</span>
          <span class="card-folder-name">${escapeHtml(folderInfo.name)}</span>
        </div>
        ${slicerSplitHtml(slicerBtn, '', slicerKey)}
      </div>
    </div>
  `;

  setupModelDraggable(card, () => model);

  // Evento de Abrir no Fatiador / Arrastar
  const btnOpenSlicer = card.querySelector('.btn-open-slicer');
  if (btnOpenSlicer) {
    setupModelDraggable(btnOpenSlicer, () => model);
    btnOpenSlicer.addEventListener('click', (e) => {
      e.stopPropagation();
      openModelInSlicer(model, btnOpenSlicer);
    });
    wireSlicerCaret(card.querySelector('.btn-slicer-caret'), () => model, btnOpenSlicer);
  }

  // Evento de Favoritar
  const btnFav = card.querySelector('.btn-favorite');
  if (btnFav) {
    btnFav.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(model);
    });
  }

  // Duplicados: manter este arquivo e mandar as outras cópias para a Lixeira
  const btnKeepOnly = card.querySelector('.btn-keep-only');
  if (btnKeepOnly) {
    btnKeepOnly.addEventListener('click', (e) => {
      e.stopPropagation();
      keepOnlyThisCopy(model);
    });
  }

  // Eventos de Editar Card (Nome + Foto de Capa) e Lixeira
  const titleRow = card.querySelector('.card-title-row');
  if (titleRow) {
    const btnRename = titleRow.querySelector('.btn-card-rename');
    const titleEl = titleRow.querySelector('.card-title');
    const btnTrash = titleRow.querySelector('.btn-card-trash');

    if (btnRename) {
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditCardModal(model);
      });
    }

    if (btnTrash) {
      btnTrash.addEventListener('click', (e) => {
        e.stopPropagation();
        trashModels([model]);
      });
    }

    if (titleEl) {
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openEditCardModal(model);
      });
    }
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-rename-box') || e.target.closest('.btn-card-rename') || e.target.closest('.btn-favorite') || e.target.closest('.btn-open-slicer') || e.target.closest('.btn-keep-only') || e.target.closest('.btn-card-trash')) {
      return;
    }
    if (e.target.closest('.card-select-checkbox') || state.isSelectionMode) {
      toggleModelSelection(model.id);
      return;
    }
    openViewerModal(model);
  });

  return card;
}

/**
 * Altera o limite de cards por página e salva preferência
 */
function setPageSize(newSize) {
  state.pageSize = newSize;
  state.currentPage = 1;
  try {
    localStorage.setItem('antigravity_page_size', String(newSize));
  } catch (e) {}
  updatePageSizeButtonsUI();
  renderGallery();
}

/**
 * Navega para uma página específica
 */
function goToPage(page) {
  state.currentPage = page;
  renderGallery();

  const target = (allSectionHeader && allSectionHeader.style.display !== 'none')
    ? allSectionHeader
    : modelsGrid;
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Atualiza o estado ativo de todos os botões de tamanho de página
 */
function updatePageSizeButtonsUI() {
  document.querySelectorAll('.page-size-btn').forEach(btn => {
    const s = parseInt(btn.dataset.size, 10);
    if (s === state.pageSize) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Calcula lista de números de páginas com janelamento inteligente (1, 2 ... 7)
 */
function getPaginationPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  pages.push(1);

  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);

  if (current <= 3) {
    end = 4;
  }
  if (current >= total - 2) {
    start = total - 3;
  }

  if (start > 2) {
    pages.push('...');
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (end < total - 1) {
    pages.push('...');
  }

  pages.push(total);
  return pages;
}

/**
 * Atualiza os controles visuais da barra de paginação
 */
function updatePaginationUI(total, totalPages, startIdx, endIdx) {
  updatePageSizeButtonsUI();

  if (topPageSizeWrap) {
    topPageSizeWrap.style.display = total > 0 ? 'flex' : 'none';
  }
  if (sortControlWrap) {
    sortControlWrap.style.display = total > 0 ? 'flex' : 'none';
  }

  if (!paginationBar) return;

  if (total === 0) {
    paginationBar.style.display = 'none';
    return;
  }

  paginationBar.style.display = 'flex';

  if (paginationRange) {
    paginationRange.textContent = total > 0 ? `${startIdx + 1}–${endIdx}` : '0–0';
  }
  if (paginationTotal) {
    paginationTotal.textContent = total;
  }

  if (btnPagePrev) {
    btnPagePrev.disabled = state.currentPage <= 1;
  }
  if (btnPageNext) {
    btnPageNext.disabled = state.currentPage >= totalPages;
  }

  if (paginationNumbers) {
    paginationNumbers.innerHTML = '';
    const pages = getPaginationPageNumbers(state.currentPage, totalPages);
    pages.forEach(p => {
      const btn = document.createElement('button');
      if (p === '...') {
        btn.className = 'page-num-btn ellipsis';
        btn.textContent = '…';
        btn.disabled = true;
      } else {
        btn.className = `page-num-btn ${p === state.currentPage ? 'active' : ''}`;
        btn.textContent = p;
        btn.dataset.page = p;
        btn.title = `Página ${p}`;
        btn.setAttribute('aria-label', `Ir para página ${p}`);
      }
      paginationNumbers.appendChild(btn);
    });
  }
}

/**
 * Renderiza a galeria com paginação (50, 100, 150), filtros por formato
 * e carregamento estritamente sob demanda para cards em tela
 */
function renderGallery() {
  if (state.activeSection === 'trending') {
    if (trendingState.data) {
      renderTrendingSection(trendingState.data);
    }
    return;
  }

  const allItems = applyCustomProjects(state.models);

  const filteredUnsorted = allItems
    .filter(item => {
      // 1. Seção da Barra Lateral (Todos, Projetos, Favoritos, Duplicados)
      if (state.activeSection === 'projects' && !item.isProject) {
        return false;
      }
      if (state.activeSection === 'favorites' && !item.isFavorite) {
        return false;
      }
      if (state.activeSection === 'duplicates' && !item.isDuplicate) {
        return false;
      }

      // 1.5 Filtro de Pasta Conectada / Subpasta
      if (state.activeFolderId) {
        const matchesFolder = item.isProject
          ? item.parts && item.parts.some(p => isModelInFolderFilter(p, state.activeFolderId, state.activeSubfolderPath))
          : isModelInFolderFilter(item, state.activeFolderId, state.activeSubfolderPath);
        if (!matchesFolder) return false;
      }

      // 2. Filtro de Formatos (.STL / .3MF)
      if (state.activeFilter !== 'all') {
        if (item.isProject) {
          if (!item.typesList.includes(state.activeFilter)) return false;
        } else if (item.type !== state.activeFilter) {
          return false;
        }
      }

      // 3. Busca por Nome
      if (state.searchQuery) {
        if (item.isProject) {
          const matchProject = item.name.toLowerCase().includes(state.searchQuery);
          const matchPart = item.parts && item.parts.some(p => p.name.toLowerCase().includes(state.searchQuery));
          if (!matchProject && !matchPart) return false;
        } else {
          if (!item.name.toLowerCase().includes(state.searchQuery)) {
            return false;
          }
        }
      }

      return true;
    });

  let filtered = sortModels(filteredUnsorted, state.sortOrder);
  if (state.activeSection === 'duplicates') {
    // Cópias idênticas lado a lado, na ordem em que o primeiro arquivo de cada grupo aparece
    const groupOrder = new Map();
    filtered.forEach((item, i) => {
      const key = item.fingerprint || item.id;
      if (!groupOrder.has(key)) groupOrder.set(key, i);
    });
    filtered = filtered
      .map((item, i) => ({ item, i, g: groupOrder.get(item.fingerprint || item.id) }))
      .sort((a, b) => a.g - b.g || a.i - b.i)
      .map(x => x.item);
  }
  state.currentDisplayItems = filtered;

  favoritesGrid.innerHTML = '';
  modelsGrid.innerHTML = '';
  setupCardObserver();

  state.filteredModelsCount = filtered.length;

  if (filtered.length === 0) {
    favoritesSection.style.display = 'none';
    allSectionHeader.style.display = 'none';
    if (topPageSizeWrap) topPageSizeWrap.style.display = 'none';
    if (sortControlWrap) sortControlWrap.style.display = 'none';
    if (paginationBar) paginationBar.style.display = 'none';

    let emptyMessage = 'Nenhum arquivo corresponde aos filtros aplicados.';
    if (state.activeFolderId) {
      const activeFolder = state.folders.find(f => f.id === state.activeFolderId);
      const folderDisplayName = state.activeSubfolderPath
        ? `${activeFolder ? activeFolder.name + '/' : ''}${state.activeSubfolderPath}`
        : (activeFolder ? activeFolder.name : 'pasta selecionada');
      emptyMessage = `Nenhum modelo encontrado na pasta "${escapeHtml(folderDisplayName)}".`;
    } else if (state.activeSection === 'projects') {
      emptyMessage = 'Nenhum projeto criado ainda. Selecione arquivos múltiplos na galeria e clique em "Criar Projeto" para agrupá-los!';
    } else if (state.activeSection === 'favorites') {
      emptyMessage = 'Nenhum modelo favoritado ainda. Clique na estrela ⭐ de qualquer modelo para favoritá-lo!';
    } else if (state.activeSection === 'duplicates') {
      emptyMessage = 'Nenhum arquivo duplicado encontrado na sua biblioteca! 🎉';
    }

    modelsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; color: var(--text-muted); font-size: 0.95rem;">
        ${emptyMessage}
      </div>
    `;
    return;
  }

  // Se estiver na seção "all" e houver favoritos sem busca ativa, exibir faixa de favoritos no topo
  const favorites = filtered.filter(m => m.isFavorite);
  if (state.activeSection === 'all' && favorites.length > 0 && !state.searchQuery && state.activeFilter === 'all' && !state.activeFolderId) {
    favoritesSection.style.display = 'block';
    favoritesCountBadge.textContent = favorites.length;
    favorites.forEach(model => {
      const card = createModelCard(model);
      favoritesGrid.appendChild(card);
      if (!model.thumbnailUrl) {
        if (cardObserver) cardObserver.observe(card);
        else loadModelOnDemand(model);
      }
    });

    allSectionHeader.style.display = 'flex';
    allCountBadge.textContent = filtered.length;
  } else {
    favoritesSection.style.display = 'none';
    allSectionHeader.style.display = 'none';
  }

  // Paginação da seção principal
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }
  if (state.currentPage < 1) {
    state.currentPage = 1;
  }

  const startIdx = (state.currentPage - 1) * state.pageSize;
  const endIdx = Math.min(startIdx + state.pageSize, filtered.length);
  const pageModels = filtered.slice(startIdx, endIdx);

  // Mapear IDs dos modelos visíveis na página ativa
  state.currentPageModelIds = new Set(pageModels.map(m => m.id));

  // Renderizar somente os cards da fatia paginada no DOM
  pageModels.forEach(model => {
    const card = createModelCard(model);
    modelsGrid.appendChild(card);
    if (!model.thumbnailUrl) {
      if (cardObserver) cardObserver.observe(card);
      else loadModelOnDemand(model);
    }
  });

  // Atualizar barra de navegação de páginas
  updatePaginationUI(filtered.length, totalPages, startIdx, endIdx);

  // Atualizar barra de seleção e status do botão Selecionar/Desselecionar
  updateSelectionBarUI();
}

// ==========================================
// Carregamento Sob Demanda (On-Demand / Lazy Loading)
// ==========================================
let cardObserver = null;
let activeThumbJobs = 0;
const thumbQueue = [];

/**
 * Cria ou reseta o IntersectionObserver que dispara o carregamento
 * somente quando o card entra ou se aproxima do campo de visão da tela
 */
function setupCardObserver() {
  if (cardObserver) {
    cardObserver.disconnect();
  }

  if (!('IntersectionObserver' in window)) {
    return null;
  }

  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const card = entry.target;
        cardObserver.unobserve(card);
        const modelId = card.dataset.id;
        let model = null;
        if (state.currentDisplayItems) {
          model = state.currentDisplayItems.find(m => m.id === modelId);
        }
        if (!model) {
          model = state.models.find(m => m.id === modelId);
        }
        if (model && !model.thumbnailUrl && !model.loadingThumbnail) {
          loadModelOnDemand(model);
        }
      }
    });
  }, {
    root: null, // viewport da janela
    rootMargin: '200px 0px', // Inicia carregamento 200px antes de entrar na tela para suavidade
    threshold: 0.01
  });

  return cardObserver;
}

/**
 * Carrega a miniatura e metadados de um modelo estritamente sob demanda,
 * verificando primeiramente se já existem persistidos no cache do IndexedDB.
 */
async function loadModelOnDemand(model) {
  if (model.thumbnailUrl) {
    updateCardThumbnail(model);
    return model;
  }

  if (model.loadingThumbnail) {
    return model;
  }

  // Se for uma entidade de projeto consolidado, resolve a miniatura através de sua peça principal ou primeira disponível com capa
  if (model.isProject) {
    const targetPart = (model.primaryPart && model.primaryPart.thumbnailUrl)
      ? model.primaryPart
      : (model.parts ? (model.parts.find(p => p.thumbnailUrl) || model.primaryPart || model.parts[0]) : null);
    if (!targetPart) return model;

    if (targetPart.thumbnailUrl) {
      model.thumbnailUrl = targetPart.thumbnailUrl;
      model.metadata = targetPart.metadata;
      model.slicerData = targetPart.slicerData;
      if (model.plates && model.plates.length > 0 && !model.plates[0].imageUrl) {
        model.plates[0].imageUrl = targetPart.thumbnailUrl;
      }
      updateCardThumbnail(model);
      return model;
    }

    model.loadingThumbnail = true;
    return loadModelOnDemand(targetPart).then(loadedPart => {
      model.loadingThumbnail = false;
      if (loadedPart && loadedPart.thumbnailUrl) {
        model.thumbnailUrl = loadedPart.thumbnailUrl;
        model.metadata = loadedPart.metadata;
        model.slicerData = loadedPart.slicerData;
        if (model.plates && model.plates.length > 0 && !model.plates[0].imageUrl) {
          model.plates[0].imageUrl = loadedPart.thumbnailUrl;
        }
      }
      updateCardThumbnail(model);
      return model;
    });
  }

  // 1. Tentar recuperar instantaneamente do cache do IndexedDB
  const cacheKey = getModelCacheKey(model);
  try {
    const cached = await getCachedThumbnail(cacheKey);
    if (cached && cached.thumbnailUrl) {
      model.thumbnailUrl = cached.thumbnailUrl;
      model.defaultThumbnailUrl = cached.defaultThumbnailUrl || cached.thumbnailUrl;
      model.coverSource = cached.coverSource || 'auto';
      model.customCoverUrl = cached.customCoverUrl || null;
      model.metadata = cached.metadata || null;
      model.slicerData = cached.slicerData || null;
      model.plates = cached.plates || [];
      model.extras = cached.extras || null;
      updateCardThumbnail(model);
      if (needsMakerOnlineCheck(model)) {
        ensureMakerOnlineEnriched(model);
      }
      return model;
    }
  } catch (err) {
    console.warn('Erro ao consultar cache do IndexedDB:', err);
  }

  // 2. Se não estiver em cache, entra na fila de extração assíncrona
  model.loadingThumbnail = true;

  return new Promise((resolve) => {
    thumbQueue.push({ model, resolve });
    drainThumbQueue();
  });
}

/**
 * Verifica se um arquivo 3MF ainda precisa checar/enriquecer dados do MakerOnline
 * (cobre tanto modelos cacheados antes desta versão quanto modelos cujo moFileId ainda não foi resolvido).
 */
function needsMakerOnlineCheck(model) {
  if (!model || model.type !== '3mf') return false;
  if (!model.extras) return true;
  if (model.extras.moFileId && !model.extras.moResolved) return true;
  if (!model.extras.moChecked && !model.extras.designer && !model.extras.source) return true;
  return false;
}

/**
 * Enriquece em segundo plano arquivos 3MF do MakerOnline (incluindo os que já estavam no cache do IndexedDB),
 * salvando o resultado no cache e atualizando card + modal aberto automaticamente.
 */
async function ensureMakerOnlineEnriched(model) {
  if (!model || model.type !== '3mf') return false;
  if (model._moEnrichPromise) return model._moEnrichPromise;

  model._moEnrichPromise = (async () => {
    try {
      let changed = false;
      if (model.extras && model.extras.moFileId && !model.extras.moResolved) {
        if (!model.slicerData) model.slicerData = { isSliced: false };
        changed = await enrichFromMakerOnline(model.extras, model.plates || [], model.slicerData, model.name);
      } else if (!model.extras || (!model.extras.moChecked && !model.extras.designer && !model.extras.source)) {
        if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
          model.file = await model.handle.getFile();
        }
        if (model.file) {
          const buffer = await model.file.arrayBuffer();
          const res = await extract3MFThumbnail(buffer, model.name);
          if (res) {
            model.slicerData = res.slicerData || model.slicerData;
            model.plates = res.plates || model.plates || [];
            model.extras = res.extras || model.extras || null;
            changed = true;
          }
        }
      }

      if (model.thumbnailUrl && (changed || (model.extras && model.extras.moChecked))) {
        await saveCachedThumbnail(getModelCacheKey(model), {
          thumbnailUrl: model.thumbnailUrl,
          defaultThumbnailUrl: model.defaultThumbnailUrl || model.thumbnailUrl,
          coverSource: model.coverSource || 'auto',
          customCoverUrl: model.customCoverUrl || null,
          metadata: model.metadata,
          slicerData: model.slicerData,
          plates: model.plates,
          extras: model.extras || null
        });
      }

      if (changed) {
        updateCardThumbnail(model);
        if (state.activeModel && state.activeModel.id === model.id) {
          if (model.plates && model.plates.length > 0) {
            if (platesSection) platesSection.style.display = 'flex';
            renderPlatesList(model.plates);
            const same = model.plates.find(p => p.id === state.activePlateId);
            if (same) state.activePlate = same;
          }
          fillModalDetails(model);
          updateModalHeaderExtras();
          updateViewerModeSeg();
          if (state.activePlate) updateViewerPlateLabel(state.activePlate);
        }
      }
      return changed;
    } catch (e) {
      console.warn('Falha ao enriquecer metadados do MakerOnline:', e);
      return false;
    } finally {
      model._moEnrichPromise = null;
    }
  })();

  return model._moEnrichPromise;
}

/**
 * Processador da fila sob demanda com controle de concorrência (máximo 2 simultâneos)
 */
async function drainThumbQueue() {
  const MAX_CONCURRENT_THUMBS = 2;

  while (activeThumbJobs < MAX_CONCURRENT_THUMBS && thumbQueue.length > 0) {
    // Priorizar itens da página visível no momento
    if (state.currentPageModelIds && state.currentPageModelIds.size > 0) {
      thumbQueue.sort((a, b) => {
        const aVis = state.currentPageModelIds.has(a.model.id) ? 1 : 0;
        const bVis = state.currentPageModelIds.has(b.model.id) ? 1 : 0;
        return bVis - aVis;
      });
    }

    const job = thumbQueue.shift();
    if (!job) break;

    if (job.model.thumbnailUrl) {
      job.model.loadingThumbnail = false;
      updateCardThumbnail(job.model);
      job.resolve(job.model);
      continue;
    }

    activeThumbJobs++;

    (async () => {
      try {
        await extractModelThumbnailAndMeta(job.model);
      } catch (err) {
        console.warn(`Erro ao carregar miniatura sob demanda para ${job.model.name}:`, err);
        job.model.thumbnailUrl = generatePlaceholderThumb(job.model.name, job.model.type);
      } finally {
        job.model.loadingThumbnail = false;
        activeThumbJobs--;
        updateCardThumbnail(job.model);
        job.resolve(job.model);
        drainThumbQueue();
      }
    })();
  }
}

/**
 * Extrai o buffer do arquivo e gera a miniatura Three.js/3MF e metadados,
 * persistindo o resultado no cache do IndexedDB para as próximas sessões.
 */
async function extractModelThumbnailAndMeta(model, forceExtractPlates = false) {
  if (model.thumbnailUrl && !forceExtractPlates) return;

  const cacheKey = getModelCacheKey(model);

  // Checagem rápida antes de processar buffer pesado
  try {
    const cached = await getCachedThumbnail(cacheKey);
    if (cached && cached.thumbnailUrl) {
      if (!model.coverSource && cached.coverSource) model.coverSource = cached.coverSource;
      if (!model.customCoverUrl && cached.customCoverUrl) model.customCoverUrl = cached.customCoverUrl;
      if (!model.defaultThumbnailUrl && cached.defaultThumbnailUrl) model.defaultThumbnailUrl = cached.defaultThumbnailUrl;
      if (!forceExtractPlates) {
        model.thumbnailUrl = cached.thumbnailUrl;
        model.defaultThumbnailUrl = cached.defaultThumbnailUrl || cached.thumbnailUrl;
        model.coverSource = cached.coverSource || 'auto';
        model.customCoverUrl = cached.customCoverUrl || null;
        model.metadata = cached.metadata || null;
        model.slicerData = cached.slicerData || null;
        model.plates = cached.plates || [];
        model.extras = cached.extras || null;
        if (needsMakerOnlineCheck(model)) {
          ensureMakerOnlineEnriched(model);
        }
        return;
      }
    }
  } catch (_) {}

  if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
    model.file = await model.handle.getFile();
  }
  if (!model.file) {
    throw new Error('Arquivo não disponível');
  }

  const buffer = await model.file.arrayBuffer();
  const hasUserChosenCover = model.coverSource && model.coverSource !== 'auto' && model.thumbnailUrl;

  if (model.type === 'stl') {
    const res = await generateSTLThumbnail(buffer);
    model.defaultThumbnailUrl = res.thumbnailUrl || model.defaultThumbnailUrl || model.thumbnailUrl;
    if (!hasUserChosenCover) {
      model.thumbnailUrl = res.thumbnailUrl;
    }
    model.metadata = res.metadata;
  } else if (model.type === '3mf') {
    const res = await extract3MFThumbnail(buffer, model.name);
    model.defaultThumbnailUrl = res.thumbnailUrl || model.defaultThumbnailUrl || model.thumbnailUrl;
    if (!hasUserChosenCover) {
      model.thumbnailUrl = res.thumbnailUrl || model.thumbnailUrl;
    }
    model.metadata = res.metadata;
    model.slicerData = res.slicerData;
    model.plates = res.plates || [];
    model.extras = res.extras || null;
  }

  // Salvar no cache persistente do IndexedDB
  if (model.thumbnailUrl) {
    saveCachedThumbnail(cacheKey, {
      thumbnailUrl: model.thumbnailUrl,
      defaultThumbnailUrl: model.defaultThumbnailUrl || model.thumbnailUrl,
      coverSource: model.coverSource || 'auto',
      customCoverUrl: model.customCoverUrl || null,
      metadata: model.metadata,
      slicerData: model.slicerData,
      plates: model.plates,
      extras: model.extras || null
    });
  }
}

/**
 * Atualiza todas as instâncias do card com a miniatura gerada sem recriar todo o DOM
 */
function updateCardThumbnail(model) {
  const cards = document.querySelectorAll(`.model-card[data-id="${model.id}"]`);
  if (!cards || cards.length === 0) {
    if (model.parentProject) {
      if (!model.parentProject.thumbnailUrl && model.thumbnailUrl) {
        model.parentProject.thumbnailUrl = model.thumbnailUrl;
        if (model.parentProject.plates && model.parentProject.plates.length > 0) {
          const matchingPlate = model.parentProject.plates.find(p => p.model && p.model.id === model.id);
          if (matchingPlate) matchingPlate.imageUrl = model.thumbnailUrl;
        }
      }
      updateCardThumbnail(model.parentProject);
    }
    return;
  }

  cards.forEach(card => {
    const wrapper = card.querySelector('.card-thumbnail-wrapper');
    if (!wrapper) return;

    const existingThumb = wrapper.querySelector('.card-thumbnail');
    if (existingThumb) {
      existingThumb.src = model.thumbnailUrl;
    } else {
      const loader = wrapper.querySelector('.thumb-loader');
      if (loader) loader.remove();

      const img = document.createElement('img');
      img.className = 'card-thumbnail';
      img.src = model.thumbnailUrl;
      img.alt = model.name;
      img.loading = 'lazy';
      wrapper.appendChild(img);
    }

    // Atualizar dados de fatiamento se existirem
    if (model.slicerData && model.slicerData.isSliced) {
      if (!wrapper.querySelector('.badge-sliced-card')) {
        const slicedBadge = document.createElement('span');
        slicedBadge.className = 'badge-sliced-card';
        slicedBadge.textContent = 'Fatiado';
        wrapper.appendChild(slicedBadge);
      }
      const cardBody = card.querySelector('.card-body');
      if (cardBody) {
        let slicerDiv = cardBody.querySelector('.card-slicer-info');
        const slicerHtml = `
          ${model.slicerData.printTimeFormatted ? `<span>⏱️ ${model.slicerData.printTimeFormatted}</span>` : ''}
          ${model.slicerData.filamentGrams ? `<span>🧵 ${model.slicerData.filamentGrams}g ${model.slicerData.filamentType || ''}</span>` : ''}
        `;
        if (!slicerDiv) {
          slicerDiv = document.createElement('div');
          slicerDiv.className = 'card-slicer-info';
          slicerDiv.innerHTML = slicerHtml;
          const meta = cardBody.querySelector('.card-meta');
          if (meta) {
            cardBody.insertBefore(slicerDiv, meta);
          } else {
            cardBody.appendChild(slicerDiv);
          }
        } else {
          slicerDiv.innerHTML = slicerHtml;
        }
      }
    }

    // Atualizar dimensões se calculadas
    if (model.metadata?.dimensions) {
      const metaDiv = card.querySelector('.card-meta');
      if (metaDiv && !card.querySelector('.card-dimensions')) {
        const span = document.createElement('span');
        span.className = 'card-dimensions';
        span.textContent = `${Math.round(model.metadata.dimensions.x)}×${Math.round(model.metadata.dimensions.y)}×${Math.round(model.metadata.dimensions.z)} mm`;
        metaDiv.appendChild(span);
      }
    }
  });

  // Se este modelo pertence a um projeto pai, propagar miniatura para o card do projeto pai também
  if (model.parentProject) {
    if (!model.parentProject.thumbnailUrl && model.thumbnailUrl) {
      model.parentProject.thumbnailUrl = model.thumbnailUrl;
      if (model.parentProject.plates && model.parentProject.plates.length > 0) {
        const matchingPlate = model.parentProject.plates.find(p => p.model && p.model.id === model.id);
        if (matchingPlate) matchingPlate.imageUrl = model.thumbnailUrl;
      }
      updateCardThumbnail(model.parentProject);
    }
  }
}

function generatePlaceholderThumb(name, type) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(type.toUpperCase(), 100, 100);
  ctx.font = '12px sans-serif';
  ctx.fillText('Prévia indisponível', 100, 130);
  return canvas.toDataURL();
}

/**
 * Seletor Foto/3D do visualizador: aparece quando existe foto da mesa ou miniatura
 */
function updateViewerModeSeg() {
  if (!viewerModeSeg) return;
  const hasPlates = (state.activeProject && state.activeProject.plates && state.activeProject.plates.length > 0) ||
                    (state.activeModel && state.activeModel.plates && state.activeModel.plates.length > 0);
  const hasPhoto = hasPlates || !!(state.activeModel && state.activeModel.thumbnailUrl);
  viewerModeSeg.hidden = !hasPhoto;
  if (viewerSegPhotoLabel) {
    viewerSegPhotoLabel.textContent = state.activeProject ? 'Foto' : (hasPlates ? 'Foto da mesa' : 'Miniatura');
  }
  const is3d = state.currentViewerMode === '3d';
  if (btnBackToPlate) btnBackToPlate.setAttribute('aria-pressed', String(!is3d));
  if (btnOpen3DView) btnOpen3DView.setAttribute('aria-pressed', String(is3d));
}

/**
 * Faixa das mesas: as setas passam uma "página" de mesas, sem barra de rolagem
 */
function updatePlatesNav() {
  const prev = document.getElementById('btnPlatesPrev');
  const next = document.getElementById('btnPlatesNext');
  if (!platesList || !prev || !next) return;
  const overflow = platesList.scrollWidth - platesList.clientWidth > 2;
  prev.hidden = !overflow;
  next.hidden = !overflow;
  prev.disabled = platesList.scrollLeft <= 2;
  next.disabled = platesList.scrollLeft >= platesList.scrollWidth - platesList.clientWidth - 2;
}

function scrollPlates(direction) {
  if (!platesList) return;
  const card = platesList.querySelector('.plate-square-card');
  const step = card ? card.getBoundingClientRect().width + 6 : 110;
  const visible = Math.max(1, Math.floor(platesList.clientWidth / step));
  platesList.scrollBy({ left: direction * step * visible, behavior: 'smooth' });
}

function revealActivePlate() {
  if (!platesList) return;
  const active = platesList.querySelector('.plate-square-card.active');
  if (!active) return;
  const left = active.offsetLeft - platesList.offsetLeft;
  const right = left + active.offsetWidth;
  if (left < platesList.scrollLeft) platesList.scrollTo({ left, behavior: 'smooth' });
  else if (right > platesList.scrollLeft + platesList.clientWidth) platesList.scrollTo({ left: right - platesList.clientWidth, behavior: 'smooth' });
}

/**
 * Rótulo no canto do visualizador com a mesa ativa (nome e tempo de impressão)
 */
function updateViewerPlateLabel(plate) {
  if (!viewerPlateLabel) return;
  if (!plate) {
    viewerPlateLabel.hidden = true;
    viewerPlateLabel.textContent = '';
    return;
  }
  const name = plate.isCustomCover ? 'Capa do projeto' : (plate.isProjectPart ? (plate.name || '') : `Mesa ${plate.id}`);
  const bits = [name];
  if (plate.objectCount) bits.push(`${plate.objectCount} ${plate.objectCount === 1 ? 'peça' : 'peças'}`);
  if (plate.printTimeFormatted) bits.push(plate.printTimeFormatted);
  viewerPlateLabel.innerHTML = `<span>${escapeHtml(bits.join(' · '))}</span>${colorDotsHtml(plate.colors, 6)}`;
  viewerPlateLabel.hidden = !name;
}

/**
 * Posição do item aberto na lista atual da galeria (respeita busca, filtros e ordenação)
 */
function getViewerNavIndex() {
  const items = state.currentDisplayItems || [];
  const current = state.modalItem;
  if (!current) return -1;
  let idx = items.indexOf(current);
  if (idx === -1 && current.id != null) idx = items.findIndex(it => it && it.id === current.id);
  return idx;
}

/**
 * Cabeçalho do visualizador: favorito, selo Fatiado e navegação anterior/próximo
 */
function updateModalHeaderExtras() {
  const item = state.modalItem;
  if (!item) return;

  if (btnModalTrash) {
    // Projetos agrupam vários arquivos: a exclusão fica para os arquivos avulsos
    btnModalTrash.style.display = item.isProject ? 'none' : '';
  }

  if (btnModalFavorite) {
    const fav = !!item.isFavorite;
    btnModalFavorite.setAttribute('aria-pressed', String(fav));
    btnModalFavorite.title = fav ? 'Remover dos favoritos' : 'Favoritar';
  }

  if (modalSlicedChip) {
    const ref = item.isProject ? (item.primaryPart || (item.parts && item.parts[0])) : item;
    modalSlicedChip.hidden = !(ref && ref.slicerData && ref.slicerData.isSliced);
  }

  const items = state.currentDisplayItems || [];
  const idx = getViewerNavIndex();
  if (modalNavCounter) {
    modalNavCounter.textContent = idx >= 0 ? `${idx + 1} / ${items.length}` : '';
  }
  if (btnModalPrev) btnModalPrev.disabled = idx <= 0;
  if (btnModalNext) btnModalNext.disabled = idx === -1 || idx >= items.length - 1;
}

/**
 * Abre o modelo anterior (-1) ou o próximo (+1) da galeria sem fechar o visualizador
 */
function navigateViewerModal(delta) {
  const items = state.currentDisplayItems || [];
  const idx = getViewerNavIndex();
  if (idx === -1) return;
  const next = items[idx + delta];
  if (!next) return;
  openViewerModal(next);
}

/**
 * Bloco "Detalhes" do painel lateral. Linhas sem dado ficam ocultas.
 */
function fillModalDetails(model) {
  if (!modalSidebarInfo || !model) return;

  const setRow = (key, value) => {
    const wrap = document.getElementById(`modalInfo${key}Wrap`);
    const val = document.getElementById(`modalInfo${key}`);
    if (!wrap || !val) return;
    const has = value !== null && value !== undefined && value !== '';
    wrap.style.display = has ? '' : 'none';
    if (has) {
      val.textContent = value;
      val.title = value;
    }
  };

  const isProject = !!model.isProject;
  const ref = isProject ? (model.primaryPart || (model.parts && model.parts[0])) : model;
  const meta = !isProject && ref ? ref.metadata : null;
  const dims = meta && meta.dimensions;
  setRow('Dimensions', dims && (dims.x || dims.y || dims.z)
    ? `${Math.round(dims.x)} × ${Math.round(dims.y)} × ${Math.round(dims.z)} mm` : '');
  setRow('Triangles', meta && meta.triangleCount ? meta.triangleCount.toLocaleString('pt-BR') : '');

  // Tempo e filamento só aparecem aqui quando não há a seção Filamentos
  const slicer = ref && ref.slicerData;
  const hasFilamentSection = !!(ref && ref.extras && ref.extras.filaments && ref.extras.filaments.length);
  setRow('PrintTime', !hasFilamentSection && slicer && slicer.printTimeFormatted ? slicer.printTimeFormatted : '');
  setRow('Filament', !hasFilamentSection && slicer && slicer.filamentGrams
    ? `${slicer.filamentGrams} g${slicer.filamentType ? ' ' + slicer.filamentType : ''}` : '');

  // Tamanho e data ficam na linha do caminho, no cabeçalho
  const metaSize = document.getElementById('modalMetaSize');
  const metaDate = document.getElementById('modalMetaDate');
  if (metaSize) metaSize.textContent = model.size ? formatBytes(model.size) : '';
  const mod = model.lastModified || (model.file && model.file.lastModified) || 0;
  if (metaDate) metaDate.textContent = mod ? `modificado ${new Date(mod).toLocaleDateString('pt-BR')}` : '';

  const anyRow = Array.from(modalSidebarInfo.querySelectorAll('.modal-spec')).some(el => el.style.display !== 'none');
  modalSidebarInfo.style.display = anyRow ? 'block' : 'none';
  fillModalExtras(model);
}

/**
 * Pasta resumida (as duas últimas pastas) na linha abaixo do nome; o caminho completo fica no título
 */
function syncModalPathShort() {
  const full = (modalPathFolder && modalPathFolder.textContent) || '';
  const shortEl = document.getElementById('modalPathShort');
  const line = document.getElementById('modalPathLine');
  if (!shortEl) return;
  const parts = full.split(/[\\/]+/).filter(Boolean);
  shortEl.textContent = parts.slice(-2).join(' › ');
  if (line) line.title = full + ((modalPathName && modalPathName.textContent) || '');
}

const SOURCE_SITES = {
  makerworld: { name: 'MakerWorld', short: 'MW', bg: '#00ae42', fg: '#ffffff' },
  makeronline: { name: 'MakerOnline', short: 'MO', bg: '#2563eb', fg: '#ffffff' },
  printables: { name: 'Printables', short: 'P', bg: '#fa6831', fg: '#ffffff' },
  thingiverse: { name: 'Thingiverse', short: 'T', bg: '#248bfb', fg: '#ffffff' },
  cults3d: { name: 'Cults3D', short: 'C', bg: '#822ef5', fg: '#ffffff' },
  myminifactory: { name: 'MyMiniFactory', short: 'M', bg: '#ff5a5f', fg: '#ffffff' },
  thangs: { name: 'Thangs', short: 'Th', bg: '#2b2d42', fg: '#ffffff' },
  web: { name: 'Página do modelo', short: 'www', bg: '#1f2a37', fg: '#eef3f8' }
};

function colorDotsHtml(colors, max = 6) {
  const list = (colors || []).filter(Boolean).slice(0, max);
  if (!list.length) return '';
  return `<span class="color-stack">${list.map(c => `<i style="background:${escapeHtml(c)}"></i>`).join('')}</span>`;
}

function getModelExtras(model) {
  if (!model) return null;
  const ref = model.isProject ? (model.primaryPart || (model.parts && model.parts[0])) : model;
  return (ref && ref.extras) || null;
}

/**
 * Painel lateral: Autor e origem, Impressão, Filamentos e Anexos (dados de dentro do 3MF)
 */
function fillModalExtras(model) {
  const extras = getModelExtras(model);
  const ref = model && model.isProject ? (model.primaryPart || (model.parts && model.parts[0])) : model;
  const show = (id, visible) => { const el = document.getElementById(id); if (el) el.hidden = !visible; };

  // Autor e origem
  const hasAuthor = !!(extras && (extras.designer || extras.description || extras.license || extras.source));
  show('modalAuthorSection', hasAuthor);
  if (hasAuthor) {
    const name = extras.designer || 'Autor não informado';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    document.getElementById('modalAuthorAvatar').textContent = initials;
    document.getElementById('modalAuthorName').textContent = name;
    let sub = '';
    if (extras.created) {
      const d = new Date(extras.created);
      sub = isNaN(d) ? extras.created : `criado em ${d.toLocaleDateString('pt-BR')}`;
    }
    if (extras.title && extras.title !== name) sub = sub ? `${extras.title} · ${sub}` : extras.title;
    document.getElementById('modalAuthorSub').textContent = sub;

    // A descrição fica de fora para o painel caber sem rolagem; só a licença aparece
    document.getElementById('modalAuthorDesc').hidden = true;

    const pills = document.getElementById('modalAuthorPills');
    const pillHtml = [];
    if (extras.license) {
      const nc = /\bNC\b|non.?commercial|não.?comercial/i.test(extras.license);
      pillHtml.push(`<span class="modal-pill${nc ? ' warn' : ''}" title="${nc ? 'Uso não comercial' : 'Licença'}">${escapeHtml(extras.license)}</span>`);
    }
    if (extras.copyright && extras.copyright !== extras.designer) {
      pillHtml.push(`<span class="modal-pill" title="Direitos autorais">© ${escapeHtml(extras.copyright)}</span>`);
    }
    pills.innerHTML = pillHtml.join('');
    pills.hidden = pillHtml.length === 0;

    const src = extras.source;
    const site = src ? (SOURCE_SITES[src.site] || SOURCE_SITES.web) : null;
    show('modalSourceRow', !!site);
    if (site) {
      const logo = document.getElementById('modalSourceLogo');
      logo.textContent = site.short;
      logo.style.background = site.bg;
      logo.style.color = site.fg;
      document.getElementById('modalSourceName').textContent = site.name;
      const link = document.getElementById('modalSourceLink');
      link.hidden = !src.url;
      if (src.url) {
        link.href = src.url;
        link.title = src.search ? `Buscar "${extras.title || ''}" no ${site.name}` : src.url;
        link.firstChild.textContent = src.search ? 'Buscar no site ' : 'Abrir página ';
      }
    }
  }

  // Impressão
  const grid = document.getElementById('modalPrintGrid');
  const specs = extras ? [
    ['Impressora', extras.printer, extras.printerFull],
    ['Bico', extras.nozzle],
    ['Camada', extras.layerHeight],
    ['Preenchimento', extras.infill],
    ['Suporte', extras.support],
    ['Peças', extras.pieces ? String(extras.pieces) : null]
  ].filter(s => s[1]) : [];
  show('modalPrintSection', specs.length > 0);
  if (grid) {
    grid.innerHTML = specs.map(([label, value, full]) =>
      `<div class="modal-spec"><dt>${label}</dt><dd title="${escapeHtml(full || value)}">${escapeHtml(value)}</dd></div>`).join('');
    if (extras && extras.profile) grid.title = `Perfil: ${extras.profile}`;
  }

  // Filamentos
  const filaments = (extras && extras.filaments) || [];
  show('modalFilamentSection', filaments.length > 0);
  const list = document.getElementById('modalFilamentList');
  if (list && filaments.length) {
    const totalGrams = filaments.reduce((sum, f) => sum + (f.grams || 0), 0);
    list.classList.toggle('is-compact', filaments.length > 4);
    list.innerHTML = filaments.map(f => {
      const title = f.name || f.type || 'Filamento';
      const sub = f.name && f.type && !f.name.toUpperCase().includes(f.type.toUpperCase()) ? f.type : '';
      return `<div class="modal-fil">
        <span class="modal-fil-swatch" style="background:${escapeHtml(f.color || '#5b6878')}" title="${escapeHtml(f.color || '')}"></span>
        <div class="modal-fil-name"><b>${escapeHtml(title)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>
        <span class="modal-fil-grams">${f.grams ? `${f.grams.toLocaleString('pt-BR')} g` : ''}</span>
      </div>`;
    }).join('') + (totalGrams > 0 && filaments.length > 1
      ? `<div class="modal-fil-bar">${filaments.map(f => `<i style="width:${(100 * (f.grams || 0) / totalGrams).toFixed(1)}%;background:${escapeHtml(f.color || '#5b6878')}"></i>`).join('')}</div>`
      : '');
    const slicer = ref && ref.slicerData;
    const parts = [];
    if (slicer && slicer.printTimeFormatted) parts.push(slicer.printTimeFormatted);
    if (totalGrams > 0) parts.push(`${Math.round(totalGrams).toLocaleString('pt-BR')} g`);
    else if (slicer && slicer.filamentGrams) parts.push(`${slicer.filamentGrams} g`);
    document.getElementById('modalFilamentTotal').textContent = parts.join(' · ');
  }

  // Selo Multicor no cabeçalho
  const multi = document.getElementById('modalMultiChip');
  if (multi) {
    const colors = Array.from(new Set(filaments.map(f => f.color).filter(Boolean)));
    multi.hidden = colors.length < 2;
    if (colors.length >= 2) multi.innerHTML = `${colorDotsHtml(colors)}Multicor · ${colors.length}`;
  }

  renderModalAttachments(model, extras);
}

/**
 * Anexos do autor: fotos viram miniaturas (abrem no visualizador), PDFs e outros abrem à parte
 */
function renderModalAttachments(model, extras) {
  const section = document.getElementById('modalAttachSection');
  const gridEl = document.getElementById('modalAttachGrid');
  const items = (extras && extras.attachments) || [];
  if (!section || !gridEl) return;
  section.hidden = items.length === 0;
  gridEl.innerHTML = '';
  if (!items.length) return;
  document.getElementById('modalAttachCount').textContent = items.length;

  const source = model && model.isProject ? (model.primaryPart || (model.parts && model.parts[0])) : model;
  const maxTiles = 10;
  items.slice(0, maxTiles).forEach((item, i) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `modal-attach modal-attach-${item.kind}`;
    const isMoPrivateDoc = Boolean(item.externalPageUrl || /acop-prod-private\.s3/i.test(item.path || '') || /acop-prod-private\.s3/i.test(item.remoteUrl || ''));
    tile.title = `${item.name}${item.size ? ' · ' + formatBytes(item.size) : ''}${isMoPrivateDoc ? ' · Baixar na página do MakerOnline' : ''}`;
    if (i === maxTiles - 1 && items.length > maxTiles) {
      tile.innerHTML = `<span class="modal-attach-more">+${items.length - maxTiles + 1}</span>`;
      tile.title = `${items.length - maxTiles + 1} anexos a mais: ${items.slice(maxTiles - 1).map(x => x.name).join(', ')}`;
      tile.disabled = true;
    } else if (item.kind === 'image') {
      tile.innerHTML = '<span class="modal-attach-loading"></span>';
    } else {
      tile.innerHTML = `<span class="modal-attach-ext">${escapeHtml((item.ext || 'arq').toUpperCase().slice(0, 4))}</span><small>${item.size ? formatBytes(item.size) : ''}</small>`;
    }
    tile.dataset.index = String(i);
    tile.addEventListener('click', () => openModalAttachment(source, item));
    gridEl.appendChild(tile);
  });

  // Carrega as fotos sob demanda (só enquanto este modelo estiver aberto)
  const images = items.slice(0, maxTiles).filter(x => x.kind === 'image');
  if (images.length) {
    loadAttachmentUrls(source, images).then(urls => {
      if (state.modalItem !== model) return;
      gridEl.querySelectorAll('.modal-attach-image').forEach(tile => {
        const item = items[parseInt(tile.dataset.index, 10)];
        const url = item && (item.thumbnailUrl || urls[item.path]);
        if (url) tile.innerHTML = `<img src="${url}" alt="${escapeHtml(item.name)}" loading="lazy">`;
        else tile.innerHTML = `<span class="modal-attach-ext">IMG</span>`;
      });
    });
  }
}

/** Lê os anexos pedidos de dentro do 3MF (ou URLs remotas do MakerOnline) e devolve URLs reaproveitadas pelo modelo */
async function loadAttachmentUrls(model, items) {
  if (!model) return {};
  model._attachmentUrls = model._attachmentUrls || {};
  for (const it of items) {
    if (!it) continue;
    const remote = it.remoteUrl || (/^https?:\/\//i.test(it.path) ? it.path : null);
    if (remote && !model._attachmentUrls[it.path]) {
      model._attachmentUrls[it.path] = remote;
    }
  }
  const missing = items.filter(it => it && !model._attachmentUrls[it.path]);
  if (missing.length) {
    try {
      if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
        model.file = await model.handle.getFile();
      }
      if (!model.file) return model._attachmentUrls;
      const zip = await JSZip.loadAsync(await model.file.arrayBuffer());
      for (const it of missing) {
        const entry = zip.file(it.path);
        if (!entry) continue;
        const blob = await entry.async('blob');
        const mime = it.kind === 'pdf' ? 'application/pdf'
          : it.kind === 'image' ? `image/${it.ext === 'jpg' ? 'jpeg' : it.ext}` : 'application/octet-stream';
        model._attachmentUrls[it.path] = URL.createObjectURL(new Blob([blob], { type: mime }));
      }
    } catch (err) {
      console.warn('Erro ao ler anexos do 3MF:', err);
    }
  }
  return model._attachmentUrls;
}

async function openModalAttachment(model, item) {
  // Os PDFs do MakerOnline ficam num bucket privado (acop-prod-private) que exige login e captcha na página do modelo
  if (item && (item.externalPageUrl || /acop-prod-private\.s3/i.test(item.path || '') || /acop-prod-private\.s3/i.test(item.remoteUrl || ''))) {
    const pageUrl = item.externalPageUrl || (model && model.extras && model.extras.source && model.extras.source.url) || 'https://www.makeronline.com';
    showToast(`O MakerOnline exige login no site para baixar "${item.name}". Abrindo a página do modelo (seção Documentation)!`, 'info');
    window.open(pageUrl, '_blank');
    return;
  }

  const urls = await loadAttachmentUrls(model, [item]);
  const url = urls[item.path];
  if (!url) {
    showToast(`Não foi possível abrir "${item.name}".`, 'warning');
    return;
  }
  if (item.kind === 'image') {
    // Mostra a foto do autor no visualizador, no lugar da foto da mesa
    setViewerMode('plate');
    modalPlateImg.src = url;
    if (viewerPlateLabel) {
      viewerPlateLabel.textContent = item.name;
      viewerPlateLabel.hidden = false;
    }
    document.querySelectorAll('.plate-square-card.active').forEach(c => c.classList.remove('active'));
    return;
  }
  if (item.kind === 'pdf') {
    window.open(url, '_blank');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Alterna entre a visualização 2D da Mesa de Impressão e o Visualizador 3D
 */
function setViewerMode(mode) {
  state.currentViewerMode = mode;
  if (modalCanvas && modalCanvas.parentElement) modalCanvas.parentElement.classList.toggle('is-3d', mode === '3d');

  const hasPlates = (state.activeProject && state.activeProject.plates && state.activeProject.plates.length > 0) ||
                    (state.activeModel && state.activeModel.plates && state.activeModel.plates.length > 0);

  if (mode === 'plate') {
    // Modelo sem mesas: a "foto" é a miniatura do próprio arquivo
    if (!hasPlates && state.activeModel && state.activeModel.thumbnailUrl) {
      modalPlateImg.src = state.activeModel.thumbnailUrl;
    }
    modalPlateImg.style.display = 'block';
    modalCanvas.style.display = 'none';
    viewerControlsBar.style.display = 'none';
    updateViewerModeSeg();
  } else {
    modalPlateImg.style.display = 'none';
    modalCanvas.style.display = 'block';
    viewerControlsBar.style.display = 'flex';
    updateViewerModeSeg();

    initModalThree();
    onModalResize();

    // Carregar a malha 3D da mesa atualmente selecionada
    if (state.activeModel) {
      const isProjectPart = !!(state.activeProject || (state.activeModel && state.activeModel.parentProject));
      const plateToLoad = isProjectPart ? 1 : (state.activePlateId || 1);
      loadModelIntoModal(state.activeModel, plateToLoad);
    }
  }
}

/**
 * Renderiza os seletores de mesas de impressão em grade 3 por linha
 */
function renderPlatesList(plates) {
  platesList.innerHTML = '';
  if (!plates || plates.length === 0) {
    if (platesSection) platesSection.style.display = 'none';
    return;
  }

  if (modalSidebar) modalSidebar.style.display = 'flex';
  if (platesSection) platesSection.style.display = 'flex';
  if (platesCount) {
    const realPlates = plates.filter(p => !p.isCustomCover);
    const label = state.activeProject ? (realPlates.length === 1 ? 'arquivo' : 'arquivos') : (realPlates.length === 1 ? 'mesa' : 'mesas');
    const totalSeconds = realPlates.reduce((sum, p) => sum + (p.printTimeSeconds || 0), 0);
    platesCount.textContent = `${realPlates.length} ${label}${totalSeconds ? ' · ' + formatDurationShort(totalSeconds) : ''}`;
  }

  plates.forEach(plate => {
    const card = document.createElement('div');
    card.className = `plate-square-card ${plate.id === state.activePlateId ? 'active' : ''}`;
    card.dataset.plateId = plate.id;
    card.title = `${plate.fullName || plate.name}${plate.printTimeFormatted ? ' (' + plate.printTimeFormatted + ')' : ''}`;

    const currentImg = plate.imageUrl || (plate.model && plate.model.thumbnailUrl) || '';

    const badgeNum = plate.isCustomCover ? '⭐' : plate.id;

    card.innerHTML = `
      <span class="plate-square-num">${badgeNum}</span>
      ${currentImg 
        ? `<img class="plate-square-img" src="${currentImg}" alt="${escapeHtml(plate.name)}">`
        : `<div class="plate-square-placeholder"><span style="font-size: 1.4rem;">🖨️</span></div>`
      }
      <span class="plate-square-label" title="${escapeHtml(plate.fullName || plate.name)}"><span class="plate-square-text">${escapeHtml(plate.printTimeFormatted || plate.name)}</span>${colorDotsHtml(plate.colors, 4)}</span>
    `;

    card.addEventListener('click', () => {
      selectPlate(plate);
    });

    platesList.appendChild(card);
    requestAnimationFrame(updatePlatesNav);

    // Se for parte de projeto e ainda não possuir miniatura, carregar sob demanda
    if (plate.isProjectPart && !currentImg && plate.model) {
      loadModelOnDemand(plate.model).then(loadedPart => {
        if (loadedPart && loadedPart.thumbnailUrl) {
          plate.imageUrl = loadedPart.thumbnailUrl;
          const imgEl = card.querySelector('.plate-square-img');
          if (imgEl) {
            imgEl.src = loadedPart.thumbnailUrl;
          } else {
            const placeholder = card.querySelector('.plate-square-placeholder');
            if (placeholder) {
              const newImg = document.createElement('img');
              newImg.className = 'plate-square-img';
              newImg.src = loadedPart.thumbnailUrl;
              newImg.alt = plate.name;
              placeholder.replaceWith(newImg);
            }
          }
          if (state.activePlateId === plate.id && state.currentViewerMode === 'plate') {
            modalPlateImg.src = loadedPart.thumbnailUrl;
          }
        }
      });
    }
  });
}

/**
 * Extrai a imagem da mesa sob demanda diretamente do arquivo .3MF se não estiver em cache
 */
async function extractPlateImageOnDemand(model, plateId) {
  try {
    if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
      try {
        model.file = await model.handle.getFile();
      } catch (errH) {
        console.warn('Falha ao obter arquivo para extração da mesa:', errH);
      }
    }
    if (!model.file) return null;

    const buffer = await model.file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    let imgFile = zip.file(`Metadata/plate_${plateId}.png`) ||
                  zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]plate_${plateId}\\.png$`, 'i'))?.[0];

    if (!imgFile) {
      imgFile = zip.file(`Metadata/top_${plateId}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]top_${plateId}\\.png$`, 'i'))?.[0];
    }
    if (!imgFile) {
      imgFile = zip.file(`Metadata/pick_${plateId}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]pick_${plateId}\\.png$`, 'i'))?.[0];
    }
    if (!imgFile) {
      imgFile = zip.file(`Metadata/plate_no_light_${plateId}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]plate_no_light_${plateId}\\.png$`, 'i'))?.[0];
    }

    if (imgFile) {
      const b64 = await imgFile.async('base64');
      return `data:image/png;base64,${b64}`;
    }
  } catch (err) {
    console.warn(`Erro ao extrair imagem da mesa ${plateId} sob demanda:`, err);
  }
  return null;
}

async function selectPlate(plate) {
  state.activePlateId = plate.id;
  state.activePlate = plate;
  updateViewerPlateLabel(plate);

  // Atualizar estilo ativo nos cards quadrados
  document.querySelectorAll('.plate-square-card').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.plateId, 10) === plate.id);
  });
  revealActivePlate();

  // Se for a capa personalizada do projeto
  if (plate.isCustomCover) {
    state.activeModel = plate.model || state.activeProject?.primaryPart || state.activeProject?.parts[0];
    if (state.activeModel) updateModalFilePath(state.activeModel);

    if (modalBadge) {
      modalBadge.textContent = 'CAPA PROJETO';
      modalBadge.className = 'badge-format project format-3mf';
    }

    if (plate.imageUrl) {
      modalPlateImg.src = plate.imageUrl;
    }

    if (state.currentViewerMode === '3d') {
      if (state.activeModel) loadModelIntoModal(state.activeModel, 1);
    } else {
      setViewerMode('plate');
    }
    return;
  }

  if (plate.isProjectPart && plate.model) {
    state.activeModel = plate.model;
    updateModalFilePath(plate.model);

    if (modalBadge) {
      modalBadge.textContent = plate.model.type.toUpperCase();
      modalBadge.className = `badge-format ${plate.model.type} format-${plate.model.type}`;
    }

    const imgUrl = plate.imageUrl || plate.model.thumbnailUrl;
    if (imgUrl) {
      modalPlateImg.src = imgUrl;
    } else {
      loadModelOnDemand(plate.model).then(loadedPart => {
        if (loadedPart && loadedPart.thumbnailUrl) {
          plate.imageUrl = loadedPart.thumbnailUrl;
          if (state.activePlateId === plate.id && state.currentViewerMode === 'plate') {
            modalPlateImg.src = loadedPart.thumbnailUrl;
          }
        }
      });
    }

    if (state.currentViewerMode === '3d') {
      loadModelIntoModal(plate.model, 1);
    } else {
      setViewerMode('plate');
    }
    return;
  }

  // Modelo 3MF com múltiplas mesas (ex: Bambu / OrcaSlicer)
  let imgToUse = plate.imageUrl;

  // Se a mesa ainda não possui imagem, extrair sob demanda do arquivo 3MF
  if (!imgToUse && state.activeModel) {
    imgToUse = await extractPlateImageOnDemand(state.activeModel, plate.id);
    if (imgToUse) {
      plate.imageUrl = imgToUse;
      const cardEl = document.querySelector(`.plate-square-card[data-plate-id="${plate.id}"]`);
      if (cardEl) {
        const placeholder = cardEl.querySelector('.plate-square-placeholder');
        if (placeholder) {
          const newImg = document.createElement('img');
          newImg.className = 'plate-square-img';
          newImg.src = imgToUse;
          newImg.alt = plate.name;
          placeholder.replaceWith(newImg);
        }
      }
    }
  }

  // Fallback seguro para a miniatura geral do modelo
  if (!imgToUse && state.activeModel) {
    imgToUse = state.activeModel.thumbnailUrl || '';
  }

  if (imgToUse) {
    modalPlateImg.src = imgToUse;
  }

  // Se já estiver visualizando em 3D, carrega a malha 3D da nova mesa selecionada
  if (state.currentViewerMode === '3d') {
    loadModelIntoModal(state.activeModel, plate.id);
  } else {
    setViewerMode('plate');
  }
}

/**
 * Atualiza o tooltip do item de pasta na barra lateral para exibir o caminho completo no disco
 */
function updateFolderTooltip(folderName, diskPath) {
  if (!sidebarFoldersList) return;
  const items = sidebarFoldersList.querySelectorAll('.sidebar-folder-item');
  items.forEach(el => {
    const nameSpan = el.querySelector('.sidebar-folder-name');
    if (nameSpan && nameSpan.textContent.trim() === folderName) {
      el.title = `${folderName}\nCaminho no disco: ${diskPath}`;
    }
  });
}

/**
 * Formata e exibe o caminho completo do arquivo desde o drive C:\
 */
async function updateModalFilePath(model) {
  if (!model) return;

  const folderName = model.folderName || '';
  const relPath = (model.path || model.name).replace(/\//g, '\\');

  // 1. Se o modelo já possui o caminho completo no disco cacheado
  if (model.fullDiskPath && model.fullFolderDirectory) {
    if (modalPathFolder) modalPathFolder.textContent = model.fullFolderDirectory;
    if (modalPathName) modalPathName.textContent = model.name;
    if (modalFileName) modalFileName.title = `${model.fullDiskPath}`;
    return;
  }

  // 2. Se já conhecemos a raiz no disco dessa pasta
  if (state.folderDiskPaths[folderName]) {
    const rootDir = state.folderDiskPaths[folderName];
    let sub = relPath;
    if (sub.toLowerCase().startsWith(folderName.toLowerCase() + '\\')) {
      sub = sub.substring(folderName.length + 1);
    } else if (sub.toLowerCase() === folderName.toLowerCase()) {
      sub = '';
    }
    const combined = sub ? `${rootDir}\\${sub}` : rootDir;
    const lastSlash = combined.lastIndexOf('\\');
    const folderDir = lastSlash !== -1 ? combined.substring(0, lastSlash + 1) : `${rootDir}\\`;
    const fName = lastSlash !== -1 ? combined.substring(lastSlash + 1) : model.name;

    model.fullDiskPath = combined;
    model.fullFolderDirectory = folderDir;

    if (modalPathFolder) modalPathFolder.textContent = folderDir;
    if (modalPathName) modalPathName.textContent = fName;
    if (modalFileName) modalFileName.title = `${combined}`;
    return;
  }

  // 3. Exibição imediata estimada iniciando em C:\ enquanto consulta o backend
  let estimatedDir = '';
  if (folderName.includes('sample_models') || relPath.includes('sample_models')) {
    estimatedDir = 'C:\\Users\\eustudio\\Desktop\\Projeto\\sample_models\\';
  } else {
    estimatedDir = `C:\\Users\\eustudio\\Downloads\\${folderName}\\`;
  }
  let sub = relPath;
  if (sub.toLowerCase().startsWith(folderName.toLowerCase() + '\\')) {
    sub = sub.substring(folderName.length + 1);
  }
  const lastSlash = sub.lastIndexOf('\\');
  if (lastSlash !== -1) {
    estimatedDir += sub.substring(0, lastSlash + 1);
  }
  model.fullFolderDirectory = estimatedDir;
  model.fullDiskPath = `${estimatedDir}${model.name}`;

  if (modalPathFolder) modalPathFolder.textContent = estimatedDir;
  if (modalPathName) modalPathName.textContent = model.name;
  if (modalFileName) modalFileName.title = `${estimatedDir}${model.name}`;

  // 4. Consulta para obter o caminho 100% real do Windows (Nativo no Electron ou via servidor companion na Web)
  try {
    let data = null;
    if (window.electronAPI && typeof window.electronAPI.resolveDiskPath === 'function') {
      data = await window.electronAPI.resolveDiskPath(folderName, model.path || model.name);
    } else {
      const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const localBase = isLocalHost ? '' : 'http://127.0.0.1:3000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const res = await fetch(`${localBase}/api/resolve-path?folder=${encodeURIComponent(folderName)}&path=${encodeURIComponent(model.path || model.name)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        data = await res.json();
      }
    }

    if (data && data.fullPath) {
      model.fullDiskPath = data.fullPath;
      model.fullFolderDirectory = data.folderPath;
      if (data.rootFolder && folderName) {
        state.folderDiskPaths[folderName] = data.rootFolder;
        saveFolderDiskPaths();
        updateFolderTooltip(folderName, data.rootFolder);
      }
      // Se este mesmo modelo ainda estiver ativo no modal, atualiza na tela
      if (state.activeModel && state.activeModel.id === model.id) {
        if (modalPathFolder) modalPathFolder.textContent = data.folderPath;
        if (modalPathName) modalPathName.textContent = data.fileName || model.name;
        if (modalFileName) modalFileName.title = `${data.fullPath}`;
      }
    }
  } catch (err) {
    // Silencioso - já estamos com estimatedDir aplicado com sucesso
  }
}

/**
 * Modal Interativo (Three.js + Visualizador de Mesas)
 */
async function openViewerModal(model) {
  if (!getAuthenticatedUser()) {
    showToast('Acesso restrito: faça login com Magic Link para visualizar modelos 3D.', 'warning');
    return;
  }

  // 1. Vincular modelo ativo no estado
  state.modalItem = model;
  state.activeModel = model;
  state.activePlate = null;
  state.activePlateId = 1;
  state.isMeshLoaded = false;
  refreshSlicerLabels();
  updateViewerPlateLabel(null);
  if (modalPlateImg) modalPlateImg.removeAttribute('src');

  if (state.modalMesh) {
    if (state.modalScene) state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }

  // 2. Atualizar cabeçalho do modal imediatamente
  if (modalPathName) modalPathName.textContent = model.name || '';
  if (modalPathFolder) modalPathFolder.textContent = '';
  updateModalFilePath(model);

  if (modalDuplicateBadge) {
    if (model.isDuplicate) {
      modalDuplicateBadge.style.display = 'inline-flex';
      modalDuplicateBadge.title = `Arquivo idêntico encontrado em: ${model.duplicateOrigins}`;
      modalDuplicateBadge.textContent = `Duplicado · ${model.duplicatesCount}`;
    } else {
      modalDuplicateBadge.style.display = 'none';
    }
  }

  // 3. Caso seja um Projeto consolidado multi-peças
  if (model.isProject) {
    state.activeProject = model;
    const firstPart = model.primaryPart || (model.parts && model.parts[0]);
    if (firstPart) updateModalFilePath(firstPart);

    modalBadge.textContent = 'PROJETO';
    modalBadge.className = 'badge-format project format-3mf';

    if (modalDuplicateBadge) {
      const dupParts = model.parts ? model.parts.filter(p => p.isDuplicate) : [];
      if (dupParts.length > 0) {
        modalDuplicateBadge.style.display = 'inline-flex';
        modalDuplicateBadge.title = `Arquivos duplicados detectados neste projeto`;
        modalDuplicateBadge.textContent = `Duplicados · ${dupParts.length}`;
      } else {
        modalDuplicateBadge.style.display = 'none';
      }
    }

    if (modalSidebar) modalSidebar.style.display = 'flex';
    if (platesSection) platesSection.style.display = 'flex';
    if (platesHeading) platesHeading.textContent = 'Arquivos do projeto';
    fillModalDetails(model);
    updateModalHeaderExtras();

    renderPlatesList(model.plates);
    if (model.plates && model.plates.length > 0) {
      state.activePlateId = model.plates[0].id;
      state.currentViewerMode = 'plate';
      selectPlate(model.plates[0]);
    }
    setViewerMode('plate');
    if (viewerModal) {
      viewerModal.style.removeProperty('display');
      viewerModal.classList.add('active');
    }
    return;
  }

  state.activeProject = null;

  if (modalBadge) {
    const badgeType = (model.type || '3mf').toUpperCase();
    modalBadge.textContent = badgeType;
    modalBadge.className = `badge-format ${model.type || '3mf'} format-${model.type || '3mf'}`;
  }

  if (modalSidebar) modalSidebar.style.display = 'flex';
  if (platesHeading) platesHeading.textContent = 'Mesas de impressão';
  fillModalDetails(model);
  updateModalHeaderExtras();

  // 4. Exibição imediata: se já possui mesas ou se é modelo convencional
  const hasPlates = model.plates && model.plates.length > 0;

  if (hasPlates) {
    if (platesSection) platesSection.style.display = 'flex';
    state.activePlateId = model.plates[0].id;
    state.currentViewerMode = 'plate';
    renderPlatesList(model.plates);
    selectPlate(model.plates[0]);
    setViewerMode('plate');
  } else {
    // Modelo comum (sem mesas ou STL)
    if (platesSection) platesSection.style.display = 'none';

    // Se já tiver miniatura oficial de capa, exibe de imediato enquanto prepara 3D
    if (model.thumbnailUrl) {
      setViewerMode('plate');
    } else {
      setViewerMode('3d');
    }
  }

  // Abre o modal na tela de imediato com dados e layout 100% visíveis
  if (viewerModal) {
    viewerModal.style.removeProperty('display');
    viewerModal.classList.add('active');
  }

  // 5. Se o arquivo for 3MF e não tiver mesas ou se faltar foto em alguma mesa, extrair mesas sob demanda em background
  const needsPlateExtraction = model.type === '3mf' && (
    !model.plates || 
    model.plates.length === 0 || 
    model.plates.some(p => !p.imageUrl && !p.isCustomCover)
  );

  // 3MF lido antes desta versão ainda não tem autor/impressora/anexos: lê de novo em segundo plano
  const needsExtras = model.type === '3mf' && model.extras === undefined;

  if (!model.thumbnailUrl || needsPlateExtraction || needsExtras) {
    (async () => {
      try {
        await extractModelThumbnailAndMeta(model, needsPlateExtraction || needsExtras);
        updateCardThumbnail(model);

        // Se este mesmo modelo ainda estiver ativo no modal, atualiza os dados na tela
        if (state.activeModel && state.activeModel.id === model.id) {
          if (model.plates && model.plates.length > 0) {
            if (platesSection) platesSection.style.display = 'flex';
            renderPlatesList(model.plates);
            if (!state.activePlate) {
              selectPlate(model.plates[0]);
            } else {
              // A releitura cria novos objetos de mesa: mantém a mesma mesa selecionada
              const same = model.plates.find(p => p.id === state.activePlateId);
              if (same) state.activePlate = same;
            }
          }
          fillModalDetails(model);
          updateModalHeaderExtras();
          updateViewerModeSeg();
          if (state.activePlate) updateViewerPlateLabel(state.activePlate);
        }
      } catch (e) {
        console.warn('Erro ao extrair metadados e mesas do modelo em background:', e);
      }
    })();
  } else if (needsMakerOnlineCheck(model)) {
    ensureMakerOnlineEnriched(model);
  }
}

function initModalThree() {
  if (state.modalRenderer) return;

  const width = modalCanvas.parentElement.clientWidth || 600;
  const height = modalCanvas.parentElement.clientHeight || 500;

  state.modalRenderer = new THREE.WebGLRenderer({
    canvas: modalCanvas,
    antialias: true,
    alpha: true
  });
  state.modalRenderer.setSize(width, height);
  state.modalRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.modalRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.modalRenderer.toneMappingExposure = 1.2;

  state.modalScene = new THREE.Scene();

  // Grid e Piso de referência
  const gridHelper = new THREE.GridHelper(200, 20, 0x334155, 0x1e293b);
  gridHelper.position.y = 0;
  state.modalScene.add(gridHelper);

  // Iluminação
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  state.modalScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(100, 150, 100);
  state.modalScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x67e8f9, 0.8);
  fillLight.position.set(-100, 50, -100);
  state.modalScene.add(fillLight);

  state.modalCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);

  state.modalControls = new OrbitControls(state.modalCamera, state.modalRenderer.domElement);
  state.modalControls.enableDamping = true;
  state.modalControls.dampingFactor = 0.05;

  // Animação contínua
  function animate() {
    state.modalAnimId = requestAnimationFrame(animate);
    if (state.isAutoRotating && state.modalMesh && state.currentViewerMode === '3d') {
      state.modalMesh.rotation.y += 0.005;
    }
    if (state.currentViewerMode === '3d') {
      state.modalControls.update();
      state.modalRenderer.render(state.modalScene, state.modalCamera);
    }
  }
  animate();

  window.addEventListener('resize', onModalResize);
}

function onModalResize() {
  if (!state.modalRenderer || !viewerModal.classList.contains('active')) return;
  const container = modalCanvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w > 0 && h > 0) {
    state.modalCamera.aspect = w / h;
    state.modalCamera.updateProjectionMatrix();
    state.modalRenderer.setSize(w, h);
  }
}

async function loadModelIntoModal(model, plateId = null) {
  const loadToken = (state.modalLoadToken = (state.modalLoadToken || 0) + 1);
  const isProjectPart = !!(state.activeProject || (model && model.parentProject));
  const currentPlate = isProjectPart ? (plateId || 1) : (plateId || state.activePlateId || 1);

  // Limpar malha anterior
  if (state.modalMesh) {
    state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }

  const plateLabel = (model.plates && model.plates.length > 0) ? ` (Mesa ${currentPlate})` : '';
  viewerLoadingOverlay.style.display = 'flex';
  viewerLoadingText.textContent = `Carregando malha 3D de ${model.name}${plateLabel}...`;

  try {
    if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
      try {
        model.file = await model.handle.getFile();
      } catch (e) {
        console.warn('Handle getFile falhou:', e);
      }
    }
    if (!model.file && model.url) {
      try {
        const resp = await fetch(model.url);
        if (resp.ok) {
          const blob = await resp.blob();
          model.file = new File([blob], model.name, { type: 'application/octet-stream' });
        }
      } catch (e) {
        console.warn('Fetch model.url falhou:', e);
      }
    }
    if (!model.file) {
      throw new Error('Arquivo não disponível');
    }

    const buffer = await model.file.arrayBuffer();
    let geometry = null;
    let dimensions = { x: 0, y: 0, z: 0 };
    let volumeCm3 = 0;
    let triangleCount = 0;

    if (model.type === 'stl') {
      const parsed = parseSTL(buffer);
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
      if (parsed.normals.length === parsed.positions.length) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3));
      } else {
        geometry.computeVertexNormals();
      }
      dimensions = parsed.bounds.size;
      volumeCm3 = parsed.volumeCm3;
      triangleCount = parsed.triangleCount;
    } else if (model.type === '3mf') {
      // Cache de malhas por mesa para alternância instantânea
      if (!model._geometryCache) model._geometryCache = {};

      if (model._geometryCache[currentPlate]) {
        const cached = model._geometryCache[currentPlate];
        geometry = cached.geometry;
        dimensions = cached.dimensions;
        volumeCm3 = cached.volumeCm3;
        triangleCount = cached.triangleCount;
      } else {
        try {
          const parsed3MF = await parse3MFGeometry(buffer, currentPlate);
          geometry = parsed3MF.geometry;
          dimensions = parsed3MF.dimensions;
          volumeCm3 = parsed3MF.volumeCm3;
          triangleCount = parsed3MF.triangleCount;
          model._geometryCache[currentPlate] = parsed3MF;
        } catch (e3d) {
          console.warn('Erro ao extrair malha 3D do 3MF para a mesa:', currentPlate, e3d);
        }
      }
    }

    // Usuário já trocou de modelo/mesa enquanto esta malha carregava
    if (loadToken !== state.modalLoadToken) return;

    if (!geometry) {
      console.warn('Geometria não pôde ser gerada para este modelo');
      return;
    }

    // Centralizar e apoiar no chão da grade (Y = 0)
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    geometry.center();
    geometry.computeBoundingBox();
    const yOffset = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2;

    const material = new THREE.MeshStandardMaterial({
      color: 0x1fb6cc,
      roughness: 0.35,
      metalness: 0.15,
      wireframe: state.isWireframe
    });

    state.modalMesh = new THREE.Mesh(geometry, material);
    state.modalMesh.position.y = yOffset;
    state.modalScene.add(state.modalMesh);

    // Ajustar câmera
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 25;
    const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.5;
    state.modalCamera.near = Math.max(0.1, radius / 100);
    state.modalCamera.far = Math.max(2000, dist * 10);
    state.modalCamera.updateProjectionMatrix();

    state.modalCamera.position.set(dist * 0.8, dist * 0.7, dist * 0.9);
    state.modalControls.target.set(0, yOffset, 0);
    state.modalControls.update();

    state.isMeshLoaded = true;

  } catch (err) {
    console.error('Erro ao carregar modelo no visualizador:', err);
  } finally {
    if (loadToken === state.modalLoadToken) viewerLoadingOverlay.style.display = 'none';
  }
}

function resetModalCamera() {
  if (!state.modalMesh) return;
  const geometry = state.modalMesh.geometry;
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 25;
  const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.5;
  const yOffset = state.modalMesh.position.y;

  state.modalCamera.near = Math.max(0.1, radius / 100);
  state.modalCamera.far = Math.max(2000, dist * 10);
  state.modalCamera.updateProjectionMatrix();

  state.modalCamera.position.set(dist * 0.8, dist * 0.7, dist * 0.9);
  state.modalControls.target.set(0, yOffset, 0);
  state.modalMesh.rotation.set(0, 0, 0);
  state.modalControls.update();
}

function closeViewerModal() {
  if (viewerModal) {
    viewerModal.classList.remove('active');
    viewerModal.style.removeProperty('display');
  }
  state.activeProject = null;
  state.activePlate = null;
  state.activeModel = null;
  state.activePlateId = 1;

  if (state.modalMesh) {
    if (state.modalScene) state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }

  // Limpar a imagem com segurança sem disparar evento de erro por src vazio
  if (modalPlateImg) {
    modalPlateImg.removeAttribute('src');
    modalPlateImg.style.display = 'none';
  }
  if (modalCanvas) modalCanvas.style.display = 'none';
  if (viewerModeSeg) viewerModeSeg.hidden = true;
  updateViewerPlateLabel(null);
  state.modalItem = null;
  state.modalLoadToken = (state.modalLoadToken || 0) + 1;
  if (viewerControlsBar) viewerControlsBar.style.display = 'none';
  if (viewerLoadingOverlay) viewerLoadingOverlay.style.display = 'none';
}

// Utilitários
function formatDurationShort(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `${Math.max(1, m)} min`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// Seção "Em Alta" (Top 25 mais baixados - Ranking unificado 48h / 7 dias / 15 dias - MakerWorld & MakerOnline)
// ==========================================
const TRENDING_STORAGE_KEY = 'vault3d_trending_cache_v4';
const TRENDING_RANGE_STORAGE_KEY = 'vault3d_trending_range';
const TRENDING_LOCAL_TTL = 15 * 60 * 1000; // 15 minutos
const TRENDING_TOP_LIMIT = 25;

const TRENDING_RANGE_META = {
  '48h': {
    key: '48h',
    hours: 48,
    pillLabel: 'Top 25 · Últimas 48h',
    subLabel: 'nas últimas 48 horas',
    shortSubLabel: 'nas últimas 48h',
    fallbackRel: 'Últimas 48h'
  },
  '7d': {
    key: '7d',
    hours: 7 * 24,
    pillLabel: 'Top 25 · Últimos 7 dias',
    subLabel: 'nos últimos 7 dias',
    shortSubLabel: 'nos últimos 7 dias',
    fallbackRel: 'Últimos 7 dias'
  },
  '15d': {
    key: '15d',
    hours: 15 * 24,
    pillLabel: 'Top 25 · Últimos 15 dias',
    subLabel: 'nos últimos 15 dias',
    shortSubLabel: 'nos últimos 15 dias',
    fallbackRel: 'Últimos 15 dias'
  }
};

function getInitialTrendingRange() {
  try {
    const saved = localStorage.getItem(TRENDING_RANGE_STORAGE_KEY);
    if (saved && TRENDING_RANGE_META[saved]) return saved;
  } catch (_) {}
  return '48h';
}

const trendingState = {
  loading: false,
  range: getInitialTrendingRange(),
  data: null
};

function getCurrentTrendingRangeMeta() {
  return TRENDING_RANGE_META[trendingState.range] || TRENDING_RANGE_META['48h'];
}

function updateTrendingRangeUI() {
  const meta = getCurrentTrendingRangeMeta();

  if (trendingRangeGroup) {
    trendingRangeGroup.querySelectorAll('.trending-range-btn').forEach((btn) => {
      const isActive = btn.dataset.range === meta.key;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  document.querySelectorAll('[data-trending-window-pill]').forEach((pill) => {
    pill.textContent = meta.pillLabel;
  });

  if (state.activeSection === 'trending') {
    if (currentViewSub) {
      currentViewSub.textContent = `Top 25 modelos mais baixados ${meta.shortSubLabel}`;
    }
    if (shellSubtitle) {
      shellSubtitle.textContent = `Os 25 modelos mais baixados ${meta.subLabel} combinando MakerWorld e MakerOnline.`;
    }
  }
}

function setTrendingRange(rangeKey) {
  if (!TRENDING_RANGE_META[rangeKey]) return;
  trendingState.range = rangeKey;
  try {
    localStorage.setItem(TRENDING_RANGE_STORAGE_KEY, rangeKey);
  } catch (_) {}
  updateTrendingRangeUI();

  if (trendingState.data) {
    renderTrendingSection(trendingState.data);
  } else {
    loadAndRenderTrending(false);
  }
}

function normalizeTrendingPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pickArr = (obj, k1, k2) => {
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj[k1])) return obj[k1];
    if (Array.isArray(obj[k2])) return obj[k2];
    return [];
  };

  const baseMw = pickArr(raw, 'makerWorld', 'makerworld');
  const baseMo = pickArr(raw, 'makerOnline', 'makeronline');
  const rawRanges = (raw.ranges && typeof raw.ranges === 'object') ? raw.ranges : {};

  const ranges = {};
  ['48h', '7d', '15d'].forEach((rk) => {
    const rObj = rawRanges[rk];
    const mwList = pickArr(rObj, 'makerWorld', 'makerworld');
    const moList = pickArr(rObj, 'makerOnline', 'makeronline');
    ranges[rk] = {
      makerWorld: mwList.length > 0 ? mwList : baseMw,
      makerOnline: moList.length > 0 ? moList : (rk === '48h' ? baseMo : [])
    };
  });

  const activeRange = ranges[trendingState.range] || ranges['48h'];
  const hasAny = ['48h', '7d', '15d'].some(
    (rk) => ranges[rk].makerWorld.length > 0 || ranges[rk].makerOnline.length > 0
  );

  return {
    success: hasAny,
    ranges,
    makerWorld: activeRange.makerWorld,
    makerOnline: activeRange.makerOnline,
    updatedAt: raw.updatedAt || Date.now()
  };
}

function getListsForCurrentRange(payload) {
  if (!payload) return { makerWorld: [], makerOnline: [] };
  const rk = trendingState.range || '48h';
  const fromRange = payload.ranges && payload.ranges[rk];
  return {
    makerWorld: (fromRange && Array.isArray(fromRange.makerWorld) && fromRange.makerWorld.length > 0)
      ? fromRange.makerWorld
      : (Array.isArray(payload.makerWorld) ? payload.makerWorld : []),
    makerOnline: (fromRange && Array.isArray(fromRange.makerOnline) && fromRange.makerOnline.length > 0)
      ? fromRange.makerOnline
      : (Array.isArray(payload.makerOnline) ? payload.makerOnline : [])
  };
}

function buildUnifiedTop25(mwList, moList) {
  const combined = [];
  const seen = new Set();

  const pushUnique = (arr, defaultSite) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item) continue;
      const site = item.site || defaultSite;
      const key = `${site}:${item.id || item.url || item.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({ ...item, site });
    }
  };

  pushUnique(mwList, 'makerworld');
  pushUnique(moList, 'makeronline');

  combined.sort(
    (a, b) =>
      (Number(b.downloads) || 0) - (Number(a.downloads) || 0) ||
      (Number(b.likes) || 0) - (Number(a.likes) || 0)
  );

  return combined.slice(0, TRENDING_TOP_LIMIT).map((item, idx) => ({
    ...item,
    rank: idx + 1
  }));
}

function loadTrendingFromLocalCache() {
  try {
    const raw = localStorage.getItem(TRENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeTrendingPayload(JSON.parse(raw));
    if (!parsed || !parsed.success) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveTrendingToLocalCache(payload) {
  try {
    const norm = normalizeTrendingPayload(payload);
    if (norm && norm.success) {
      localStorage.setItem(TRENDING_STORAGE_KEY, JSON.stringify(norm));
    }
  } catch (_) {}
}

/**
 * Fallback client-side para buscar Top 5 do MakerOnline nas 3 janelas (48h, 7d, 15d)
 * caso o app esteja rodando fora do Electron ou como complemento.
 */
async function fetchMakerOnlineAllRangesClient() {
  try {
    const fetchPageBatch = (pageNumbers) =>
      Promise.all(
        pageNumbers.map((page) =>
          fetch('https://www.makeronline.com/api/search/model', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              page,
              page_size: 50,
              keyword: '',
              category_id: 0,
              print_type: 0,
              order: 'submit_at_desc'
            })
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => (j && j.data && Array.isArray(j.data.data) ? j.data.data : []))
            .catch(() => [])
        )
      );

    const wave1Pages = Array.from({ length: 35 }, (_, i) => i + 1);
    const wave2Pages = Array.from({ length: 35 }, (_, i) => i + 36);
    const wave1 = await fetchPageBatch(wave1Pages);
    const wave2 = await fetchPageBatch(wave2Pages);
    const pages = [...wave1, ...wave2];

    const seen = new Set();
    const allRecent = [];
    for (const list of pages) {
      for (const item of list) {
        if (!item || !item.mold_id || item.is_adult_nsfw) continue;
        if (seen.has(item.mold_id)) continue;
        seen.add(item.mold_id);
        allRecent.push(item);
      }
    }

    const now = Date.now();
    const parseMoTime = (str) => {
      if (!str || typeof str !== 'string') return 0;
      const iso = str.includes('T') ? str : str.replace(' ', 'T') + '+08:00';
      const t = Date.parse(iso);
      return Number.isNaN(t) ? 0 : t;
    };

    const buildTopForHours = (hours) => {
      const cutoff = now - hours * 3600 * 1000;
      let pool = allRecent.filter((m) => {
        const t = parseMoTime(m.publish_time);
        return t > 0 ? t >= cutoff : true;
      });
      if (pool.length < TRENDING_TOP_LIMIT) {
        pool = [...allRecent];
      }
      pool.sort(
        (a, b) =>
          (Number(b.download_num) || 0) - (Number(a.download_num) || 0) ||
          (Number(b.like_num) || 0) - (Number(a.like_num) || 0)
      );
      return pool.slice(0, TRENDING_TOP_LIMIT).map((m, idx) => {
        const pubMs = parseMoTime(m.publish_time);
        const slug =
          String(m.title || 'model')
            .trim()
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'model';
        return {
          rank: idx + 1,
          id: String(m.mold_id),
          site: 'makeronline',
          title: m.title || `Modelo #${m.mold_id}`,
          cover: m.mold_image || '',
          downloads: Number(m.download_num) || 0,
          likes: Number(m.like_num) || 0,
          prints: 0,
          author: m.user_display_name || m.user_name || 'MakerOnline',
          authorAvatar: m.user_avatar || '',
          publishedAt: pubMs ? new Date(pubMs).toISOString() : '',
          url: m.target_url || `https://www.makeronline.com/en/model/${slug}/${m.mold_id}.html`
        };
      });
    };

    return {
      '48h': buildTopForHours(48),
      '7d': buildTopForHours(7 * 24),
      '15d': buildTopForHours(15 * 24)
    };
  } catch (err) {
    console.warn('Erro no fallback MakerOnline:', err);
    return { '48h': [], '7d': [], '15d': [] };
  }
}

/**
 * Pré-aquece os dados da aba Em Alta silenciosamente após iniciar o app
 */
async function prefetchTrendingSilent() {
  updateTrendingRangeUI();
  if (trendingState.loading) return;
  const cached = loadTrendingFromLocalCache();
  if (cached && cached.updatedAt && (Date.now() - cached.updatedAt < TRENDING_LOCAL_TTL) &&
      cached.ranges?.['7d']?.makerOnline?.length >= 15 &&
      cached.ranges?.['48h']?.makerWorld?.length > 0) {
    trendingState.data = cached;
    return;
  }

  try {
    if (window.electronAPI && typeof window.electronAPI.fetchTrendingModels === 'function') {
      const rawRes = await window.electronAPI.fetchTrendingModels({ force: false, range: trendingState.range });
      let res = normalizeTrendingPayload(rawRes);
      if (res && (!res.ranges?.['7d']?.makerOnline || res.ranges['7d'].makerOnline.length < 15)) {
        const moByRange = await fetchMakerOnlineAllRangesClient().catch(() => null);
        if (moByRange) {
          ['48h', '7d', '15d'].forEach((rk) => {
            if (moByRange[rk]?.length) res.ranges[rk].makerOnline = moByRange[rk];
          });
        }
      }
      if (res && res.success) {
        trendingState.data = res;
        saveTrendingToLocalCache(res);
        if (state.activeSection === 'trending') {
          renderTrendingSection(res);
        }
      }
    }
  } catch (_) {}
}

/**
 * Carrega e renderiza os 25 modelos Em Alta (MakerWorld + MakerOnline unificados em 48h, 7d ou 15d)
 */
async function loadAndRenderTrending(force = false) {
  if (!trendingContainer) return;
  updateTrendingRangeUI();

  const targetGrid = trendingUnifiedGrid || trendingMakerWorldGrid;
  const cached = trendingState.data || loadTrendingFromLocalCache();
  const hasFullMoRanges = cached?.ranges?.['48h']?.makerOnline?.length >= 15 &&
    cached?.ranges?.['7d']?.makerOnline?.length >= 15 &&
    cached?.ranges?.['15d']?.makerOnline?.length >= 15;
  const isCacheFresh = cached && cached.updatedAt && (Date.now() - cached.updatedAt < TRENDING_LOCAL_TTL) &&
    cached?.ranges?.['48h']?.makerWorld?.length > 0 &&
    hasFullMoRanges;

  if (!force && isCacheFresh) {
    trendingState.data = cached;
    renderTrendingSection(cached);
    return;
  }

  const currentLists = getListsForCurrentRange(cached);
  const currentMerged = buildUnifiedTop25(currentLists.makerWorld, currentLists.makerOnline);

  // Se já temos cache anterior mas expirado, exibe imediatamente enquanto atualiza
  if (cached && !force && currentMerged.length >= 10) {
    trendingState.data = cached;
    renderTrendingSection(cached);
  } else if (targetGrid) {
    renderTrendingSkeletons(targetGrid, 'Buscando os 25 modelos em alta no MakerWorld e MakerOnline...');
  }

  if (trendingState.loading) return;
  trendingState.loading = true;

  if (btnRefreshTrending) {
    btnRefreshTrending.disabled = true;
    btnRefreshTrending.classList.add('is-refreshing');
    const span = btnRefreshTrending.querySelector('span');
    if (span) span.textContent = 'Atualizando...';
  }

  try {
    let payload = null;
    if (window.electronAPI && typeof window.electronAPI.fetchTrendingModels === 'function') {
      const rawRes = await window.electronAPI.fetchTrendingModels({ force, range: trendingState.range });
      payload = normalizeTrendingPayload(rawRes);
    }

    // Se MakerOnline vier com menos de 15 itens por faixa ou estiver no navegador, completa via cliente
    const missingMoRanges = !payload ||
      (payload.ranges?.['48h']?.makerOnline?.length || 0) < 15 ||
      (payload.ranges?.['7d']?.makerOnline?.length || 0) < 15 ||
      (payload.ranges?.['15d']?.makerOnline?.length || 0) < 15;

    if (missingMoRanges) {
      const moByRange = await fetchMakerOnlineAllRangesClient().catch(() => ({ '48h': [], '7d': [], '15d': [] }));
      if (!payload) {
        payload = normalizeTrendingPayload({
          ranges: {
            '48h': { makerWorld: cached?.ranges?.['48h']?.makerWorld || [], makerOnline: moByRange['48h'] || [] },
            '7d': { makerWorld: cached?.ranges?.['7d']?.makerWorld || [], makerOnline: moByRange['7d'] || [] },
            '15d': { makerWorld: cached?.ranges?.['15d']?.makerWorld || [], makerOnline: moByRange['15d'] || [] }
          },
          updatedAt: Date.now()
        });
      } else {
        ['48h', '7d', '15d'].forEach((rk) => {
          if (moByRange[rk] && moByRange[rk].length > 0) {
            payload.ranges[rk].makerOnline = moByRange[rk];
          }
        });
        payload.makerOnline = payload.ranges[trendingState.range]?.makerOnline || moByRange['48h'] || [];
        payload.success = true;
      }
    }

    // Preservar cache anterior de uma plataforma caso uma requisição pontual tenha falhado por rede
    if (cached && cached.ranges) {
      ['48h', '7d', '15d'].forEach((rk) => {
        if ((!payload.ranges[rk].makerWorld || payload.ranges[rk].makerWorld.length === 0) &&
            cached.ranges[rk]?.makerWorld?.length) {
          payload.ranges[rk].makerWorld = cached.ranges[rk].makerWorld;
        }
        if ((!payload.ranges[rk].makerOnline || payload.ranges[rk].makerOnline.length === 0) &&
            cached.ranges[rk]?.makerOnline?.length) {
          payload.ranges[rk].makerOnline = cached.ranges[rk].makerOnline;
        }
      });
    }

    trendingState.data = payload;
    saveTrendingToLocalCache(payload);
    renderTrendingSection(payload);

    if (force) {
      showToast('Ranking Top 25 Em Alta atualizado com sucesso! 🔥', 'success');
    }
  } catch (err) {
    console.warn('Erro ao buscar modelos Em Alta:', err);
    if (cached && cached.success) {
      renderTrendingSection(cached);
    } else if (targetGrid) {
      renderTrendingEmptyOrError(targetGrid, 'MakerWorld e MakerOnline', 'https://makerworld.com/pt/3d-models');
    }
    if (force) {
      showToast('Não foi possível atualizar alguns rankings agora.', 'warning');
    }
  } finally {
    trendingState.loading = false;
    if (btnRefreshTrending) {
      btnRefreshTrending.disabled = false;
      btnRefreshTrending.classList.remove('is-refreshing');
      const span = btnRefreshTrending.querySelector('span');
      if (span) span.textContent = 'Atualizar Em Alta';
    }
  }
}

function renderTrendingSkeletons(gridEl, message) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const skel = document.createElement('div');
    skel.className = 'trending-card is-skeleton';
    skel.innerHTML = `
      <div class="trending-card-thumb-wrap">
        <span class="trending-rank-badge rank-${i}">#${i}</span>
        <div class="thumb-loader">
          <div class="spinner"></div>
          <span>${escapeHtml(i === 1 ? message : 'Carregando...')}</span>
        </div>
      </div>
      <div class="trending-card-body">
        <div class="trending-skel-line title"></div>
        <div class="trending-skel-line author"></div>
        <div class="trending-skel-line stats"></div>
      </div>
    `;
    gridEl.appendChild(skel);
  }
}

function renderTrendingEmptyOrError(gridEl, platformName, platformUrl) {
  if (!gridEl) return;
  gridEl.innerHTML = `
    <div class="trending-empty-box">
      <p>Não foi possível carregar o Top 25 de <strong>${escapeHtml(platformName)}</strong> neste momento.</p>
      <div class="trending-empty-actions">
        <button type="button" class="btn-secondary btn-retry-trending">Tentar novamente</button>
        <a href="${escapeHtml(platformUrl)}" target="_blank" rel="noopener noreferrer" class="btn-secondary trending-ext-fallback">Abrir ${escapeHtml(platformName)} ↗</a>
      </div>
    </div>
  `;
  const btnRetry = gridEl.querySelector('.btn-retry-trending');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => loadAndRenderTrending(true));
  }
  const extLink = gridEl.querySelector('.trending-ext-fallback');
  if (extLink) {
    extLink.addEventListener('click', (e) => {
      if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
        e.preventDefault();
        window.electronAPI.openExternalUrl(platformUrl);
      }
    });
  }
}

function formatTrendingNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('pt-BR');
}

function formatTrendingRelativeTime(timestampInput) {
  const meta = getCurrentTrendingRangeMeta();
  if (!timestampInput) return meta.fallbackRel;
  const ts = typeof timestampInput === 'number'
    ? timestampInput
    : Date.parse(String(timestampInput));
  if (!ts || Number.isNaN(ts)) return meta.fallbackRel;
  const diffMs = Math.max(0, Date.now() - ts);
  const hours = Math.floor(diffMs / (3600 * 1000));
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return `há ${mins} min`;
  }
  if (hours < 48) {
    return `há ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function formatUpdatedClock(timestampMs) {
  if (!timestampMs) return '';
  try {
    const d = new Date(timestampMs);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

function createTrendingCard(item) {
  const card = document.createElement('article');
  const isMakerWorld = item.site === 'makerworld';
  const siteClass = isMakerWorld ? 'is-makerworld' : 'is-makeronline';
  const openBtnLabel = isMakerWorld ? 'Abrir no Maker World' : 'Abrir no Maker Online';
  const rank = Number(item.rank) || 1;
  const meta = getCurrentTrendingRangeMeta();
  card.className = `trending-card ${siteClass} rank-card-${rank}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.title = `${openBtnLabel}: "${item.title}"`;

  const relTime = formatTrendingRelativeTime(item.publishedAt);
  const downloadsFmt = formatTrendingNumber(item.downloads);
  const likesFmt = formatTrendingNumber(item.likes);
  const printsFmt = formatTrendingNumber(item.prints);
  const authorInitial = ((item.author || 'M').trim()[0] || 'M').toUpperCase();

  card.innerHTML = `
    <div class="trending-card-thumb-wrap">
      <span class="trending-rank-badge rank-${rank}" title="${rank}º mais baixado ${escapeHtml(meta.shortSubLabel)}">#${rank}</span>
      <span class="trending-time-badge" title="Publicado ${escapeHtml(relTime)}">${escapeHtml(relTime)}</span>
      ${item.cover
        ? `<img class="trending-card-thumb" src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="thumb-loader"><span>Sem capa</span></div>`
      }
    </div>
    <div class="trending-card-body">
      <h4 class="trending-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
      <div class="trending-card-author">
        ${item.authorAvatar
          ? `<img class="trending-author-avatar" src="${escapeHtml(item.authorAvatar)}" alt="${escapeHtml(item.author)}" loading="lazy" referrerpolicy="no-referrer">`
          : `<span class="trending-author-avatar fallback">${escapeHtml(authorInitial)}</span>`
        }
        <span class="trending-author-name" title="Autor: ${escapeHtml(item.author)}">${escapeHtml(item.author)}</span>
      </div>
      <button type="button" class="trending-open-btn ${siteClass}" title="${escapeHtml(openBtnLabel)}">
        <span>${escapeHtml(openBtnLabel)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>
      <div class="trending-card-metrics">
        <div class="trending-metric primary" title="${downloadsFmt} downloads ${escapeHtml(meta.shortSubLabel)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <strong>${downloadsFmt}</strong>
          <span class="trending-metric-unit">downloads</span>
        </div>
        <div class="trending-metrics-secondary">
          <span class="trending-metric-mini" title="${likesFmt} curtidas">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            ${likesFmt}
          </span>
          ${item.prints > 0 ? `
            <span class="trending-metric-mini" title="${printsFmt} impressões / perfis">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              ${printsFmt}
            </span>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Fallback seguro caso o avatar falhe ao carregar
  const avatarImg = card.querySelector('img.trending-author-avatar');
  if (avatarImg) {
    avatarImg.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = 'trending-author-avatar fallback';
      span.textContent = authorInitial;
      avatarImg.replaceWith(span);
    });
  }

  const openModelPage = (e) => {
    if (e) e.stopPropagation();
    if (!item.url) return;
    if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
      window.electronAPI.openExternalUrl(item.url);
    } else {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const openBtn = card.querySelector('.trending-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', openModelPage);
  }

  card.addEventListener('click', openModelPage);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModelPage();
    }
  });

  return card;
}

function renderTrendingSection(payload) {
  if (!payload) return;
  updateTrendingRangeUI();

  if (trendingUpdatedLabel && state.activeSection === 'trending') {
    const timeStr = formatUpdatedClock(payload.updatedAt);
    if (timeStr) {
      trendingUpdatedLabel.textContent = `Atualizado às ${timeStr}`;
      trendingUpdatedLabel.style.display = 'inline-flex';
    }
  }

  const { makerWorld: mwList, makerOnline: moList } = getListsForCurrentRange(payload);
  const unifiedTop25 = buildUnifiedTop25(mwList, moList);

  const query = (state.searchQuery || '').toLowerCase().trim();
  const filteredItems = !query
    ? unifiedTop25
    : unifiedTop25.filter(it =>
        (it.title && it.title.toLowerCase().includes(query)) ||
        (it.originalTitle && it.originalTitle.toLowerCase().includes(query)) ||
        (it.author && it.author.toLowerCase().includes(query))
      );

  const targetGrid = trendingUnifiedGrid || trendingMakerWorldGrid;
  if (targetGrid) {
    if (unifiedTop25.length > 0) {
      targetGrid.innerHTML = '';
      if (filteredItems.length === 0) {
        targetGrid.innerHTML = `<div class="trending-empty-box"><p>Nenhum modelo do Top 25 Em Alta corresponde à busca "${escapeHtml(state.searchQuery)}".</p></div>`;
      } else {
        filteredItems.forEach(item => targetGrid.appendChild(createTrendingCard(item)));
      }
    } else {
      renderTrendingEmptyOrError(targetGrid, 'MakerWorld e MakerOnline', 'https://makerworld.com/pt/3d-models');
    }
  }
}

// Inicializar aplicação
window.addEventListener('DOMContentLoaded', init);

// Exposição para testes e interoperabilidade
window.appState = state;
window.state = state;
window.setPageSize = setPageSize;
window.goToPage = goToPage;
window.renderGallery = renderGallery;
window.renderFolderChips = renderFolderChips;
window.updateStatsBadge = updateStatsBadge;
window.setNavSection = setNavSection;
window.setTrendingRange = setTrendingRange;
window.loadAndRenderTrending = loadAndRenderTrending;
window.loadSampleModels = loadSampleModels;
window.getModelCacheKey = getModelCacheKey;
window.getCachedThumbnail = getCachedThumbnail;
window.saveCachedThumbnail = saveCachedThumbnail;
window.clearThumbnailCache = clearThumbnailCache;
window.openFoldersDB = openFoldersDB;
window.loadModelOnDemand = loadModelOnDemand;
window.openModelInSlicer = openModelInSlicer;
window.setSelectionMode = setSelectionMode;
window.toggleModelSelection = toggleModelSelection;
window.selectAllVisible = selectAllVisible;
window.toggleSelectAllVisible = toggleSelectAllVisible;
window.addCustomCoverCardToPicker = addCustomCoverCardToPicker;
window.clearSelection = clearSelection;
window.setSortOrder = setSortOrder;
window.sortModels = sortModels;
window.confirmCreateProject = confirmCreateProject;
window.dissolveCustomProject = dissolveCustomProject;
window.applyCustomProjects = applyCustomProjects;
window.openViewerModal = openViewerModal;
window.closeViewerModal = closeViewerModal;
window.openEditCardModal = openEditCardModal;
window.closeEditCardModal = closeEditCardModal;
window.showToast = showToast;


