const express  = require('express');
const multer   = require('multer');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const { login, register, changePassword, setPassword, logout, me } = require('../controllers/authController');
const { handleUpload }         = require('../controllers/uploadController');
const { getProducts, getProduct, updateProduct, getBrands, provisionProduct } = require('../controllers/productController');
const { getWorkers, createWorker, updateWorker, deleteWorker } = require('../controllers/workerController');
const { getClients, createClient, updateClient, deleteClient } = require('../controllers/clientController');
const { getProjects, getProject, createProject, updateProject,
        addProjectItem, removeProjectItem, deleteProject, adminApproval,
        getDraftNotifications, markReadyForReview } = require('../controllers/projectController');
const { getAllReservations, getProductDemand, updateReservedQty } = require('../controllers/reservationController');
const { getDiscounts, createDiscount, updateDiscount, deleteDiscount, bulkUpdateBrandDiscounts } = require('../controllers/discountController');
const { previewImport, createFromImport } = require('../controllers/pdfImportController');
const {
  getMyPendingRequests, getMySentRequests,
  createRequest, respondToRequest, deleteRequest,
  getEngineersOnProject,
} = require('../controllers/engineerRequestController');
const {
  getPanels, createPanel, updatePanel, deletePanel, togglePanelComplete,
  getDivisions, createDivision, updateDivision, deleteDivision,
  getManualProducts, createManualProduct, deleteManualProduct,
  getCrmItems, createCrmItem, updateCrmItem, deleteCrmItem,
  getProjectCrm, copyPanelFromProject, bulkUpdateItems, bulkReplaceItem,
} = require('../controllers/crmController');
const {
  getEngineerStats, getClientStats, getSummary, getProjectTeam,
} = require('../controllers/analyticsController');
const { getDashboard } = require('../controllers/dashboardController');
const { getActivityLogs } = require('../controllers/activityController');
const { uploadAttachment, getAttachments, downloadAttachment, deleteAttachment } = require('../controllers/attachmentController');
const { exportProducts, exportProjects, exportAnalytics, exportReservations, exportCrm } = require('../controllers/exportController');
const {
  getNotifications, markAsRead, markAllAsRead, deleteNotification,
} = require('../controllers/notificationController');
const {
  createPriceChangeRequest, getPendingRequests, approveRequest, rejectRequest, getMyRequests, getPendingForProject,
} = require('../controllers/priceChangeController');
const {
  getGroups, getGroup, createGroup, updateGroup, deleteGroup,
  getGroupItems, addGroupItem, removeGroupItem,
} = require('../controllers/itemGroupController');

const router = express.Router();
const storage = multer.memoryStorage();
const limits  = { fileSize: 20 * 1024 * 1024 };

const excelFilter = (req, file, cb) => {
  const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
  cb(null, allowed.includes(file.mimetype));
};
const pdfFilter = (req, file, cb) => {
  cb(null, file.mimetype === 'application/pdf');
};
const attachmentFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf', 'image/jpeg', 'image/png', 'image/gif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ];
  cb(null, allowed.includes(file.mimetype));
};
const uploadExcel = multer({ storage, limits, fileFilter: excelFilter });
const uploadPdf   = multer({ storage, limits, fileFilter: pdfFilter });
const uploadAttach = multer({ storage, limits, fileFilter: attachmentFilter });

