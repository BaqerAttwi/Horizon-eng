const express  = require('express');
const multer   = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');

const { login, register, changePassword, setPassword, me } = require('../controllers/authController');
const { handleUpload }         = require('../controllers/uploadController');
const { getProducts, getProduct, updateProduct, getBrands } = require('../controllers/productController');
const { getWorkers, createWorker, updateWorker, deleteWorker } = require('../controllers/workerController');
const { getClients, createClient, updateClient, deleteClient } = require('../controllers/clientController');
const { getProjects, getProject, createProject, updateProject,
        addProjectItem, removeProjectItem, deleteProject, adminApproval,
        getDraftNotifications, cleanupOldDeleted } = require('../controllers/projectController');
const { getAllReservations, getProductDemand } = require('../controllers/reservationController');
const { getDiscounts, createDiscount, updateDiscount, deleteDiscount } = require('../controllers/discountController');
const {
  getPanels, createPanel, updatePanel, deletePanel, togglePanelComplete,
  getDivisions, createDivision, updateDivision, deleteDivision,
  getManualProducts, createManualProduct, deleteManualProduct,
  getCrmItems, createCrmItem, updateCrmItem, deleteCrmItem,
  getProjectCrm,
} = require('../controllers/crmController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Health (public) ──────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Auth (public) ────────────────────────────────────────────
router.post('/auth/login',           login);
router.post('/auth/register',        requireAuth, requireRole('owner'), register);
router.post('/auth/change-password', requireAuth, changePassword);
router.post('/auth/set-password',    requireAuth, requireRole('owner'), setPassword);
router.get('/auth/me',               requireAuth, me);

// ── Upload (owner + accounting) ──────────────────────────────
router.post('/upload', requireAuth, requireRole('owner','accounting'), upload.single('file'), handleUpload);

// ── Products (all roles) ─────────────────────────────────────
router.get('/products',       requireAuth, getProducts);
router.get('/products/:id',   requireAuth, getProduct);
router.patch('/products/:id', requireAuth, requireRole('owner','accounting'), updateProduct);
router.get('/brands',         requireAuth, getBrands);

// ── Discounts ────────────────────────────────────────────────
router.get('/discounts',                      requireAuth, getDiscounts);
router.post('/discounts',                     requireAuth, requireRole('owner','accounting'), createDiscount);
router.patch('/discounts/:id',                requireAuth, requireRole('owner','accounting'), updateDiscount);
router.delete('/discounts/:id',               requireAuth, requireRole('owner'), deleteDiscount);

// ── Reservations tracker (all roles) ────────────────────────
router.get('/reservations',                    requireAuth, getAllReservations);
router.get('/reservations/product/:productId', requireAuth, getProductDemand);

// ── Workers (owner only for write) ──────────────────────────
router.get('/workers',          requireAuth, getWorkers);
router.post('/workers',         requireAuth, requireRole('owner'), createWorker);
router.patch('/workers/:id',    requireAuth, requireRole('owner'), updateWorker);
router.delete('/workers/:id',   requireAuth, requireRole('owner'), deleteWorker);

// ── Clients (owner + accounting + secretary) ─────────────────
router.get('/clients',          requireAuth, getClients);
router.post('/clients',         requireAuth, requireRole('owner','accounting','secretary'), createClient);
router.patch('/clients/:id',    requireAuth, requireRole('owner','accounting','secretary'), updateClient);
router.delete('/clients/:id',   requireAuth, requireRole('owner'), deleteClient);

// ── Projects (all roles read, owner+engineer write) ──────────
router.get('/projects',                      requireAuth, getProjects);
router.get('/projects/draft-notifications', requireAuth, getDraftNotifications);
router.post('/projects/cleanup-deleted',    requireAuth, requireRole('owner'), cleanupOldDeleted);
router.get('/projects/:id',                  requireAuth, getProject);
router.post('/projects',                     requireAuth, requireRole('owner','engineer'), createProject);
router.patch('/projects/:id',                requireAuth, requireRole('owner','engineer'), updateProject);
router.patch('/projects/:id/admin-approval', requireAuth, requireRole('owner'), adminApproval);
router.delete('/projects/:id',               requireAuth, requireRole('owner'), deleteProject);
router.post('/projects/:id/items',           requireAuth, requireRole('owner','engineer'), addProjectItem);
router.delete('/projects/:id/items/:itemId', requireAuth, requireRole('owner','engineer'), removeProjectItem);

// ── CRM: Project Panels ─────────────────────────────────────
router.get('/projects/:projectId/crm',                     requireAuth, getProjectCrm);
router.get('/projects/:projectId/panels',                  requireAuth, getPanels);
router.post('/projects/:projectId/panels',                 requireAuth, requireRole('owner','engineer'), createPanel);
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

module.exports = router;
