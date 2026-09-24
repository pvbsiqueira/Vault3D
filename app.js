import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { generateSTLThumbnail, extract3MFThumbnail, parse3MFGeometry } from './thumbnail-generator.js';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { parseSTL } from './stl-parser.js';
import { initAuth, getAuthenticatedUser } from './auth.js';

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
const folderPermissionModal = document.getElementById('folderPermissionModal');
const folderPermissionBackdrop = document.getElementById('folderPermissionBackdrop');
const btnCloseFolderPermissionModal = document.getElementById('btnCloseFolderPermissionModal');
const btnConfirmProceedFolder = document.getElementById('btnConfirmProceedFolder');
const chkDontShowFolderPermission = document.getElementById('chkDontShowFolderPermission');
const navAllModels = document.getElementById('navAllModels');
const navProjects = document.getElementById('navProjects');
const navFavorites = document.getElementById('navFavorites');
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

// Elementos DOM do Topbar & Filtros
const currentViewTitle = document.getElementById('currentViewTitle');
const currentViewSub = document.getElementById('currentViewSub');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.sidebar-format-btn, .pill-btn');
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
const modalInfoFormat = document.getElementById('modalInfoFormat');
const modalInfoSize = document.getElementById('modalInfoSize');
const modalInfoDimensions = document.getElementById('modalInfoDimensions');
const modalInfoDimensionsWrap = document.getElementById('modalInfoDimensionsWrap');
const modalInfoTriangles = document.getElementById('modalInfoTriangles');
const modalInfoTrianglesWrap = document.getElementById('modalInfoTrianglesWrap');
const btnCopyModalPath = document.getElementById('btnCopyModalPath');

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
      if (window.electronAPI.restartAndInstallUpdate) {
        window.electronAPI.restartAndInstallUpdate();
      }
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