// ── Health (public) ──────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Rate Limiter ──────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window per IP
  message: { error: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth (public) ────────────────────────────────────────────
router.post('/auth/login',           loginLimiter, validate('login'), login);
router.post('/auth/register',        requireAuth, requireRole('owner'), validate('register'), register);
router.post('/auth/change-password', requireAuth, changePassword);
router.post('/auth/set-password',    requireAuth, requireRole('owner'), setPassword);
router.get('/auth/me',               requireAuth, me);
router.post('/auth/logout',          requireAuth, logout);

// ── Upload (owner + accounting) ──────────────────────────────
router.post('/upload', requireAuth, requireRole('owner','accounting'), uploadExcel.single('file'), handleUpload);

// ── Products (all roles) ─────────────────────────────────────
router.get('/products',                   requireAuth, getProducts);
router.post('/products/provision',        requireAuth, requireRole('owner'), provisionProduct);
router.get('/products/:id',               requireAuth, getProduct);
router.patch('/products/:id',             requireAuth, requireRole('owner','accounting'), updateProduct);
router.get('/brands',                     requireAuth, getBrands);

// ── Discounts ────────────────────────────────────────────────
router.get('/discounts',                      requireAuth, getDiscounts);
router.post('/discounts',                     requireAuth, requireRole('owner','accounting'), validate('createDiscount'), createDiscount);
router.patch('/discounts/:id',                requireAuth, requireRole('owner','accounting'), updateDiscount);
router.delete('/discounts/:id',               requireAuth, requireRole('owner'), deleteDiscount);
router.post('/discounts/bulk-brand',          requireAuth, requireRole('owner'), bulkUpdateBrandDiscounts);

// ── Reservations tracker (all roles) ────────────────────────
router.get('/reservations',                    requireAuth, getAllReservations);
router.get('/reservations/product/:productId', requireAuth, getProductDemand);
router.patch('/reservations/product/:productId/reserved-qty', requireAuth, requireRole('owner','accounting','engineer'), updateReservedQty);

// ── Workers (owner only for write) ──────────────────────────
router.get('/workers',          requireAuth, getWorkers);
router.post('/workers',         requireAuth, requireRole('owner'), validate('createWorker'), createWorker);
router.patch('/workers/:id',    requireAuth, requireRole('owner'), updateWorker);
router.delete('/workers/:id',   requireAuth, requireRole('owner'), deleteWorker);

// ── Clients (owner + accounting + secretary) ─────────────────
router.get('/clients',          requireAuth, getClients);
router.post('/clients',         requireAuth, requireRole('owner','accounting','secretary','engineer'), validate('createClient'), createClient);
router.patch('/clients/:id',    requireAuth, requireRole('owner','accounting','secretary'), updateClient);
router.delete('/clients/:id',   requireAuth, requireRole('owner'), deleteClient);

// ── Projects (all roles read, owner+engineer write) ──────────
router.get('/projects',                      requireAuth, getProjects);
router.get('/projects/draft-notifications', requireAuth, getDraftNotifications);
router.get('/projects/:id',                  requireAuth, getProject);
router.post('/projects',                     requireAuth, requireRole('owner','engineer'), validate('createProject'), createProject);
router.post('/projects/import-pdf/preview',  requireAuth, requireRole('owner','engineer'), uploadPdf.single('file'), previewImport);
router.post('/projects/import-pdf/create',   requireAuth, requireRole('owner','engineer'), createFromImport);
router.patch('/projects/:id',                requireAuth, requireRole('owner','engineer'), updateProject);
router.patch('/projects/:id/admin-approval',   requireAuth, requireRole('owner'), adminApproval);
router.patch('/projects/:id/ready-for-review', requireAuth, requireRole('engineer','owner'), markReadyForReview);
router.delete('/projects/:id',               requireAuth, requireRole('owner'), deleteProject);
router.post('/projects/:id/items',           requireAuth, requireRole('owner','engineer'), addProjectItem);
router.delete('/projects/:id/items/:itemId', requireAuth, requireRole('owner','engineer'), removeProjectItem);

// ── CRM: Project Panels ─────────────────────────────────────
router.get('/projects/:projectId/crm',                     requireAuth, getProjectCrm);
router.get('/projects/:projectId/panels',                  requireAuth, getPanels);
router.post('/projects/:projectId/panels',                 requireAuth, requireRole('owner','engineer'), createPanel);
router.post('/projects/:projectId/panels/copy-from',       requireAuth, requireRole('owner','engineer'), copyPanelFromProject);
router.patch('/projects/:projectId/panels/:panelId',       requireAuth, requireRole('owner','engineer'), updatePanel);
router.patch('/projects/:projectId/panels/:panelId/complete', requireAuth, requireRole('owner','engineer'), togglePanelComplete);
router.delete('/projects/:projectId/panels/:panelId',      requireAuth, requireRole('owner','engineer'), deletePanel);

// ── CRM: Panel Divisions ────────────────────────────────────
router.get('/projects/:projectId/panels/:panelId/divisions',              requireAuth, getDivisions);
router.post('/projects/:projectId/panels/:panelId/divisions',             requireAuth, requireRole('owner','engineer'), createDivision);
router.patch('/projects/:projectId/panels/:panelId/divisions/:divisionId', requireAuth, requireRole('owner','engineer'), updateDivision);
router.delete('/projects/:projectId/panels/:panelId/divisions/:divisionId', requireAuth, requireRole('owner','engineer'), deleteDivision);

// ── CRM: Manual Products ─────────────────────────────────────
router.get('/projects/:projectId/manual-products',        requireAuth, getManualProducts);
router.post('/projects/:projectId/manual-products',       requireAuth, requireRole('owner','engineer'), createManualProduct);
router.delete('/projects/:projectId/manual-products/:productId', requireAuth, requireRole('owner','engineer'), deleteManualProduct);

// ── CRM: Items ───────────────────────────────────────────────
router.get('/projects/:projectId/panels/:panelId/divisions/:divisionId/items',        requireAuth, getCrmItems);
router.post('/projects/:projectId/panels/:panelId/divisions/:divisionId/items',       requireAuth, requireRole('owner','engineer'), createCrmItem);
router.patch('/projects/:projectId/panels/:panelId/divisions/:divisionId/items/:itemId', requireAuth, requireRole('owner','engineer'), updateCrmItem);
router.delete('/projects/:projectId/panels/:panelId/divisions/:divisionId/items/:itemId', requireAuth, requireRole('owner','engineer'), deleteCrmItem);
router.post('/projects/:projectId/items/bulk-update', requireAuth, requireRole('owner','engineer'), bulkUpdateItems);
router.post('/projects/:projectId/items/bulk-replace', requireAuth, requireRole('owner','engineer'), bulkReplaceItem);

// ── Engineer Collaboration Requests ──────────────────────────
router.get('/engineer-requests/pending',   requireAuth, getMyPendingRequests);
router.get('/engineer-requests/sent',      requireAuth, getMySentRequests);
router.post('/engineer-requests',          requireAuth, requireRole('owner','engineer'), createRequest);
router.patch('/engineer-requests/:requestId/respond', requireAuth, respondToRequest);
router.delete('/engineer-requests/:requestId', requireAuth, requireRole('owner','engineer'), deleteRequest);
router.get('/projects/:projectId/engineers', requireAuth, getEngineersOnProject);

// ── Analytics (owner only) ─────────────────────────────────
router.get('/analytics/summary',            requireAuth, requireRole('owner'), getSummary);
router.get('/analytics/engineers',          requireAuth, requireRole('owner'), getEngineerStats);
router.get('/analytics/clients',            requireAuth, requireRole('owner'), getClientStats);
router.get('/analytics/projects/:projectId/team', requireAuth, getProjectTeam);

// ── Dashboard (all authenticated) ──────────────────────────
router.get('/dashboard',                    requireAuth, getDashboard);

// ── Notifications ──────────────────────────────────────────
router.get('/notifications',                requireAuth, getNotifications);
router.patch('/notifications/:notificationId/read', requireAuth, markAsRead);
router.patch('/notifications/read-all',     requireAuth, markAllAsRead);
router.delete('/notifications/:notificationId', requireAuth, deleteNotification);

// ── Price Change Requests ─────────────────────────────────
router.post('/price-changes',               requireAuth, requireRole('owner','engineer'), createPriceChangeRequest);
router.get('/price-changes',                requireAuth, getPendingRequests);
router.get('/price-changes/my',             requireAuth, getMyRequests);
router.get('/price-changes/project/:projectId', requireAuth, getPendingForProject);
router.patch('/price-changes/:requestId/approve', requireAuth, requireRole('owner'), approveRequest);
router.patch('/price-changes/:requestId/reject',  requireAuth, requireRole('owner'), rejectRequest);

// ── Item Groups (reusable product sets) ────────────────────
router.get('/item-groups',              requireAuth, getGroups);
router.get('/item-groups/:id',          requireAuth, getGroup);
router.post('/item-groups',             requireAuth, requireRole('owner','engineer'), createGroup);
router.patch('/item-groups/:id',        requireAuth, requireRole('owner','engineer'), updateGroup);
router.delete('/item-groups/:id',       requireAuth, requireRole('owner','engineer'), deleteGroup);
router.get('/item-groups/:id/items',    requireAuth, getGroupItems);
router.post('/item-groups/:id/items',   requireAuth, requireRole('owner','engineer'), addGroupItem);
router.delete('/item-groups/:id/items/:itemId', requireAuth, requireRole('owner','engineer'), removeGroupItem);

// ── Execution Phase ──────────────────────────────────────────
const { getExecutionStatus, togglePanelExecution, toggleItemExecution } = require('../controllers/executionController');

router.get('/projects/:projectId/execution',                                 requireAuth, getExecutionStatus);
router.patch('/projects/:projectId/execution/panels/:panelId',               requireAuth, requireRole('owner','engineer'), togglePanelExecution);
router.patch('/projects/:projectId/execution/items/:itemId',                 requireAuth, requireRole('owner','engineer'), toggleItemExecution);

// ── Division Item Group Instances ──────────────────────────────
const {
  addGroupToDivision, updateGroupInstanceQuantity, removeGroupInstance, getDivisionGroupInstances
} = require('../controllers/divisionItemGroupController');

router.post('/projects/:projectId/panels/:panelId/divisions/:divisionId/group-instances',   requireAuth, requireRole('owner','engineer'), addGroupToDivision);
router.patch('/group-instances/:instanceId', requireAuth, requireRole('owner','engineer'), updateGroupInstanceQuantity);
router.delete('/group-instances/:instanceId', requireAuth, requireRole('owner','engineer'), removeGroupInstance);
router.get('/projects/:projectId/panels/:panelId/divisions/:divisionId/group-instances',    requireAuth, getDivisionGroupInstances);

// ── Manual Product Requests (engineer adds → owner approves) ─
const {
  createManualProductRequest, getManualProductRequests,
  approveManualProductRequest, rejectManualProductRequest,
} = require('../controllers/manualProductRequestController');

router.post('/manual-product-requests',          requireAuth, requireRole('owner','engineer'), createManualProductRequest);
router.get('/manual-product-requests',            requireAuth, getManualProductRequests);
router.patch('/manual-product-requests/:id/approve', requireAuth, requireRole('owner'), approveManualProductRequest);
router.patch('/manual-product-requests/:id/reject',  requireAuth, requireRole('owner'), rejectManualProductRequest);

// ── Activity Logs ───────────────────────────────────────────
router.get('/projects/:projectId/activity', requireAuth, getActivityLogs);

// ── File Attachments ────────────────────────────────────────
router.get('/projects/:projectId/attachments',            requireAuth, getAttachments);
router.post('/projects/:projectId/attachments',           requireAuth, requireRole('owner','engineer'), uploadAttach.single('file'), uploadAttachment);
router.get('/attachments/:attachmentId/download',         requireAuth, downloadAttachment);
router.delete('/projects/:projectId/attachments/:attachmentId', requireAuth, requireRole('owner','engineer'), deleteAttachment);

// ── CSV/Excel Export ───────────────────────────────────────
router.get('/export/products',    requireAuth, exportProducts);
router.get('/export/projects',    requireAuth, exportProjects);
router.get('/export/analytics',   requireAuth, requireRole('owner'), exportAnalytics);
router.get('/export/reservations', requireAuth, exportReservations);
router.get('/export/crm/:projectId', requireAuth, exportCrm);

// ── Messages / Announcements ────────────────────────────────
const { getMessages, createMessage, deleteMessage } = require('../controllers/messageController');

router.get('/messages',    requireAuth, getMessages);
router.post('/messages',   requireAuth, requireRole('owner','secretary'), createMessage);
router.delete('/messages/:id', requireAuth, deleteMessage);

module.exports = router;