// Inicialização de Eventos
function init() {
  // Monitorar atualizações automáticas no modo Desktop
  setupDesktopUpdater();

  if (btnSelectFolder) btnSelectFolder.addEventListener('click', handleChooseFolder);
  if (btnEmptySelectFolder) btnEmptySelectFolder.addEventListener('click', handleChooseFolder);
  if (folderInputFallback) folderInputFallback.addEventListener('change', handleFallbackFileSelect);
  if (btnLoadSample) btnLoadSample.addEventListener('click', loadSampleModels);

  // Eventos do Modal Informativo de Permissão de Pasta
  if (btnCloseFolderPermissionModal) {
    btnCloseFolderPermissionModal.addEventListener('click', closeFolderPermissionModal);
  }
  if (folderPermissionBackdrop) {
    folderPermissionBackdrop.addEventListener('click', closeFolderPermissionModal);
  }
  if (btnConfirmProceedFolder) {
    btnConfirmProceedFolder.addEventListener('click', () => {
      if (chkDontShowFolderPermission && chkDontShowFolderPermission.checked) {
        localStorage.setItem('hide_folder_permission_notice', 'true');
      }
      closeFolderPermissionModal();
      proceedWithDirectoryPicker();
    });
  }

  // Navegação da Barra Lateral (Todos / Projetos / Favoritos / Duplicados)
  [navAllModels, navProjects, navFavorites, navDuplicates].forEach(navBtn => {
    if (!navBtn) return;
    navBtn.addEventListener('click', () => {
      const section = navBtn.dataset.section || 'all';
      setNavSection(section);
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
  }
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
    if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
      closeViewerModal();
    }
  });

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
  if (modalFileName) {
    modalFileName.addEventListener('click', () => {
      copyModalFullPath();
    });
  }

  // Inicializar Autenticação com Supabase / Magic Link
  initAuth((user) => {
    // Restaurar biblioteca salva apenas quando usuário estiver autenticado
    checkAndRestoreSavedFolders();
  });

  // Resetar estado e visualização da biblioteca ao desconectar
  window.addEventListener('app:reset-library', () => {
    state.models = [];
    state.folders = [];
    state.currentPage = 1;
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
 * Alterna a seção ativa da biblioteca (Todos os Modelos, Projetos, Favoritos, Duplicados)
 */
function setNavSection(section) {
  state.activeSection = section;
  state.currentPage = 1;

  [navAllModels, navProjects, navFavorites, navDuplicates].forEach(btn => {
    if (btn) btn.classList.toggle('active', btn.dataset.section === section);
  });

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

function openFolderPermissionModal() {
  if (folderPermissionModal) {
    folderPermissionModal.style.display = 'flex';
  }
}

function closeFolderPermissionModal() {
  if (folderPermissionModal) {
    folderPermissionModal.style.display = 'none';
  }
}

/**
 * Ponto de entrada ao clicar em "Adicionar Pasta"
 * Se o aviso prévio não tiver sido ocultado pelo usuário, exibe a explicação primeiro
 */
async function handleChooseFolder() {
  const dontShow = localStorage.getItem('hide_folder_permission_notice') === 'true';
  if (dontShow) {
    proceedWithDirectoryPicker();
  } else {
    openFolderPermissionModal();
  }
}

/**
 * Executa a seleção da pasta no navegador
 */
async function proceedWithDirectoryPicker() {
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
  btnLoadSample.disabled = true;
  btnLoadSample.textContent = 'Carregando exemplos...';

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
    btnLoadSample.disabled = false;
    btnLoadSample.innerHTML = '✨ Testar com Modelos de Exemplo';
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
  return `${model.folderName || ''}:${model.path || model.name}:${model.size}:${lastMod}`;
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
      metadata: data.metadata || null,
      slicerData: data.slicerData || null,
      plates: data.plates || [],
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

    // Filtrar pastas válidas
    const validSaved = savedFolders.filter(f => f.isSample || (f.handle && typeof f.handle.queryPermission === 'function'));
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

    // Verificar se todas as pastas com handle já possuem permissão concedida
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
    } else if (f.handle) {
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
      isSample: folderName.includes('sample_models')
    });
  }

  // Acrescentar modelos ao acervo global
  state.models.push(...newModels);

  // Ordenar todos os modelos alfabeticamente (A-Z ocidentais primeiro, Kanjis/CJK ao final)
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  // Atualizar visualização para exibir a galeria
  dropZone.style.display = 'none';
  galleryContainer.style.display = 'block';

  renderFolderChips();
  updateStatsBadge();
  renderGallery();

  // Calcular impressões digitais e detectar duplicatas em background
  updateDuplicatesState();

  showToast(`Pasta "${folderName}" adicionada com ${newModels.length} modelo(s)!`, 'success');
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
  const stlCount = state.models.filter(m => m.type === 'stl').length;
  const tmfCount = state.models.filter(m => m.type === '3mf').length;
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

  if (fileCountBadge) {
    if (projectCount > 0) {
      fileCountBadge.textContent = `${totalItems} itens (${projectCount} projeto${projectCount === 1 ? '' : 's'}, ${totalFiles} arquivos)`;
    } else {
      fileCountBadge.textContent = `${totalFiles} modelo${totalFiles === 1 ? '' : 's'}`;
    }
  }

  if (sidebarStlCountBadge) {
    sidebarStlCountBadge.textContent = `${stlCount} STL`;
  }
  if (sidebar3mfCountBadge) {
    sidebar3mfCountBadge.textContent = `${tmfCount} 3MF`;
  }
  if (sidebarFoldersCountBadge) {
    sidebarFoldersCountBadge.textContent = foldersCount;
  }
  if (allFoldersBadge) {
    allFoldersBadge.textContent = foldersCount > 0 ? `(${totalFiles})` : '';
  }
  if (sidebarAllFoldersWrap) {
    sidebarAllFoldersWrap.style.display = foldersCount > 0 ? 'block' : 'none';
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

  // Se tiver FileSystemFileHandle, renomear fisicamente no disco
  if (model.handle) {
    try {
      // 1. Obter permissão de gravação se ainda não tiver
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

      // 2. Renomear o arquivo no sistema operacional
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
        throw new Error('Navegador não possui suporte nativo para mover arquivos.');
      }

      // 3. Atualizar o objeto File local
      if (typeof model.handle.getFile === 'function') {
        try {
          model.file = await model.handle.getFile();
        } catch (_) {}
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        showToast('Permissão de gravação negada. O arquivo não foi alterado.', 'warning');
        return false;
      }
      console.error('Erro ao renomear arquivo no disco:', err);
      showToast('Erro ao renomear no disco: ' + err.message, 'error');
      return false;
    }
  } else {
    // Modelos carregados sem FileSystemFileHandle (ex: sample_models ou fallback)
    showToast('Nome atualizado na tela (para renomear no disco, use a pasta aberta nativamente).', 'info');
  }

  // Se o modelo era favorito, atualizar o nome nos favoritos
  const favs = loadFavorites();
  if (favs.has(model.name)) {
    favs.delete(model.name);
    favs.add(newFullName);
    saveFavorites(favs);
  }

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

  // Se o modal estiver aberto exibindo este mesmo modelo, atualizar o título do modal
  if (state.activeModel && state.activeModel.id === model.id) {
    if (modalPathName) {
      modalPathName.textContent = newFullName;
    } else if (modalFileName) {
      modalFileName.textContent = newFullName;
    }
    if (modalFileName && model.fullDiskPath) {
      modalFileName.title = `${model.fullDiskPath} (Clique para copiar)`;
    }
  }

  // Reordenar a lista global após renomear
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  showToast(`Arquivo renomeado para "${newFullName}" com sucesso!`, 'success');
  return true;
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

    if (file) {
      if (!target._blobUrl) {
        target._blobUrl = URL.createObjectURL(file);
      }
      const blobUrl = target._blobUrl;

      // 1. DownloadURL nativo do Chromium para arrastar para a janela do fatiador ou Windows Explorer
      e.dataTransfer.setData('DownloadURL', `application/octet-stream:${fileName}:${blobUrl}`);

      // 2. DataTransfer Items para navegadores / Electron
      try {
        if (e.dataTransfer.items) {
          e.dataTransfer.items.add(file);
        }
      } catch (_) {}

      // 3. Fallback text/plain e URI list
      e.dataTransfer.setData('text/plain', fullPath || fileName);
      e.dataTransfer.setData('text/uri-list', blobUrl);
    } else if (fullPath) {
      e.dataTransfer.setData('text/plain', fullPath);
    }
  });

  element.addEventListener('dragend', () => {
    element.classList.remove('is-dragging');
  });
}

/**
 * Copia texto para a área de transferência de forma compatível com todos os navegadores.
 */
async function copyTextToClipboard(text) {
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
 * Copia o caminho completo do modelo 3D para a área de transferência do usuário,
 * permitindo colar instantaneamente no Fatiador (Ctrl+O -> Ctrl+V) ou no Windows Explorer.
 */
async function openModelInSlicer(model, buttonEl) {
  if (!model) return;
  if (!getAuthenticatedUser()) {
    showToast('Acesso restrito: faça login com Magic Link para copiar o caminho do modelo.', 'warning');
    return;
  }

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

  if (!targetModel) {
    showToast('Nenhum arquivo 3D encontrado.', 'warning');
    return;
  }

  const modelDisplayName = targetModel.name || targetModel.path || 'modelo 3D';

  try {
    // 2. Resolver o caminho completo do arquivo no disco
    const folderName = targetModel.folderName || '';
    const relPath = (targetModel.path || targetModel.name).replace(/\//g, '\\');

    let fullPath = targetModel.fullDiskPath;
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

    const textToCopy = fullPath || targetModel.name;

    // 3. Copiar para a área de transferência
    const copied = await copyTextToClipboard(textToCopy);
    if (!copied) {
      throw new Error('Permissão de cópia bloqueada pelo navegador');
    }

    // 4. Feedback visual no botão que foi clicado
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
        }
      }, 2200);
    }

    // 5. Toast orientativo e rápido
    showToast(`📋 Caminho copiado! Pressione Ctrl+V no seu fatiador ou Windows Explorer.`, 'success');

  } catch (err) {
    console.error('Erro ao copiar caminho do modelo:', err);
    showToast(`Não foi possível copiar o caminho: ${err.message}`, 'error');
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
          <button class="btn-open-slicer" title="Copiar caminho para colar no fatiador ou Windows Explorer" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copiar caminho</span>
          </button>
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
    }

    const btnDissolve = card.querySelector('.btn-dissolve-card');
    if (btnDissolve) {
      btnDissolve.addEventListener('click', (e) => {
        e.stopPropagation();
        dissolveCustomProject(model.customProjectId || model.id);
      });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-favorite') || e.target.closest('.btn-open-slicer') || e.target.closest('.btn-dissolve-card')) return;
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
        <button class="btn-card-rename" title="Renomear arquivo" aria-label="Renomear arquivo" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
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
        <div class="card-duplicate-info" title="Cópia de: ${escapeHtml(model.duplicateOrigins)}">
          <span class="card-duplicate-icon">⚠️</span>
          <span>Cópia de: <strong>${escapeHtml(model.duplicateOrigins)}</strong></span>
        </div>
      ` : ''}
      <div class="card-footer-actions">
        <div class="card-folder-info" title="Pasta: ${escapeHtml(folderInfo.full)}">
          <span class="card-folder-icon">📁</span>
          <span class="card-folder-name">${escapeHtml(folderInfo.name)}</span>
        </div>
        <button class="btn-open-slicer" title="Copiar caminho para colar no fatiador ou Windows Explorer" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copiar caminho</span>
        </button>
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
  }

  // Evento de Favoritar
  const btnFav = card.querySelector('.btn-favorite');
  if (btnFav) {
    btnFav.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(model);
    });
  }

  // Eventos de Renomear e Título
  const titleRow = card.querySelector('.card-title-row');

  const setupTitleRowEvents = () => {
    const btnRename = titleRow.querySelector('.btn-card-rename');
    const titleEl = titleRow.querySelector('.card-title');

    if (btnRename) {
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        enterRenameMode();
      });
    }

    if (titleEl) {
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enterRenameMode();
      });
    }
  };

  const enterRenameMode = () => {
    const curDot = model.name.lastIndexOf('.');
    const curExt = curDot !== -1 ? model.name.substring(curDot) : `.${model.type}`;
    const curBase = curDot !== -1 ? model.name.substring(0, curDot) : model.name;

    titleRow.innerHTML = `
      <div class="card-rename-box">
        <div class="card-rename-input-wrapper">
          <input type="text" class="card-rename-input" value="${escapeHtml(curBase)}" spellcheck="false" autocomplete="off" />
          <span class="card-rename-ext-locked" title="A extensão é protegida e não pode ser alterada">${escapeHtml(curExt)}</span>
        </div>
        <div class="card-rename-actions">
          <button class="btn-rename-action btn-rename-confirm" title="Salvar (Enter)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button class="btn-rename-action btn-rename-cancel" title="Cancelar (Esc)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;

    const renameBox = titleRow.querySelector('.card-rename-box');
    const input = titleRow.querySelector('.card-rename-input');
    const btnConfirm = titleRow.querySelector('.btn-rename-confirm');
    const btnCancel = titleRow.querySelector('.btn-rename-cancel');

    renameBox.addEventListener('click', (ev) => ev.stopPropagation());

    input.focus();
    input.select();

    let isSaving = false;

    const handleSave = async () => {
      if (isSaving) return;
      isSaving = true;
      const newBase = input.value;
      input.disabled = true;
      btnConfirm.disabled = true;
      btnCancel.disabled = true;

      const success = await renameModelFile(model, newBase);
      if (success) {
        renderGallery();
      } else {
        isSaving = false;
        input.disabled = false;
        btnConfirm.disabled = false;
        btnCancel.disabled = false;
        input.focus();
      }
    };

    const exitRenameMode = () => {
      const nextDot = model.name.lastIndexOf('.');
      const nextExt = nextDot !== -1 ? model.name.substring(nextDot) : `.${model.type}`;
      const nextBase = nextDot !== -1 ? model.name.substring(0, nextDot) : model.name;

      titleRow.innerHTML = `
        <div class="card-title" title="${escapeHtml(model.name)}" data-fullname="${escapeHtml(model.name)}">
          <span class="card-title-base">${escapeHtml(nextBase)}</span><span class="card-title-ext">${escapeHtml(nextExt)}</span>
        </div>
        <button class="btn-card-rename" title="Renomear arquivo" aria-label="Renomear arquivo" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>
      `;
      setupTitleRowEvents();
    };

    btnConfirm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleSave();
    });

    btnCancel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      exitRenameMode();
    });

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        handleSave();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        exitRenameMode();
      }
    });
  };

  setupTitleRowEvents();

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-rename-box') || e.target.closest('.btn-card-rename') || e.target.closest('.btn-favorite') || e.target.closest('.btn-open-slicer')) {
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

  const filtered = sortModels(filteredUnsorted, state.sortOrder);
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
      model.metadata = cached.metadata || null;
      model.slicerData = cached.slicerData || null;
      model.plates = cached.plates || [];
      updateCardThumbnail(model);
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

  // Checagem rápida antes de processar buffer pesado (se não estiver forçando extração de mesas)
  if (!forceExtractPlates) {
    try {
      const cached = await getCachedThumbnail(cacheKey);
      if (cached && cached.thumbnailUrl) {
        model.thumbnailUrl = cached.thumbnailUrl;
        model.metadata = cached.metadata || null;
        model.slicerData = cached.slicerData || null;
        model.plates = cached.plates || [];
        return;
      }
    } catch (_) {}
  }

  if (!model.file && model.handle && typeof model.handle.getFile === 'function') {
    model.file = await model.handle.getFile();
  }
  if (!model.file) {
    throw new Error('Arquivo não disponível');
  }

  const buffer = await model.file.arrayBuffer();

  if (model.type === 'stl') {
    const res = await generateSTLThumbnail(buffer);
    model.thumbnailUrl = res.thumbnailUrl;
    model.metadata = res.metadata;
  } else if (model.type === '3mf') {
    const res = await extract3MFThumbnail(buffer);
    model.thumbnailUrl = res.thumbnailUrl || model.thumbnailUrl;
    model.metadata = res.metadata;
    model.slicerData = res.slicerData;
    model.plates = res.plates || [];
  }

  // Salvar no cache persistente do IndexedDB
  if (model.thumbnailUrl) {
    saveCachedThumbnail(cacheKey, {
      thumbnailUrl: model.thumbnailUrl,
      metadata: model.metadata,
      slicerData: model.slicerData,
      plates: model.plates
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
      if (cardBody && !cardBody.querySelector('.card-slicer-info')) {
        const slicerDiv = document.createElement('div');
        slicerDiv.className = 'card-slicer-info';
        slicerDiv.innerHTML = `
          ${model.slicerData.printTimeFormatted ? `<span>⏱️ ${model.slicerData.printTimeFormatted}</span>` : ''}
          ${model.slicerData.filamentGrams ? `<span>🧵 ${model.slicerData.filamentGrams}g ${model.slicerData.filamentType || ''}</span>` : ''}
        `;
        const meta = cardBody.querySelector('.card-meta');
        if (meta) {
          cardBody.insertBefore(slicerDiv, meta);
        } else {
          cardBody.appendChild(slicerDiv);
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
 * Alterna entre a visualização 2D da Mesa de Impressão e o Visualizador 3D
 */
function setViewerMode(mode) {
  state.currentViewerMode = mode;

  const hasPlates = (state.activeProject && state.activeProject.plates && state.activeProject.plates.length > 0) ||
                    (state.activeModel && state.activeModel.plates && state.activeModel.plates.length > 0);

  if (mode === 'plate') {
    modalPlateImg.style.display = 'block';
    modalCanvas.style.display = 'none';
    viewerControlsBar.style.display = 'none';

    if (hasPlates) {
      if (btnOpen3DView) btnOpen3DView.style.display = 'inline-flex';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    } else {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    }
  } else {
    modalPlateImg.style.display = 'none';
    modalCanvas.style.display = 'block';
    viewerControlsBar.style.display = 'flex';

    if (hasPlates) {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'inline-flex';
    } else {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    }

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
  if (platesCount) platesCount.textContent = plates.length;

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
      <span class="plate-square-label" title="${escapeHtml(plate.fullName || plate.name)}">${escapeHtml(plate.name)}</span>
    `;

    card.addEventListener('click', () => {
      selectPlate(plate);
    });

    platesList.appendChild(card);

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

  // Atualizar estilo ativo nos cards quadrados
  document.querySelectorAll('.plate-square-card').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.plateId, 10) === plate.id);
  });

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
    if (modalFileName) modalFileName.title = `${model.fullDiskPath} (Clique para copiar)`;
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
    if (modalFileName) modalFileName.title = `${combined} (Clique para copiar)`;
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
  if (modalFileName) modalFileName.title = `${estimatedDir}${model.name} (Clique para copiar)`;

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
        if (modalFileName) modalFileName.title = `${data.fullPath} (Clique para copiar)`;
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
  state.activeModel = model;
  state.activePlate = null;
  state.activePlateId = 1;
  state.isMeshLoaded = false;

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
      modalDuplicateBadge.textContent = `⚠️ Cópia Duplicada (${model.duplicatesCount})`;
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
        modalDuplicateBadge.textContent = `⚠️ Cópias Duplicadas (${dupParts.length})`;
      } else {
        modalDuplicateBadge.style.display = 'none';
      }
    }

    if (modalSidebar) modalSidebar.style.display = 'flex';
    if (platesSection) platesSection.style.display = 'flex';
    if (modalSidebarInfo) modalSidebarInfo.style.display = 'none';

    renderPlatesList(model.plates);
    if (model.plates && model.plates.length > 0) {
      state.activePlateId = model.plates[0].id;
      selectPlate(model.plates[0]);
    }
    setViewerMode('plate');
    viewerModal.classList.add('active');
    return;
  }

  state.activeProject = null;

  modalBadge.textContent = model.type.toUpperCase();
  modalBadge.className = `badge-format ${model.type} format-${model.type}`;

  if (modalSidebar) modalSidebar.style.display = 'flex';

  // 4. Exibição imediata: se já possui mesas ou se é modelo convencional
  const hasPlates = model.plates && model.plates.length > 0;

  if (hasPlates) {
    if (platesSection) platesSection.style.display = 'flex';
    if (modalSidebarInfo) modalSidebarInfo.style.display = 'none';
    state.activePlateId = model.plates[0].id;
    renderPlatesList(model.plates);
    selectPlate(model.plates[0]);
    setViewerMode('plate');
  } else {
    // Modelo comum (sem mesas ou STL)
    if (platesSection) platesSection.style.display = 'none';
    if (modalSidebarInfo) {
      modalSidebarInfo.style.display = 'block';
      if (modalInfoFormat) modalInfoFormat.textContent = `.${model.type.toUpperCase()}`;
      if (modalInfoSize) modalInfoSize.textContent = formatBytes(model.size);
      if (modalInfoDimensions) {
        if (model.metadata?.dimensions) {
          modalInfoDimensions.textContent = `${Math.round(model.metadata.dimensions.x)} × ${Math.round(model.metadata.dimensions.y)} × ${Math.round(model.metadata.dimensions.z)} mm`;
          if (modalInfoDimensionsWrap) modalInfoDimensionsWrap.style.display = 'flex';
        } else {
          if (modalInfoDimensionsWrap) modalInfoDimensionsWrap.style.display = 'none';
        }
      }
      if (modalInfoTriangles) {
        if (model.metadata?.triangleCount) {
          modalInfoTriangles.textContent = model.metadata.triangleCount.toLocaleString('pt-BR');
          if (modalInfoTrianglesWrap) modalInfoTrianglesWrap.style.display = 'flex';
        } else {
          if (modalInfoTrianglesWrap) modalInfoTrianglesWrap.style.display = 'none';
        }
      }
    }

    // Se já tiver miniatura oficial de capa, exibe de imediato enquanto prepara 3D
    if (model.thumbnailUrl) {
      modalPlateImg.src = model.thumbnailUrl;
      modalPlateImg.style.display = 'block';
      if (modalCanvas) modalCanvas.style.display = 'none';
      if (viewerControlsBar) viewerControlsBar.style.display = 'none';
      if (btnOpen3DView) btnOpen3DView.style.display = 'inline-flex';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
      state.currentViewerMode = 'plate';
    } else {
      setViewerMode('3d');
    }
  }

  // Abre o modal na tela de imediato com dados e layout 100% visíveis
  viewerModal.classList.add('active');

  // 5. Se o arquivo for 3MF e não tiver mesas ou se faltar foto em alguma mesa, extrair mesas sob demanda em background
  const needsPlateExtraction = model.type === '3mf' && (
    !model.plates || 
    model.plates.length === 0 || 
    model.plates.some(p => !p.imageUrl && !p.isCustomCover)
  );

  if (!model.thumbnailUrl || needsPlateExtraction) {
    (async () => {
      try {
        await extractModelThumbnailAndMeta(model, needsPlateExtraction);
        updateCardThumbnail(model);

        // Se este mesmo modelo ainda estiver ativo no modal, atualiza os dados na tela
        if (state.activeModel && state.activeModel.id === model.id) {
          if (model.plates && model.plates.length > 0) {
            if (platesSection) platesSection.style.display = 'flex';
            if (modalSidebarInfo) modalSidebarInfo.style.display = 'none';
            renderPlatesList(model.plates);
            if (!state.activePlate) {
              selectPlate(model.plates[0]);
            }
          } else {
            if (modalInfoDimensions && model.metadata?.dimensions) {
              modalInfoDimensions.textContent = `${Math.round(model.metadata.dimensions.x)} × ${Math.round(model.metadata.dimensions.y)} × ${Math.round(model.metadata.dimensions.z)} mm`;
              if (modalInfoDimensionsWrap) modalInfoDimensionsWrap.style.display = 'flex';
            }
            if (modalInfoTriangles && model.metadata?.triangleCount) {
              modalInfoTriangles.textContent = model.metadata.triangleCount.toLocaleString('pt-BR');
              if (modalInfoTrianglesWrap) modalInfoTrianglesWrap.style.display = 'flex';
            }
          }
        }
      } catch (e) {
        console.warn('Erro ao extrair metadados e mesas do modelo em background:', e);
      }
    })();
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

  const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.8);
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
      color: 0x3b82f6,
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
    viewerLoadingOverlay.style.display = 'none';
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
  viewerModal.classList.remove('active');
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
  if (btnOpen3DView) btnOpen3DView.style.display = 'none';
  if (btnBackToPlate) btnBackToPlate.style.display = 'none';
  if (viewerControlsBar) viewerControlsBar.style.display = 'none';
  if (viewerLoadingOverlay) viewerLoadingOverlay.style.display = 'none';
}

// Utilitários
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
